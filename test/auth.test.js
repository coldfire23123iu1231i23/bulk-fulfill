import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.SHOPIFY_API_KEY = 'test-client-id';
process.env.SHOPIFY_API_SECRET = 'test-client-secret';
const { verifySessionToken, embeddedConfigured } = await import('../src/auth.js');

const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function makeToken(payload, secret = 'test-client-secret', header = { alg: 'HS256', typ: 'JWT' }) {
  const h = b64(header), p = b64(payload);
  const sig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
  return `${h}.${p}.${sig}`;
}
const now = () => Math.floor(Date.now() / 1000);
const good = (over = {}) => ({
  iss: 'https://loom-custom.myshopify.com/admin',
  dest: 'https://loom-custom.myshopify.com',
  aud: 'test-client-id',
  sub: '42', exp: now() + 60, nbf: now() - 5, iat: now() - 5,
  jti: 'x', sid: 'y', ...over,
});

test('da cau hinh embedded', () => assert.ok(embeddedConfigured()));

test('token hop le -> lay dung shop', () => {
  const { shop } = verifySessionToken(makeToken(good()));
  assert.equal(shop, 'loom-custom.myshopify.com');
});

test('sai chu ky -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good(), 'secret-khac')), /Chu ky/);
});

test('het han -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good({ exp: now() - 120 }))), /het han/);
});

test('chua co hieu luc -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good({ nbf: now() + 300 }))), /chua co hieu luc/);
});

test('aud khac client id -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good({ aud: 'app-khac' }))), /khong danh cho app nay/);
});

test('iss va dest khac shop -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good({ dest: 'https://shop-la.myshopify.com' }))), /iss\/dest/);
});

test('domain khong phai myshopify -> tu choi', () => {
  assert.throws(() => verifySessionToken(makeToken(good({
    iss: 'https://evil.com/admin', dest: 'https://evil.com' }))), /khong hop le/);
});

test('alg none -> tu choi', () => {
  const h = b64({ alg: 'none', typ: 'JWT' }), p = b64(good());
  assert.throws(() => verifySessionToken(`${h}.${p}.`), /khong ho tro|dinh dang/);
});

test('token rac -> tu choi', () => {
  assert.throws(() => verifySessionToken('abc'), /dinh dang/);
  assert.throws(() => verifySessionToken(''), /dinh dang/);
});
