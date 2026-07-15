// توليد رمز QR متوافق مع هيئة الزكاة والضريبة والجمارك (ZATCA) للفواتير المبسطة.
// المعيار: ترميز TLV (Tag-Length-Value) ثم تحويله إلى Base64.
// الحقول الخمسة الإلزامية:
//   1) اسم البائع  2) الرقم الضريبي  3) التاريخ والوقت (ISO 8601)
//   4) إجمالي الفاتورة شامل الضريبة  5) قيمة ضريبة القيمة المضافة

// ترميز نص UTF-8 إلى مصفوفة بايتات
function utf8Bytes(str) {
  return Array.from(new TextEncoder().encode(str ?? ''));
}

// بناء وسم TLV واحد: [tag][length][...valueBytes]
function tlv(tag, value) {
  const valueBytes = utf8Bytes(value);
  return [tag, valueBytes.length, ...valueBytes];
}

// تحويل مصفوفة بايتات إلى Base64
function bytesToBase64(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

/**
 * يُنتج سلسلة Base64 لرمز ZATCA QR.
 * @param {Object} p
 * @param {string} p.sellerName   اسم البائع (الشركة)
 * @param {string} p.vatNumber    الرقم الضريبي
 * @param {string} p.timestamp    التاريخ والوقت بصيغة ISO (اختياري، الافتراضي الآن)
 * @param {number} p.total        الإجمالي شامل الضريبة
 * @param {number} p.vatTotal     قيمة الضريبة
 */
export function buildZatcaQrPayload({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  const ts = timestamp || new Date().toISOString();
  const bytes = [
    ...tlv(1, sellerName || ''),
    ...tlv(2, vatNumber || ''),
    ...tlv(3, ts),
    ...tlv(4, Number(total || 0).toFixed(2)),
    ...tlv(5, Number(vatTotal || 0).toFixed(2)),
  ];
  return bytesToBase64(bytes);
}

/**
 * يبني رابط صورة QR جاهزة للعرض عبر خدمة توليد مجانية،
 * مع تمرير حمولة ZATCA المرمّزة كنص للـ QR.
 */
export function zatcaQrImageUrl(payloadBase64, size = 130) {
  const data = encodeURIComponent(payloadBase64);
  return `https://api.qrserver.com/v1/create-qr-code/?size=${size}x${size}&margin=0&data=${data}`;
}