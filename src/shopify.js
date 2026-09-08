const SHOP = (process.env.SHOPIFY_SHOP || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
const TOKEN = process.env.SHOPIFY_ACCESS_TOKEN || '';
const VERSION = process.env.SHOPIFY_API_VERSION || '2026-07';

export function shopifyConfigured() {
  return Boolean(SHOP && TOKEN);
}
export function shopInfo() {
  return { shop: SHOP, apiVersion: VERSION };
}

const ENDPOINT = (shop) => `https://${shop}/admin/api/${VERSION}/graphql.json`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Loi 401/403 tu Shopify - de tang tren biet ma xoa cache token */
export class ShopifyAuthError extends Error {
  constructor(msg) { super(msg); this.name = 'ShopifyAuthError'; this.unauthorized = true; }
}

/**
 * Goi Shopify Admin GraphQL, tu retry khi bi throttle (429 / THROTTLED).
 * @param {object} ctx {shop, accessToken} - bo trong thi dung bien moi truong
 */
export async function gql(query, variables = {}, { retries = 4, shop, accessToken } = {}) {
  const useShop = shop || SHOP;
  const useToken = accessToken || TOKEN;
  if (!useShop || !useToken) {
    throw new Error('Chua co shop hoac access token de goi Shopify');
  }

  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    let res;
    try {
      res = await fetch(ENDPOINT(useShop), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Shopify-Access-Token': useToken,
        },
        body: JSON.stringify({ query, variables }),
      });
    } catch (e) {
      lastErr = new Error(`Khong ket noi duoc Shopify: ${e.message}`);
      await sleep(500 * (attempt + 1));
      continue;
    }

    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get('retry-after') || 1) * 1000 || 1000;
      lastErr = new Error(`Shopify tra ve HTTP ${res.status}`);
      await sleep(wait + attempt * 500);
      continue;
    }

    if (res.status === 401 || res.status === 403) {
      throw new ShopifyAuthError(
        'Token Shopify sai hoac thieu quyen. Kiem tra scope read_orders / write_merchant_managed_fulfillment_orders (hoac cai lai app vao store).'
      );
    }

    const text = await res.text();
    let body;
    try { body = JSON.parse(text); }
    catch { throw new Error(`Shopify tra ve du lieu khong hop le (HTTP ${res.status}): ${text.slice(0, 200)}`); }

    if (body.errors?.length) {
      const throttled = body.errors.some((e) => e.extensions?.code === 'THROTTLED');
      if (throttled && attempt < retries) {
        const cost = body.extensions?.cost?.throttleStatus;
        const need = (cost?.currentlyAvailable ?? 0) < 50 ? 1200 : 600;
        await sleep(need + attempt * 400);
        lastErr = new Error('Bi gioi han toc do (throttled)');
        continue;
      }
      throw new Error(body.errors.map((e) => e.message).join(' | '));
    }

    return body.data;
  }
  throw lastErr || new Error('Goi Shopify that bai');
}

export const ORDERS_QUERY = /* GraphQL */ `
  query UnfulfilledOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: CREATED_AT, reverse: true) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id
        name
        createdAt
        email
        note
        displayFulfillmentStatus
        displayFinancialStatus
        tags
        shippingLine { title code carrierIdentifier }
        customer { firstName lastName }
        shippingAddress {
          name address1 city provinceCode countryCodeV2 zip phone
        }
        fulfillmentOrders(first: 10) {
          nodes {
            id
            status
            requestStatus
            supportedActions { action }
            assignedLocation { name }
            deliveryMethod { methodType }
            lineItems(first: 50) {
              nodes {
                id
                remainingQuantity
                lineItem {
                  id
                  title
                  variantTitle
                  sku
                  image { url(transform: { maxWidth: 80, maxHeight: 80 }) }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export const FULFILL_MUTATION = /* GraphQL */ `
  mutation BulkFulfill($fulfillment: FulfillmentInput!) {
    fulfillmentCreate(fulfillment: $fulfillment) {
      fulfillment {
        id
        status
        trackingInfo { company number url }
        order { id name displayFulfillmentStatus }
      }
      userErrors { field message }
    }
  }
`;

/** Chuyen node order tu GraphQL thanh dang gon cho UI */
export function shapeOrder(node, shop = SHOP) {
  const fos = (node.fulfillmentOrders?.nodes || []).filter(
    (fo) =>
      ['OPEN', 'IN_PROGRESS', 'SCHEDULED'].includes(fo.status) &&
      (fo.supportedActions || []).some((a) => a.action === 'CREATE_FULFILLMENT') &&
      (fo.lineItems?.nodes || []).some((li) => li.remainingQuantity > 0)
  );
  if (!fos.length) return null;

  const items = [];
  for (const fo of fos) {
    for (const li of fo.lineItems?.nodes || []) {
      if (li.remainingQuantity <= 0) continue;
      items.push({
        title: li.lineItem?.title || '',
        variantTitle: li.lineItem?.variantTitle || '',
        sku: li.lineItem?.sku || '',
        qty: li.remainingQuantity,
        image: li.lineItem?.image?.url || null,
      });
    }
  }

  const addr = node.shippingAddress || {};
  return {
    id: node.id,
    name: node.name,
    createdAt: node.createdAt,
    email: node.email,
    note: node.note,
    tags: node.tags || [],
    fulfillmentStatus: node.displayFulfillmentStatus,
    financialStatus: node.displayFinancialStatus,
    shippingMethod: node.shippingLine?.title || '',
    shippingCode: node.shippingLine?.code || '',
    customer: [node.customer?.firstName, node.customer?.lastName].filter(Boolean).join(' ') || addr.name || '',
    address: {
      name: addr.name || '',
      line1: addr.address1 || '',
      city: addr.city || '',
      province: addr.provinceCode || '',
      country: addr.countryCodeV2 || '',
      zip: addr.zip || '',
      phone: addr.phone || '',
    },
    location: fos[0]?.assignedLocation?.name || '',
    fulfillmentOrderIds: fos.map((f) => f.id),
    items,
    itemCount: items.reduce((s, i) => s + i.qty, 0),
    adminUrl: `https://admin.shopify.com/store/${String(shop).replace('.myshopify.com', '')}/orders/${node.id.split('/').pop()}`,
  };
}
