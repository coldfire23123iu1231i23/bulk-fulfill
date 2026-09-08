import test from 'node:test';
import assert from 'node:assert/strict';
process.env.PORT = '0';
const { buildOrderQuery } = await import('../src/server.js');

test('query mac dinh chi lay don mo, chua fulfill', () => {
  const q = buildOrderQuery({});
  assert.match(q, /status:open/);
  assert.match(q, /fulfillment_status:unfulfilled OR fulfillment_status:partial/);
  assert.doesNotMatch(q, /financial_status/);
});

test('loc theo ngay va da thanh toan', () => {
  const q = buildOrderQuery({ paidOnly: true, from: '2026-08-01', to: '2026-09-08' });
  assert.match(q, /financial_status:paid/);
  assert.match(q, /created_at:>=2026-08-01/);
  assert.match(q, /created_at:<=2026-09-08T23:59:59Z/);
});

test('tim theo so don, bo dau # va them wildcard prefix', () => {
  const q = buildOrderQuery({ search: '#1042' });
  assert.match(q, /name:1042\*/);
  assert.match(q, /name:#1042/);
  assert.doesNotMatch(q, /\*1042\*/, 'khong duoc dung leading wildcard');
});

test('tim theo email va sku', () => {
  const q = buildOrderQuery({ search: 'abc@mail.com' });
  assert.match(q, /email:abc@mail\.com\*/);
  assert.match(q, /sku:abc@mail\.com/);
});

test('loai bo ky tu pha query', () => {
  const q = buildOrderQuery({ search: 'a"b)c(' });
  assert.doesNotMatch(q, /"/);
  assert.match(q, /name:abc\*/);
});
