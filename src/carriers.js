/**
 * Nhan dien carrier tu ma tracking.
 * Ten cong ty PHAI khop chinh xac danh sach Shopify ho tro (phan biet hoa/thuong)
 * thi Shopify moi tu sinh tracking URL cho khach.
 * https://help.shopify.com/en/manual/fulfillment/setup/order-status-page/order-tracking
 */

// Danh sach ten carrier Shopify chap nhan (dung cho dropdown)
export const SHOPIFY_CARRIERS = [
  '4PX', 'Amazon Logistics UK', 'Amazon Logistics US', 'AGS', 'Anjun Logistics',
  'APC', 'Australia Post', 'Bluedart', 'Canada Post', 'Canpar', 'China Post',
  'Chukou1', 'Correios', 'Correos', 'Couriers Please', 'Delhivery',
  'DHL eCommerce', 'DHL eCommerce Asia', 'DHL Express', 'DPD', 'DPD Local',
  'DPD UK', 'Eagle', 'Fastway', 'FedEx', 'GLS', 'Globegistics', 'GSO',
  'Japan Post', 'La Poste', 'Newgistics', 'NZ Post', 'PostNL', 'PostNord',
  'Purolator', 'Royal Mail', 'Sagawa', 'Sendle', 'SF Express',
  'SFC Fulfillment', 'Singapore Post', 'StarTrack', 'TNT', 'Toll IPEC',
  'UPS', 'USPS', 'Whistl', 'Yamato', 'YunExpress', 'Other',
];

// Ma quoc gia cuoi cua ma buu chinh quoc te (UPU S10) -> carrier
const UPU_COUNTRY = {
  US: 'USPS', CN: 'China Post', GB: 'Royal Mail', AU: 'Australia Post',
  JP: 'Japan Post', CA: 'Canada Post', SG: 'Singapore Post', NL: 'PostNL',
  FR: 'La Poste', BR: 'Correios', ES: 'Correos', NZ: 'NZ Post',
  DE: 'DHL Express', SE: 'PostNord', DK: 'PostNord', IN: 'Delhivery',
  HK: '4PX', VN: 'Other', KR: 'Other', TW: 'Other', MY: 'Other', TH: 'Other',
};

// Thu tu QUAN TRONG: rule dac thu truoc, rule chung sau.
const RULES = [
  // --- UPS ---
  { c: 'UPS',            re: /^1Z[0-9A-Z]{16}$/ },
  { c: 'UPS',            re: /^(T\d{10}|\d{9}|\d{26})$/ },

  // --- FedEx (prefix dac thu truoc) ---
  { c: 'FedEx',          re: /^96\d{20}$/ },                     // 22 so, FedEx SmartPost
  { c: 'FedEx',          re: /^61\d{18}$/ },                     // 20 so

  // --- USPS (prefix USPS uu tien hon rule do dai chung cua FedEx) ---
  { c: 'USPS',           re: /^(94|93|92|95|82)\d{20}$/ },       // 22 so
  { c: 'USPS',           re: /^(94|93|92|95)\d{24}$/ },          // 26 so
  { c: 'USPS',           re: /^(70|71|91|92|93|94|95|82|03|23|14)\d{18}$/ }, // 20 so
  { c: 'USPS',           re: /^(70|14|23|03|71|91)\d{14}$/ },    // 16 so
  { c: 'USPS',           re: /^82\d{8}$/ },

  // --- FedEx (rule do dai chung) ---
  { c: 'FedEx',          re: /^\d{12}$/ },
  { c: 'FedEx',          re: /^\d{15}$/ },
  { c: 'FedEx',          re: /^\d{20}$/ },

  // --- YunExpress ---
  { c: 'YunExpress',     re: /^YT\d{13,18}$/i },

  // --- 4PX ---
  { c: '4PX',            re: /^4PX[0-9A-Z]+$/i },
  { c: '4PX',            re: /^RF\d{9}(SG|HK)$/i },

  // --- DHL ---
  { c: 'DHL eCommerce',  re: /^(GM|LX|RX|CN|SG|TH|MY|IN)\d{8,}$/ },
  { c: 'DHL eCommerce',  re: /^JD\d{18}$/ },
  { c: 'DHL eCommerce',  re: /^JVGL\d{10,}$/i },
  { c: 'DHL Express',    re: /^\d{10}$/ },
  { c: 'DHL Express',    re: /^\d{11}$/ },

  // --- SF Express ---
  { c: 'SF Express',     re: /^SF\d{12,15}$/i },

  // --- Sendle ---
  { c: 'Sendle',         re: /^S[0-9A-Z]{9,}$/ },

  // --- Canada Post ---
  { c: 'Canada Post',    re: /^\d{16}$/ },

  // --- Chukou1 / SFC ---
  { c: 'Chukou1',        re: /^CK1[0-9A-Z]+$/i },
  { c: 'SFC Fulfillment',re: /^SFC[0-9A-Z]+$/i },

  // --- Ma buu chinh quoc te dang XX999999999YY (kiem tra cuoi cung) ---
  { c: '__UPU__',        re: /^[A-Z]{2}\d{9}[A-Z]{2}$/ },
];

/**
 * @param {string} raw ma tracking
 * @returns {{company: string|null, confident: boolean}}
 */
export function detectCarrier(raw) {
  if (!raw) return { company: null, confident: false };
  const t = String(raw).trim().toUpperCase().replace(/[\s-]/g, '');
  if (!t) return { company: null, confident: false };

  for (const rule of RULES) {
    if (!rule.re.test(t)) continue;
    if (rule.c === '__UPU__') {
      const cc = t.slice(-2);
      const company = UPU_COUNTRY[cc] || 'Other';
      return { company, confident: Boolean(UPU_COUNTRY[cc]) };
    }
    return { company: rule.c, confident: true };
  }
  return { company: 'Other', confident: false };
}

/** Chuan hoa ma tracking: bo khoang trang va gach noi thua */
export function normalizeTracking(raw) {
  return String(raw || '').trim().replace(/\s+/g, '');
}
