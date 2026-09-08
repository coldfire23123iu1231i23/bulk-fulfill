/* Server chay voi du lieu gia de xem giao dien, khong goi Shopify that */
process.env.SHOPIFY_SHOP = 'b8t7nn-dr.myshopify.com';
process.env.SHOPIFY_ACCESS_TOKEN = 'shpat_mock';
process.env.APP_PASSWORD = '';
process.env.SHOPIFY_API_KEY = 'test-client-id';
process.env.SHOPIFY_API_SECRET = 'test-client-secret';
process.env.PORT = process.env.PORT || '3999';

const mkOrder = (i, opts = {}) => ({
  id: `gid://shopify/Order/50${i}`,
  name: `#${1040 + i}`,
  createdAt: new Date(Date.now() - i * 86400000).toISOString(),
  email: `khach${i}@gmail.com`,
  note: null,
  displayFulfillmentStatus: opts.partial ? 'PARTIALLY_FULFILLED' : 'UNFULFILLED',
  displayFinancialStatus: 'PAID',
  tags: [],
  shippingLine: { title: opts.ship || 'Standard Shipping (5-8 days)', code: 'STD', carrierIdentifier: null },
  customer: { firstName: ['Sarah','Michael','Jessica','David','Emily'][i % 5], lastName: ['Johnson','Chen','Miller','Brooks','Davis'][i % 5] },
  shippingAddress: { name: 'Sarah Johnson', address1: '412 Maple Ave', city: ['Austin','Denver','Tampa','Boise','Akron'][i % 5],
    provinceCode: ['TX','CO','FL','ID','OH'][i % 5], countryCodeV2: 'US', zip: `7870${i}`, phone: '+15125550187' },
  fulfillmentOrders: { nodes: [{
    id: `gid://shopify/FulfillmentOrder/90${i}`,
    status: 'OPEN', requestStatus: 'UNSUBMITTED',
    supportedActions: [{ action: 'CREATE_FULFILLMENT' }],
    assignedLocation: { name: 'Loom Custom Warehouse' },
    deliveryMethod: { methodType: 'SHIPPING' },
    lineItems: { nodes: (opts.items || [
      { t: 'Personalized Family Name Wooden Plaque', v: '12" / Walnut', s: 'PLQ-WAL-12', q: 1 },
    ]).map((it, k) => ({
      id: `gid://shopify/FulfillmentOrderLineItem/${i}${k}`,
      remainingQuantity: it.q,
      lineItem: { id: `gid://shopify/LineItem/${i}${k}`, title: it.t, variantTitle: it.v, sku: it.s, image: null },
    })) },
  }] },
});

const ORDERS = [
  mkOrder(1),
  mkOrder(2, { items: [
    { t: 'Custom Pet Portrait Acrylic Standee', v: 'Medium / Clear', s: 'STD-ACR-M', q: 2 },
    { t: 'Personalized Garden Stake', v: 'Single', s: 'GST-01', q: 1 }] }),
  mkOrder(3, { ship: 'Express Shipping (2-3 days)' }),
  mkOrder(4, { partial: true, items: [{ t: 'Custom Door Hanger — Welcome Sign', v: 'Round / 18"', s: 'DHG-RND-18', q: 3 }] }),
  mkOrder(5, { items: [{ t: 'Personalized Memorial Wind Chime', v: 'Bronze', s: 'WCH-BRZ', q: 1 }] }),
];

const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  if (String(url).includes('/admin/api/')) {
    const body = JSON.parse(init.body);
    if (body.query.includes('UnfulfilledOrders')) {
      return new Response(JSON.stringify({ data: { orders: {
        pageInfo: { hasNextPage: true, endCursor: 'abc123' }, nodes: ORDERS } } }),
        { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
    if (body.query.includes('BulkFulfill')) {
      const num = body.variables.fulfillment.trackingInfo.number || body.variables.fulfillment.trackingInfo.numbers?.[0];
      const fail = String(num).startsWith('999');
      return new Response(JSON.stringify({ data: { fulfillmentCreate: {
        fulfillment: fail ? null : { id: 'gid://shopify/Fulfillment/1', status: 'SUCCESS',
          trackingInfo: [{ company: body.variables.fulfillment.trackingInfo.company, number: num, url: 'https://tools.usps.com/go/TrackConfirmAction?tLabels=' + num }],
          order: { id: 'x', name: '#1041', displayFulfillmentStatus: 'FULFILLED' } },
        userErrors: fail ? [{ field: ['trackingInfo'], message: 'Ma tracking khong hop le' }] : [],
      } } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }
  }
  return realFetch(url, init);
};

const { app } = await import('../src/server.js');
app.listen(process.env.PORT, () => console.log('MOCK server: http://localhost:' + process.env.PORT));
