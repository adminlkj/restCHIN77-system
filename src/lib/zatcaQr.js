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

// المنطقة الزمنية للسعودية (Asia/Riyadh = UTC+3). ZATCA يتطلب التوقيت المحلي
// في رمز QR، فلا نستخدم toISOString() (UTC) بل نُولّد محلي +03:00.
const RIYADH_OFFSET_MINUTES = 180; // +3 ساعات

// يُرجع طابع زمني ISO بصيغة محلية (+03:00) بدل UTC (Z).
// ZATCA Phase-2 يتطلب توقيت المنطقة المحلية للبائع.
function riyadhLocalIso(date = new Date()) {
  // حوّل إلى توقيت الرياض بإضافة الإزاحة.
  const local = new Date(date.getTime() + (RIYADH_OFFSET_MINUTES * 60000) - (date.getTimezoneOffset() * 60000));
  const y = local.getUTCFullYear();
  const m = String(local.getUTCMonth() + 1).padStart(2, '0');
  const d = String(local.getUTCDate()).padStart(2, '0');
  const hh = String(local.getUTCHours()).padStart(2, '0');
  const mm = String(local.getUTCMinutes()).padStart(2, '0');
  const ss = String(local.getUTCSeconds()).padStart(2, '0');
  return `${y}-${m}-${d}T${hh}:${mm}:${ss}+03:00`;
}

/**
 * يُنتج سلسلة Base64 لرمز ZATCA QR.
 * @param {Object} p
 * @param {string} p.sellerName   اسم البائع (الشركة)
 * @param {string} p.vatNumber    الرقم الضريبي
 * @param {string} p.timestamp    التاريخ والوقت بصيغة ISO محلية (+03:00) — إن لم يُمرَّر، نُولّد محلياً.
 * @param {number} p.total        الإجمالي شامل الضريبة
 * @param {number} p.vatTotal     قيمة الضريبة
 */
export function buildZatcaQrPayload({ sellerName, vatNumber, timestamp, total, vatTotal }) {
  // ملاحظة: ZATCA يتطلب التوقيت المحلي. لو مرّر المُستدعي ISO بلاحقة 'Z' (UTC)
  // نحوّله لتوقيت الرياض. إن لم يُمرَّر، نُولّد محلياً الآن.
  let ts = timestamp;
  if (!ts) {
    ts = riyadhLocalIso();
  } else if (String(ts).endsWith('Z') || String(ts).includes('+00:00')) {
    // حوّل UTC إلى توقيت الرياض.
    ts = riyadhLocalIso(new Date(ts));
  }
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