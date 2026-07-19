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

// ═══════════════════════════════════════════════════════════════════════
// طبقة المزامنة المركزية (DB Sync Layer)
// ═══════════════════════════════════════════════════════════════════════
// localStorage يبقى للأداء (استجابة فورية)، لكن كل عملية حرجة (حفظ مسودة،
// فتح POS، تحرير طاولة) تُزامَل مع كيان Table على الخادم. هذا يحقق:
//   1) الرؤية عبر الأجهزة — جهاز 2 يرى مسودة جهاز 1
//   2) القفل المتفائل — منع جهازين من فتح نفس الطاولة
//   3) التدقيق — يُعرف من فتح/حرّر أي طاولة ومتى
//
// كل الدوال async وتُرجع Promise. المستهلكون يستدعونها بـ await مع try/catch
// (الفشل لا يُعطّل التشغيل المحلي، لكن يُسجّل تحذيراً).
// ═══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';

// مهلة انتهاء القفل: 10 دقائق. لو مرّت دون تحديث، يُعتبر القفل منتهياً
// ويمكن لمستخدم آخر أخذه.
const LOCK_TIMEOUT_MS = 10 * 60 * 1000;

// هل القفل ما زال سارياً؟
function isLockActive(lockedAt) {
  if (!lockedAt) return false;
  const dt = Date.now() - new Date(lockedAt).getTime();
  return dt < LOCK_TIMEOUT_MS;
}

// مزامنة حالة طاولة محلية مع الخادم (upsert). يُستدعى بعد كل تعديل حرج.
// نطابق الطاولة عبر branchId + tableId (المعرّف المحلي).
export async function syncTableToDB(table) {
  if (!table || !table.branchId) return null;
  try {
    const existing = await base44.entities.Table.filter({
      branchId: table.branchId,
      tableId: table.id,
    }, '-updated_date', 5);
    const payload = {
      branchId: table.branchId,
      tableId: table.id,
      name: table.name || '',
      seats: Number(table.seats) || 4,
      status: table.status || 'AVAILABLE',
      sortOrder: Number(table.sortOrder) || 0,
      draft: table.draft || null,
      currentInvoiceId: table.currentInvoiceId || '',
    };
    if (existing && existing.length > 0) {
      return await base44.entities.Table.update(existing[0].id, payload);
    }
    return await base44.entities.Table.create(payload);
  } catch (e) {
    console.warn('syncTableToDB failed (continuing locally):', e);
    return null;
  }
}

// تحميل كل طاولات فرع من الخادم (للعرض الموحّد عبر الأجهزة).
// ندمج: طاولات الخادم (المصدر) + أي طاولات محلية غير متزامنة بعد.
export async function loadBranchTablesFromDB(branchId) {
  if (!branchId) return [];
  try {
    const rows = await base44.entities.Table.filter({ branchId }, 'sortOrder', 500);
    return (rows || []).map(r => ({
      id: r.tableId || r.id,
      dbId: r.id,
      branchId: r.branchId,
      name: r.name,
      seats: r.seats,
      status: r.status,
      sortOrder: r.sortOrder,
      draft: r.draft,
      currentInvoiceId: r.currentInvoiceId || null,
      lockedBy: r.lockedBy || '',
      lockedByName: r.lockedByName || '',
      lockedAt: r.lockedAt || '',
      // هل الطاولة مفتوحة حالياً على جهاز آخر؟ (قفل نشط من مستخدم مختلف)
      isLockedByOther: Boolean(r.lockedBy) && isLockActive(r.lockedAt),
    }));
  } catch (e) {
    console.warn('loadBranchTablesFromDB failed (using local only):', e);
    return [];
  }
}

// أخذ قفل متفائل على طاولة في الخادم قبل فتح POS.
// يُرجع { ok, conflictBy, conflictName } — ok=false يعني أن طاولة أخرى قفلها.
export async function lockTableDB(branchId, tableId, user) {
  if (!branchId || !tableId) return { ok: false };
  try {
    const existing = await base44.entities.Table.filter({
      branchId, tableId,
    }, '-updated_date', 5);
    if (existing && existing.length > 0) {
      const row = existing[0];
      // هل يوجد قفل نشط من مستخدم مختلف؟
      if (row.lockedBy && row.lockedBy !== user?.id && isLockActive(row.lockedAt)) {
        return { ok: false, conflictBy: row.lockedByName || row.lockedBy };
      }
      // جدّد القفل لهذا المستخدم.
      await base44.entities.Table.update(row.id, {
        lockedBy: user?.id || 'unknown',
        lockedByName: user?.full_name || user?.email || '',
        lockedAt: new Date().toISOString(),
      });
      return { ok: true };
    }
    // لا يوجد سجل للطاولة على الخادم بعد — أنشئه بقفل.
    await base44.entities.Table.create({
      branchId, tableId,
      lockedBy: user?.id || 'unknown',
      lockedByName: user?.full_name || user?.email || '',
      lockedAt: new Date().toISOString(),
      status: 'AVAILABLE',
    });
    return { ok: true };
  } catch (e) {
    console.warn('lockTableDB failed (proceeding without lock):', e);
    // الفشل في القفل لا يمنع الفتح (نسمح بالعمل المحلي) لكن نُنبّه.
    return { ok: true, lockFailed: true };
  }
}

// تحرير القفل عند الخروج من الطاولة (إغلاق POS دون بيع).
export async function unlockTableDB(branchId, tableId) {
  if (!branchId || !tableId) return;
  try {
    const existing = await base44.entities.Table.filter({
      branchId, tableId,
    }, '-updated_date', 5);
    if (existing && existing.length > 0) {
      await base44.entities.Table.update(existing[0].id, {
        lockedBy: '',
        lockedByName: '',
        lockedAt: '',
      });
    }
  } catch (e) {
    console.warn('unlockTableDB failed:', e);
  }
}

// حفظ مسودة طاولة على الخادد (للرؤية عبر الأجهزة). بديل مركزي عن localStorage.
export async function saveDraftToTableDB(branchId, tableId, draft) {
  if (!branchId || !tableId) return null;
  const local = getTable(tableId) || { branchId, id: tableId, name: '', seats: 4 };
  const updated = { ...local, status: 'DRAFT', draft: { ...draft, updatedAt: new Date().toISOString() } };
  // حدّث محلياً أولاً (للاستجابة)، ثمزامن مع الخادم.
  updateTable(tableId, { status: 'DRAFT', draft: updated.draft });
  await syncTableToDB(updated);
  return updated;
}

// تحرير طاولة على الخادم بعد إتمام البيع/الإلغاء (مسح المسودة + فك القفل).
export async function clearTableDraftDB(branchId, tableId) {
  if (!branchId || !tableId) return null;
  clearTableDraft(tableId); // محلياً أولاً
  try {
    const existing = await base44.entities.Table.filter({
      branchId, tableId,
    }, '-updated_date', 5);
    if (existing && existing.length > 0) {
      await base44.entities.Table.update(existing[0].id, {
        status: 'AVAILABLE',
        currentInvoiceId: '',
        draft: null,
        lockedBy: '',
        lockedByName: '',
        lockedAt: '',
      });
    }
  } catch (e) {
    console.warn('clearTableDraftDB failed:', e);
  }
  return null;
}
