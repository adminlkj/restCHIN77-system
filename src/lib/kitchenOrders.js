// ═══════════════════════════════════════════════════════════════════════
// سجل طلبات المطبخ ومطابقتها بالفواتير.
//
// الفلسفة: كل مرة يطبع الكاشير "طلب المطبخ" يُنشأ سجل KitchenOrder برقم فريد
// وأصنافه وكمياته. عند إتمام الفاتورة يُربط الطلب/الطلبات المفتوحة على نفس
// الطاولة بالفاتورة، وتُحسب حالة المطابقة تلقائياً للكشف عن أي تلاعب
// (طلب 6 أصناف ← فاتورة 3 أصناف).
//
// لا يمس هذا الملف أي محرك محاسبي — مجرد سجل رقابي.
// ═══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';

export const MATCH_STATUS = {
  PENDING:  { ar: 'بانتظار فاتورة', en: 'Awaiting Invoice', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  MATCHED:  { ar: 'مطابق',          en: 'Matched',          color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  MISMATCH: { ar: 'متعارض',         en: 'Mismatch',         color: 'bg-rose-100 text-rose-700 border-rose-300' },
};

// توليد رقم طلب مطبخ فريد — KO-YYYY-XXXXXX
export function genKitchenOrderNo() {
  const y = new Date().getFullYear();
  const seq = Date.now().toString().slice(-6);
  return `KO-${y}-${seq}`;
}

// إنشاء سجل طلب مطبخ عند الطباعة.
// cart = [{ itemId, name, nameEn, qty }]
export async function createKitchenOrder({ orderNo, branchId, branchName, tableId, tableName, cashier, cart }) {
  const items = (cart || []).map(c => ({
    itemId: c.itemId || '',
    name: c.name || '',
    nameEn: c.nameEn || '',
    qty: Number(c.qty) || 0,
  }));
  const totalQty = items.reduce((s, i) => s + i.qty, 0);
  return base44.entities.KitchenOrder.create({
    orderNo,
    branchId: branchId || '',
    branchName: branchName || '',
    tableId: tableId || '',
    tableName: tableName || '',
    cashier: cashier || '',
    printedAt: new Date().toISOString(),
    items,
    itemsCount: items.length,
    totalQty,
    matchStatus: 'PENDING',
  });
}

// مقارنة أصناف الطلب بأصناف الفاتورة وإرجاع { status, note }.
// المطابقة تعتمد على itemId (fallback: الاسم) والكمية الإجمالية لكل صنف.
export function compareOrderToInvoice(orderItems, invoiceItems) {
  const key = (it) => it.itemId || it.name || it.description || '';
  const mapOf = (arr) => {
    const m = new Map();
    for (const it of arr || []) {
      const k = key(it);
      m.set(k, (m.get(k) || 0) + (Number(it.qty) || 0));
    }
    return m;
  };
  const oMap = mapOf(orderItems);
  const iMap = mapOf(invoiceItems);

  const diffs = [];
  // أصناف في الطلب مفقودة/ناقصة في الفاتورة
  for (const [k, oQty] of oMap.entries()) {
    const iQty = iMap.get(k) || 0;
    if (oQty !== iQty) {
      const name = (orderItems.find(x => key(x) === k)?.name) || k;
      diffs.push(`${name}: طلب ${oQty} / فاتورة ${iQty}`);
    }
  }
  // أصناف في الفاتورة غير موجودة أصلاً في الطلب
  for (const [k, iQty] of iMap.entries()) {
    if (!oMap.has(k)) {
      const name = (invoiceItems.find(x => key(x) === k)?.name) || (invoiceItems.find(x => key(x) === k)?.description) || k;
      diffs.push(`${name}: طلب 0 / فاتورة ${iQty}`);
    }
  }

  if (diffs.length === 0) return { status: 'MATCHED', note: '' };
  return { status: 'MISMATCH', note: diffs.join(' • ') };
}

// ربط طلبات المطبخ المفتوحة (PENDING) على طاولة بفاتورة، وحساب المطابقة.
// invoiceItems = [{ itemId, name, qty }] (من lineItems الفاتورة).
export async function reconcileTableOrders({ tableId, invoiceId, invoiceNo, invoiceItems }) {
  if (!tableId || !invoiceId) return;
  let pending = [];
  try {
    pending = await base44.entities.KitchenOrder.filter({ tableId, matchStatus: 'PENDING' });
  } catch { return; }
  if (!pending.length) return;

  // ندمج أصناف كل الطلبات المفتوحة على الطاولة (قد يطبع عدة طلبات لنفس الجلسة)
  const mergedOrderItems = [];
  for (const o of pending) {
    for (const it of (o.items || [])) mergedOrderItems.push(it);
  }
  const { status, note } = compareOrderToInvoice(mergedOrderItems, invoiceItems);

  await Promise.all(pending.map(o =>
    base44.entities.KitchenOrder.update(o.id, {
      invoiceId,
      invoiceNo: invoiceNo || '',
      matchStatus: status,
      mismatchNote: note,
    }).catch(() => {})
  ));
}