import express from 'express';
import cookieParser from 'cookie-parser';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
import {
  gql, ORDERS_QUERY, FULFILL_MUTATION, shapeOrder,
  shopifyConfigured, shopInfo, ShopifyAuthError,
} from './shopify.js';
import {
  verifySessionToken, accessTokenFor, forgetToken,
  embeddedConfigured, apiKey,
} from './auth.js';
import { detectCarrier, normalizeTracking, SHOPIFY_CARRIERS } from './carriers.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;
const APP_PASSWORD = process.env.APP_PASSWORD || '';
const DEFAULT_NOTIFY = String(process.env.DEFAULT_NOTIFY_CUSTOMER ?? 'true') === 'true';

app.set('trust proxy', 1);
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

/* ---------------- Cho phep nhung trong Shopify Admin ----------------
   Shopify Admin load app trong iframe, nen phai khai bao frame-ancestors
   va KHONG duoc gui X-Frame-Options. */
app.use((req, res, next) => {
  const shop = String(req.query.shop || '').trim();
  const ok = /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(shop);
  res.removeHeader('X-Frame-Options');
  res.setHeader(
    'Content-Security-Policy',
    `frame-ancestors ${ok ? `https://${shop} ` : ''}https://admin.shopify.com https://*.myshopify.com;`
  );
  next();
});

/* ---------------- Auth ---------------- */
const SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');
const sign = (v) => crypto.createHmac('sha256', SECRET).update(v).digest('hex');
const COOKIE = 'bf_session';

function issueCookie(res) {
  const v = String(Date.now());
  res.cookie(COOKIE, `${v}.${sign(v)}`, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    maxAge: 1000 * 60 * 60 * 12,
  });
}
function isAuthed(req) {
  if (!APP_PASSWORD) return true; // khong dat mat khau -> mo (chi nen dung khi test local)
  const raw = req.cookies?.[COOKIE];
  if (!raw) return false;
  const [v, sig] = raw.split('.');
  if (!v || !sig) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(sign(v)));
  } catch { return false; }
}
/**
 * Hai duong vao:
 *  A. Nhung trong Shopify Admin -> header Authorization: Bearer <session token App Bridge>
 *  B. Mo bang link Railway -> cookie phien sau khi nhap mat khau
 */
async function requireAuth(req, res, next) {
  const bearer = (req.headers.authorization || '').match(/^Bearer\s+(.+)$/i);

  if (bearer) {
    try {
      const { shop } = verifySessionToken(bearer[1]);
      req.shop = shop;
      req.sessionToken = bearer[1];
      req.accessToken = await accessTokenFor(shop, bearer[1]);
      req.embedded = true;
      return next();
    } catch (e) {
      // Bao App Bridge lay token moi roi thu lai
      res.setHeader('X-Shopify-Retry-Invalid-Session-Request', '1');
      return res.status(401).json({ error: e.message });
    }
  }

  if (isAuthed(req)) {
    req.shop = shopInfo().shop;
    req.accessToken = process.env.SHOPIFY_ACCESS_TOKEN || '';
    req.embedded = false;
    return next();
  }
  res.status(401).json({ error: 'Chua dang nhap' });
}

/** Goi Shopify bang danh tinh cua request hien tai */
async function callShopify(req, query, variables) {
  try {
    return await gql(query, variables, { shop: req.shop, accessToken: req.accessToken });
  } catch (e) {
    if (e instanceof ShopifyAuthError && req.embedded) {
      // Token cache co the da bi thu hoi -> xoa, doi lai roi thu them mot lan
      forgetToken(req.shop);
      const fresh = await accessTokenFor(req.shop, req.sessionToken);
      return await gql(query, variables, { shop: req.shop, accessToken: fresh });
    }
    throw e;
  }
}

app.post('/api/login', (req, res) => {
  const pw = String(req.body?.password || '');
  if (!APP_PASSWORD) { issueCookie(res); return res.json({ ok: true }); }
  const a = Buffer.from(crypto.createHash('sha256').update(pw).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(APP_PASSWORD).digest('hex'));
  if (!crypto.timingSafeEqual(a, b)) {
    return res.status(401).json({ error: 'Sai mat khau' });
  }
  issueCookie(res);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });

app.get('/api/session', (req, res) => {
  res.json({
    authed: isAuthed(req),
    passwordRequired: Boolean(APP_PASSWORD),
    shopifyConfigured: shopifyConfigured(),
    embeddedReady: embeddedConfigured(),
    shop: shopifyConfigured() ? shopInfo().shop : null,
    defaultNotify: DEFAULT_NOTIFY,
    carriers: SHOPIFY_CARRIERS,
  });
});

app.get('/healthz', (_req, res) => res.json({ ok: true, uptime: process.uptime() }));

/* ---------------- Danh sach don chua fulfill ---------------- */

/**
 * Dung chuoi tim kiem cho Shopify order search.
 * Luu y: Shopify chi ho tro wildcard dang "prefix*", KHONG ho tro "*giua*".
 */
