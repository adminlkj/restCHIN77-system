// ═══════════════════════════════════════════════════════════════════════
// نظام إدارة طاولات المطعم — لكل فرع طاولاته الخاصة.
// يُخزّن في localStorage مفتّح بـ branchId.
//
// حالة الطاولة:
//   - AVAILABLE (متاحة)  — لا يوجد عليها طلب مفتوح
//   - OCCUPIED (مشغولة)  — عليها طلب/إيصال مفتوح
//   - RESERVED (محجوزة)  — محجوزة لزبون قادم
//   - CLEANING (تنظيف)   — قيد التنظيف بعد خروج الزبون
//
// كل طاولة لها: id, branchId, name, seats, status, currentInvoiceId (إن وُجد)
//
// لا يُعدّل هذا الملف أي محرك محاسبي.
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'restaurant-tables';

export const TABLE_STATUS = {
  AVAILABLE: { ar: 'متاحة', en: 'Available', color: 'bg-emerald-100 text-emerald-700 border-emerald-300' },
  OCCUPIED: { ar: 'مشغولة', en: 'Occupied', color: 'bg-rose-100 text-rose-700 border-rose-300' },
  RESERVED: { ar: 'محجوزة', en: 'Reserved', color: 'bg-amber-100 text-amber-700 border-amber-300' },
  CLEANING: { ar: 'تنظيف', en: 'Cleaning', color: 'bg-slate-100 text-slate-700 border-slate-300' },
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-red-100 text-red-700 border-red-400' },
};

// قراءة كل الطاولات من localStorage.
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// توليد معرّف فريد للطاولة.
function genId() {
  return 'tbl_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
}

// جلب كل طاولات فرع معيّن.
export function getBranchTables(branchId) {
  if (!branchId) return [];
  const all = readAll();
  return Object.values(all).filter(t => t.branchId === branchId).sort((a, b) => {
    // ترتيب حسب الاسم/الرقم
    return (a.sortOrder || 0) - (b.sortOrder || 0) || String(a.name).localeCompare(String(b.name), 'ar');
  });
}

// جلب طاولة واحدة بالمعرّف.
export function getTable(tableId) {
  if (!tableId) return null;
  const all = readAll();
  return all[tableId] || null;
}

// إضافة طاولة جديدة لفرع.
export function addTable(branchId, { name, seats = 4, sortOrder = 0 } = {}) {
  if (!branchId) return null;
  const all = readAll();
  const id = genId();
  all[id] = {
    id,
    branchId,
    name: name || `طاولة ${Object.values(all).filter(t => t.branchId === branchId).length + 1}`,
    seats,
    status: 'AVAILABLE',
    currentInvoiceId: null,
    sortOrder: sortOrder || Object.values(all).filter(t => t.branchId === branchId).length + 1,
    createdAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[id];
}

// إنشاء طاولات افتراضية لفرع جديد (10 طاولات).
export function createDefaultTables(branchId, count = 10) {
  if (!branchId) return [];
  const created = [];
  for (let i = 1; i <= count; i++) {
    created.push(addTable(branchId, { name: `طاولة ${i}`, seats: i <= 4 ? 2 : (i <= 8 ? 4 : 6), sortOrder: i }));
  }
  return created;
}

// تحديث طاولة.
export function updateTable(tableId, updates) {
  if (!tableId) return null;
  const all = readAll();
  if (!all[tableId]) return null;
  all[tableId] = { ...all[tableId], ...updates, updatedAt: new Date().toISOString() };
  writeAll(all);
  return all[tableId];
}

// حذف طاولة.
export function deleteTable(tableId) {
  if (!tableId) return;
  const all = readAll();
  delete all[tableId];
  writeAll(all);
}

// ربط طاولة بإيصال مفتوح (عند بدء طلب جديد) — يُغيّر الحالة إلى OCCUPIED.
export function occupyTable(tableId, invoiceId) {
  return updateTable(tableId, { status: 'OCCUPIED', currentInvoiceId: invoiceId });
}

// تحرير طاولة (عند إغلاق الإيصال) — تُصبح AVAILABLE أو CLEANING.
export function freeTable(tableId, toCleaning = true) {
  return updateTable(tableId, {
    status: toCleaning ? 'CLEANING' : 'AVAILABLE',
    currentInvoiceId: null,
  });
}

// حجز طاولة.
export function reserveTable(tableId) {
  return updateTable(tableId, { status: 'RESERVED' });
}

// إعادة طاولة من CLEANING إلى AVAILABLE.
export function setTableAvailable(tableId) {
  return updateTable(tableId, { status: 'AVAILABLE' });
}

// حذف كل طاولات فرع (عند حذف الفرع).
export function deleteBranchTables(branchId) {
  if (!branchId) return;
  const all = readAll();
  for (const id of Object.keys(all)) {
    if (all[id].branchId === branchId) delete all[id];
  }
  writeAll(all);
}

// إحصائيات الطاولات لفرع واحد.
export function getBranchTableStats(branchId) {
  const tables = getBranchTables(branchId);
  return {
    total: tables.length,
    available: tables.filter(t => t.status === 'AVAILABLE').length,
    occupied: tables.filter(t => t.status === 'OCCUPIED').length,
    reserved: tables.filter(t => t.status === 'RESERVED').length,
    cleaning: tables.filter(t => t.status === 'CLEANING').length,
    draft: tables.filter(t => t.status === 'DRAFT').length,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// إدارة المسودات (Drafts) — حفظ سلة الطلب في الطاولة نفسها
// ═══════════════════════════════════════════════════════════════════════

// حفظ مسودة الطلب في الطاولة — تُستدعى تلقائياً عند إضافة أول صنف.
// draft = { cart, customerId, customerName, invoiceType, platformId, deliveryFee, discountPercentage, notes, createdAt, updatedAt }
export function saveDraftToTable(tableId, draft) {
  if (!tableId) return null;
  const all = readAll();
  if (!all[tableId]) return null;
  all[tableId] = {
    ...all[tableId],
    status: 'DRAFT',
    currentInvoiceId: all[tableId].currentInvoiceId || `draft-${Date.now()}`,
    draft: {
      ...(all[tableId].draft || {}),
      ...draft,
      updatedAt: new Date().toISOString(),
      createdAt: all[tableId].draft?.createdAt || new Date().toISOString(),
    },
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[tableId];
}

// قراءة مسودة الطاولة (للاستئناف).
export function getTableDraft(tableId) {
  if (!tableId) return null;
  const all = readAll();
  return all[tableId]?.draft || null;
}

// تحديث حالة الطاولة من مسودة إلى مشغولة (عند إتمام البيع).
export function markTableOccupied(tableId, invoiceId) {
  return updateTable(tableId, { status: 'OCCUPIED', currentInvoiceId: invoiceId });
}

// تحرير الطاولة تماماً + مسح المسودة (عند إتمام البيع أو الإلغاء).
export function clearTableDraft(tableId) {
  if (!tableId) return null;
  const all = readAll();
  if (!all[tableId]) return null;
  all[tableId] = {
    ...all[tableId],
    status: 'AVAILABLE',
    currentInvoiceId: null,
    draft: null,
    updatedAt: new Date().toISOString(),
  };
  writeAll(all);
  return all[tableId];
}

// قائمة كل الطاولات ذات المسودات في فرع.
export function getBranchDraftTables(branchId) {
  const tables = getBranchTables(branchId);
  return tables.filter(t => t.status === 'DRAFT' && t.draft);
}
