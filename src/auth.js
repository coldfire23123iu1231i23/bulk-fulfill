import crypto from 'node:crypto';

const API_KEY = process.env.SHOPIFY_API_KEY || '';
const API_SECRET = process.env.SHOPIFY_API_SECRET || '';

export function embeddedConfigured() {
  return Boolean(API_KEY && API_SECRET);
}
export function apiKey() { return API_KEY; }

const b64urlDecode = (s) =>
  Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

/**
 * Kiem tra session token (ID token) App Bridge gui len.
 * Chuan Shopify: HS256 ky bang client secret, kiem exp / nbf / aud / iss-dest.
 * @returns {{shop:string, payload:object}}
 */
export function verifySessionToken(token) {
  if (!embeddedConfigured()) {
    throw new Error('Chua cau hinh SHOPIFY_API_KEY / SHOPIFY_API_SECRET');
  }
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('Session token sai dinh dang');
  const [h64, p64, s64] = parts;

  let header, payload;
  try {
    header = JSON.parse(b64urlDecode(h64).toString('utf8'));
    payload = JSON.parse(b64urlDecode(p64).toString('utf8'));
  } catch { throw new Error('Session token khong doc duoc'); }

  if (header.alg !== 'HS256') throw new Error(`Thuat toan khong ho tro: ${header.alg}`);

  const expected = crypto.createHmac('sha256', API_SECRET)
    .update(`${h64}.${p64}`).digest();
  const got = b64urlDecode(s64);
  if (expected.length !== got.length || !crypto.timingSafeEqual(expected, got)) {
    throw new Error('Chu ky session token khong hop le');
  }

  const now = Math.floor(Date.now() / 1000);
  const skew = 10; // cho phep lech dong ho 10s
  if (typeof payload.exp !== 'number' || payload.exp + skew < now) {
    throw new Error('Session token het han');
  }
  if (typeof payload.nbf === 'number' && payload.nbf - skew > now) {
    throw new Error('Session token chua co hieu luc');
  }
console.log('AUTH_AUDIENCE_CHECK', JSON.stringify({
  expectedClientId: API_KEY,
  tokenAudience: payload.aud,
  audienceIsArray: Array.isArray(payload.aud)
}));
  if (payload.aud !== API_KEY) throw new Error('Session token khong danh cho app nay');

  const host = (u) => { try { return new URL(u).host; } catch { return ''; } };
  const issHost = host(payload.iss);
  const destHost = host(payload.dest);
  if (!issHost || !destHost || issHost !== destHost) {
    throw new Error('Session token co iss/dest khong khop');
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/.test(destHost)) {
    throw new Error('Shop trong session token khong hop le');
  }

  return { shop: destHost, payload };
}

/**
 * Doi session token lay offline access token (token exchange).
 * Thay cho luong OAuth redirect cu.
 */
export async function exchangeToken(shop, sessionToken) {
  const res = await fetch(`https://${shop}/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      client_id: API_KEY,
      client_secret: API_SECRET,
      grant_type: 'urn:ietf:params:oauth:grant-type:token-exchange',
      subject_token: sessionToken,
      subject_token_type: 'urn:ietf:params:oauth:token-type:id_token',
      requested_token_type: 'urn:shopify:params:oauth:token-type:offline-access-token',
    }),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Doi token that bai (HTTP ${res.status}): ${text.slice(0, 200)}`);
  }
  let data;
  try { data = JSON.parse(text); }
  catch { throw new Error('Shopify tra ve du lieu token khong hop le'); }
  if (!data.access_token) throw new Error('Shopify khong tra ve access_token');
  return { accessToken: data.access_token, scope: data.scope };
}

/* -------- Cache access token theo shop (trong bo nho) -------- */
const tokenCache = new Map();

export async function accessTokenFor(shop, sessionToken) {
  // Neu da co token Custom App trong env thi dung luon, khoi doi
  if (process.env.SHOPIFY_ACCESS_TOKEN) return process.env.SHOPIFY_ACCESS_TOKEN;

  const hit = tokenCache.get(shop);
  if (hit) return hit.accessToken;

  const fresh = await exchangeToken(shop, sessionToken);
  tokenCache.set(shop, fresh);
  return fresh.accessToken;
}

export function forgetToken(shop) { tokenCache.delete(shop); }
export function cachedShops() { return [...tokenCache.keys()]; }
