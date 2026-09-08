// Kiem tra logic detect o server va client cho ket qua giong nhau
import fs from 'node:fs';
import { detectCarrier } from '../src/carriers.js';

const src = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
const start = src.indexOf('const UPU_COUNTRY');
const end = src.indexOf('/* ---------- state ---------- */');
const mod = src.slice(start, end) + '\nexport { detect };';
fs.writeFileSync('/tmp/clientdetect.mjs', mod);
const { detect } = await import('/tmp/clientdetect.mjs');

const samples = [
  '1Z999AA10123456784','9400111899223197428490','70144590000012345678','123456789012',
  '961234567890123456789012','YT2512345678901234','4PX3000123456789CN','JD014600011234567890',
  '1234567890','LZ123456789US','RB123456789CN','RM123456789GB','SF1234567890123',
  'CP123456789AU','EE123456789JP','abc-xyz','12345678901234567890','S1234567890',
];
let bad = 0;
for (const s of samples) {
  const a = detectCarrier(s), b = detect(s);
  const same = a.company === b.company && a.confident === b.confident;
  if (!same) { bad++; console.log('LECH:', s, '| server:', a.company, '| client:', b.company); }
  else console.log(String(s).padEnd(26), '->', a.company, a.confident ? '' : '(khong chac)');
}
console.log(bad ? `\n${bad} truong hop lech!` : '\nServer va client khop 100%');
process.exit(bad ? 1 : 0);