export function buildOrderQuery({ search = '', paidOnly = false, from = '', to = '' } = {}) {
  const parts = ['status:open', '(fulfillment_status:unfulfilled OR fulfillment_status:partial)'];
  if (paidOnly) parts.push('financial_status:paid');
  if (from) parts.push(`created_at:>=${from}`);
  if (to) parts.push(`created_at:<=${to}T23:59:59Z`);

  const term = String(search || '').trim().replace(/^#/, '').replace(/["\\()]/g, '');
  if (term) {
    const clauses = [`name:${term}*`, `email:${term}*`, `sku:${term}`];
    if (/^\d+$/.test(term)) clauses.push(`name:#${term}`);
    parts.push(`(${clauses.join(' OR ')})`);
  }
  return parts.join(' AND ');
}

app.get('/api/orders', requireAuth, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const after = req.query.cursor || null;
    const search = String(req.query.search || '').trim();

    const searchQuery = buildOrderQuery({
      search,
      paidOnly: req.query.paidOnly === 'true',
      from: req.query.from,
      to: req.query.to,
    });

    const data = await callShopify(req, ORDERS_QUERY, { first: limit, after, query: searchQuery });
    const conn = data.orders;
    const orders = (conn.nodes || []).map((n) => shapeOrder(n, req.shop)).filter(Boolean);

    res.json({
      orders,
      pageInfo: conn.pageInfo,
      queryUsed: searchQuery,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ---------------- Doan carrier ---------------- */
app.post('/api/detect', requireAuth, (req, res) => {
  const list = Array.isArray(req.body?.numbers) ? req.body.numbers : [];
  res.json({ results: list.map((n) => ({ number: n, ...detectCarrier(n) })) });
});

/* ---------------- Bulk fulfill ---------------- */
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.post('/api/fulfill', requireAuth, async (req, res) => {
  const rows = Array.isArray(req.body?.rows) ? req.body.rows : [];
  if (!rows.length) return res.status(400).json({ error: 'Khong co dong nao duoc chon' });
  if (rows.length > 250) return res.status(400).json({ error: 'Toi da 250 don moi lan' });

  const results = [];
  for (const row of rows) {
    const orderName = row.orderName || row.fulfillmentOrderIds?.[0] || '?';
    const numbers = String(row.tracking || '')
      .split(/[,\n;]+/).map(normalizeTracking).filter(Boolean);

    if (!numbers.length) {
      results.push({ orderName, ok: false, error: 'Chua nhap ma tracking' });
      continue;
    }

    const company = row.company || detectCarrier(numbers[0]).company || 'Other';
    const foIds = Array.isArray(row.fulfillmentOrderIds) ? row.fulfillmentOrderIds : [];
    if (!foIds.length) {
      results.push({ orderName, ok: false, error: 'Don khong con fulfillment order de fulfill' });
      continue;
    }

    const trackingInfo = numbers.length > 1
      ? { company, numbers }
      : { company, number: numbers[0] };

    try {
      // Moi fulfillment order (moi location) tao 1 fulfillment rieng
      const perFo = [];
      for (const foId of foIds) {
        const data = await callShopify(req, FULFILL_MUTATION, {
          fulfillment: {
            lineItemsByFulfillmentOrder: [{ fulfillmentOrderId: foId }],
            trackingInfo,
            notifyCustomer: row.notifyCustomer ?? DEFAULT_NOTIFY,
          },
        });
        const out = data.fulfillmentCreate;
        if (out.userErrors?.length) {
          perFo.push({ ok: false, error: out.userErrors.map((u) => u.message).join('; ') });
        } else {
          perFo.push({
            ok: true,
            fulfillmentId: out.fulfillment?.id,
            status: out.fulfillment?.status,
            trackingUrl: out.fulfillment?.trackingInfo?.[0]?.url || null,
            newStatus: out.fulfillment?.order?.displayFulfillmentStatus,
          });
        }
        await sleep(300); // giu nhip, tranh throttle
      }

      const failed = perFo.filter((p) => !p.ok);
      results.push(
        failed.length
          ? { orderName, ok: false, company, error: failed.map((f) => f.error).join(' | ') }
          : {
              orderName, ok: true, company, tracking: numbers.join(', '),
              trackingUrl: perFo[0].trackingUrl,
              newStatus: perFo[perFo.length - 1].newStatus,
            }
      );
    } catch (e) {
      results.push({ orderName, ok: false, company, error: e.message });
    }
  }

  res.json({
    results,
    summary: {
      total: results.length,
      success: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
    },
  });
});

/* ---------------- Static ---------------- */
const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const INDEX_SRC = fs.readFileSync(path.join(PUBLIC_DIR, 'index.html'), 'utf8');

/** Tra index.html da chen client id de App Bridge dung duoc */
function sendIndex(_req, res) {
  res.type('html').send(INDEX_SRC.replaceAll('%SHOPIFY_API_KEY%', apiKey()));
}

app.get(['/', '/index.html'], sendIndex);
app.use(express.static(PUBLIC_DIR, { index: false }));
app.get('*', sendIndex);

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

export { app };

if (isMain) app.listen(PORT, () => {
  console.log(`Bulk Fulfill dang chay tren cong ${PORT}`);
  console.log(`Shopify: ${shopifyConfigured() ? shopInfo().shop + ' (API ' + shopInfo().apiVersion + ')' : 'CHUA CAU HINH'}`);
  if (!APP_PASSWORD) console.warn('CANH BAO: chua dat APP_PASSWORD -> app mo cong khai!');
});
