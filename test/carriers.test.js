import test from 'node:test';
import assert from 'node:assert/strict';
import { detectCarrier, normalizeTracking } from '../src/carriers.js';

const cases = [
  ['1Z999AA10123456784', 'UPS'],
  ['9400111899223197428490', 'USPS'],
  ['9205590164917312751himx'.slice(0,22).toUpperCase(), null], // rac -> khong bat buoc
  ['7014 4590 0000 1234 5678'.replace(/ /g,''), 'USPS'],
  ['123456789012', 'FedEx'],
  ['961234567890123456789012'.slice(0,22), 'FedEx'],
  ['YT2512345678901234', 'YunExpress'],
  ['4PX3000123456789CN', '4PX'],
  ['JD014600011234567890', 'DHL eCommerce'],
  ['1234567890', 'DHL Express'],
  ['LZ123456789US', 'USPS'],
  ['RB123456789CN', 'China Post'],
  ['RM123456789GB', 'Royal Mail'],
  ['SF1234567890123', 'SF Express'],
];

test('nhan dien carrier', () => {
  for (const [num, want] of cases) {
    const got = detectCarrier(num).company;
    if (want === null) continue;
    assert.equal(got, want, `${num} => ${got}, mong doi ${want}`);
  }
});

test('rong / null', () => {
  assert.equal(detectCarrier('').company, null);
  assert.equal(detectCarrier(null).company, null);
  assert.equal(detectCarrier('abc123').company, 'Other');
});

test('chuan hoa co khoang trang & gach', () => {
  assert.equal(normalizeTracking('  1Z999AA1 0123456784 '), '1Z999AA10123456784');
  assert.equal(detectCarrier('1Z 999AA1-0123456784').company, 'UPS');
});
