// ═══════════════════════════════════════════════════════════════════════
// Business Day Engine — إدارة يوم العمل والوردية.
//
// الفلسفة: يوم العمل يُحدَّد بحدود زمنية قابلة للضبط (مثلاً 6:00 ص → 2:00 ص
// من اليوم التالي)، لا بانتقال منتصف الليل التقويمي. كل فاتورة تُصنّف ضمن
// يوم العمل الذي تقع فيه حسب هذه الحدود، لا حسب التاريخ الخام ISO.
//
// هذا يحل مشكلة الفواتير بعد منتصف الليل التي كانت تُحتسب في اليوم السابق.
// ═══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';
import { getBranchSettings } from '@/lib/branchSettings';

// الحدود الافتراضية: يوم العمل يبدأ 6:00 صباحاً وينتهي 2:00 بعد منتصف الليل
// (أي اليوم التالي الساعة 02:00). هذا نموذج شائع للمطاعم.
export const DEFAULT_BUSINESS_HOURS = { startHour: 6, endHour: 2 };

// يجلب حدود يوم العمل لفرع من BranchSettings (إن ضُبطت)، أو يرجع للافتراضية.
// cache قصير (within-call) لتقليل الطلبات المتكررة.
const _hoursCache = new Map();
export async function getBranchHours(branchId) {
  if (!branchId) return DEFAULT_BUSINESS_HOURS;
  if (_hoursCache.has(branchId)) return _hoursCache.get(branchId);
  let hours = DEFAULT_BUSINESS_HOURS;
  try {
    const s = await getBranchSettings(branchId);
    const sh = Number(s?.dayStartHour);
    const eh = Number(s?.dayEndHour);
    if (!isNaN(sh) && sh >= 0 && sh <= 23 && !isNaN(eh) && eh >= 0 && eh <= 23) {
      hours = { startHour: sh, endHour: eh };
    }
  } catch { /* افتراضي */ }
  _hoursCache.set(branchId, hours);
  // أفرغ الكاش بعد دقيقة ليُعاد قراءة الإعداد عند تغييره.
  setTimeout(() => _hoursCache.delete(branchId), 60000);
  return hours;
}

/**
 * يحوّل أي تاريخ (ISO أو محلي) إلى YYYY-MM-DD ليوم العمل الذي يقع فيه،
 * آخذاً بعين الاعتبار حدود اليوم القابلة للضبط.
 *
 * مثال: مع startHour=6, endHour=2:
 *   - فاتورة الساعة 01:30 من 2026-07-19 → يوم العمل 2026-07-18 (لأنها قبل إغلاق اليوم السابق 02:00)
 *   - فاتورة الساعة 03:00 من 2026-07-19 → يوم العمل 2026-07-19 (بعد إغلاق السابق، قبل فتح اليوم 06:00 — تنسب لليوم الجاري)
 *   - فاتورة الساعة 14:00 من 2026-07-19 → يوم العمل 2026-07-19
 *
 * @param {string|Date} dateValue - تاريخ الفاتورة
 * @param {{startHour:number, endHour:number}} hours - حدود اليوم
 * @returns {string} - YYYY-MM-DD ليوم العمل
 */
export function toBusinessDayDate(dateValue, hours = DEFAULT_BUSINESS_HOURS) {
  if (!dateValue) return '';
  // نُنشئ التاريخ كـ local (لا UTC) لتجنّب الانحراف.
  // إن جاء بصيغة ISO 'Z' نأخذ المكوّنات المحلية عبر toLocaleString أو سلسلة.
  const raw = String(dateValue).slice(0, 19); // أزل الـ Z والميلي ثانية
  const d = new Date(raw);
  if (isNaN(d.getTime())) return '';

  const h = d.getHours();
  const start = hours.startHour;
  const end = hours.endHour;

  // الحالة العادية (نفس اليوم): end > start (مثلاً 6 → 22)
  if (end > start) {
    return localDateStr(d);
  }
  // الحالة العابرة لمنتصف الليل: end <= start (مثلاً 6 → 2)
  // ساعات تنتمي لليوم السابق: [end, start) — أي بعد الإغلاق وقبل الفتح الجديد
  // لكن في نموذج المطاعم: ساعات [0, end) تنسب لليوم السابق.
  if (h < end) {
    // قبل إغلاق اليوم السابق → يوم العمل هو الأمس
    const prev = new Date(d);
    prev.setDate(prev.getDate() - 1);
    return localDateStr(prev);
  }
  // بعد الإغلاق (h >= end) → يوم العمل هو اليوم الجاري
  return localDateStr(d);
}

// يُرجع YYYY-MM-DD من كائن Date (محلي).
function localDateStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * تاريخ يوم العمل الحالي (اليوم) حسب حدود الفرع.
 */
export function currentBusinessDay(hours = DEFAULT_BUSINESS_HOURS) {
  return toBusinessDayDate(new Date().toISOString(), hours);
}

/**
 * يفتح يوم عمل جديد لفرع (إن لم يكن مفتوحاً بالفعل).
 * يُرجع سجل يوم العمل (المفتوح حديثاً أو الموجود).
 */
export async function openBusinessDay({ branchId, branchName, user, openingCash = 0, hours }) {
  if (!branchId) return null;
  try {
    // هل يوجد يوم OPEN لهذا الفرع بالفعل؟ نُرجعه بدل إنشاء يوم جديد.
    // (لا نعتمد على dayDate المحسوب — أي يوم OPEN هو اليوم النشط.)
    const existing = await base44.entities.BusinessDay.filter({
      branchId, status: 'OPEN',
    }, '-dayDate', 5);
    if (existing && existing.length > 0) return existing[0];

    // اجلب حدود الفرع إن لم تُمرَّر صراحةً (احترام إعداد dayStartHour/dayEndHour).
    const branchHours = hours || await getBranchHours(branchId);
    const dayDate = currentBusinessDay(branchHours);
    // أنشئ يوماً جديداً.
    return await base44.entities.BusinessDay.create({
      branchId,
      branchName: branchName || '',
      dayDate,
      status: 'OPEN',
      openedAt: new Date().toISOString(),
      openedBy: user?.id || '',
      openedByName: user?.full_name || user?.email || '',
      openingCash: Number(openingCash) || 0,
    });
  } catch (e) {
    console.warn('openBusinessDay failed:', e);
    return null;
  }
}

/**
 * يُغلق قسراً أيام العمل المفتوزة الزائدة عن واحدة للفرع — يُبقي أحدث يوم OPEN
 * ويُغلق الباقي (status=CLOSED, بدون Z-Report) لمنع وجود يومين مفتوحين.
 * يُستدعى عند فتح شاشة يوم العمل لتصحيح الحالة إن وُجدت أيام زائدة من فتح سابق خاطئ.
 * يُرجع عدد الأيام التي أُغلقت قسراً.
 */
export async function closeStaleOpenDays(branchId) {
  if (!branchId) return 0;
  try {
    const open = await base44.entities.BusinessDay.filter({
      branchId, status: 'OPEN',
    }, '-dayDate', 50);
    if (!open || open.length <= 1) return 0;
    // أبقِ الأحدث، أغلق الباقي.
    const toClose = open.slice(1);
    for (const day of toClose) {
      await base44.entities.BusinessDay.update(day.id, {
        status: 'CLOSED',
        closedAt: new Date().toISOString(),
        notes: 'أُغلق قسراً — كان مفتوحاً بالتزامن مع يوم أحدث (تصحيح آلي)',
      });
    }
    return toClose.length;
  } catch (e) {
    console.warn('closeStaleOpenDays failed:', e);
    return 0;
  }
}

/**
 * يُرجع يوم العمل المفتوح حالياً لفرع (أو null).
 *
 * منطق البحث المتين: نبحث عن آخر يوم مفتوح للفرع (status=OPEN) مرتّباً تنازلياً
 * بالتاريخ. لا نعتمد على dayDate المحسوب محلياً فقط (قد يختلف بين اللحظات بسبب
 * الفروق الزمنية)، بل نأخذ آخر يوم OPEN — فهو "اليوم النشط" فعلياً. هذا يمنع
 * اختفاء اليوم المفتوح بعد إنشاء فاتورة (كان يحدث لأن dayDate يُعاد حسابه وقد
 * يختلف عمّا خُزِّن عند الفتح).
 */
export async function getOpenBusinessDay(branchId, hours) {
  if (!branchId) return null;
  try {
    // ابحث عن أي يوم OPEN للفرع (مرتّب بالأحدث). هذا أصلب من مطابقة dayDate.
    const rows = await base44.entities.BusinessDay.filter({
      branchId, status: 'OPEN',
    }, '-dayDate', 5);
    return (rows && rows[0]) || null;
  } catch {
    return null;
  }
}

/**
 * يُقفل يوم العمل: يحسب الإجماليات من القيود المرحّلة، يحسب النقد المتوقع،
 * يطابق مع العدّاد الفعلي، ويُصدر رقم Z-Report.
 */
export async function closeBusinessDay({ branchId, hours, closingCash = 0, user, journalEntries = [], accountMap = {} }) {
  if (!branchId) return null;
  const open = await getOpenBusinessDay(branchId, hours);
  if (!open) throw new Error('لا يوجد يوم عمل مفتوح لهذا الفرع');
  const dayDate = open.dayDate;

  // اجمع كل القيود المرحّلة لهذا اليوم (حسب يوم العمل، لا التقويم الخام).
  const dayLines = [];
  for (const je of (journalEntries || [])) {
    if (!je || !je.isPosted) continue;
    if (toBusinessDayDate(je.date, hours) !== dayDate) continue;
    for (const l of (je.lines || [])) {
      dayLines.push({
        ...l,
        accountCode: l.accountCode || '',
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      });
    }
  }

  // احسب الإجماليات.
  let grossSales = 0, vatCollected = 0, discounts = 0;
  // النقد المتوقع في الدرج = الصندوق فقط (1111). البطاقات (1114) والبنك (1112)
  // تُحصّل لاحقاً عبر تسويات، فلا تدخل في عدّاد الدرّج الفعلي. لو أضفناها لظهر
  // "النقد المتوقع" = إجمالي المحصّل (نقد + بطاقات + بنك) وهو خطأ محاسبي.
  let expectedCashDelta = 0;       // الصندوق فقط (1111)
  let cardSettlementsDelta = 0;    // البطاقات (1114) — للمعلومة، لا للدرج
  let bankDelta = 0;               // البنك (1112) — للمعلومة
  const byPaymentMethod = {};
  for (const l of dayLines) {
    const acc = accountMap[l.accountCode] || {};
    const code = acc.code || '';
    if (acc.semanticRole === 'REVENUE_SALES' || acc.accountType === 'REVENUE') {
      grossSales += (l.credit - l.debit);
    } else if (acc.semanticRole === 'VAT_PAYABLE') {
      vatCollected += (l.credit - l.debit);
    }
    // النقد في الدرج = الصندوق (1111) فقط. لا البنك (1112) ولا البطاقات (1114).
    if (code === '1111' || acc.semanticRole === 'CASH') {
      expectedCashDelta += (l.debit - l.credit);
    } else if (code === '1114') {
      // بطاقات POS — تُحصّل لاحقاً من البنك، لا في الدرّج الفعلي.
      cardSettlementsDelta += (l.debit - l.credit);
    } else if (code === '1112' || acc.semanticRole === 'BANK') {
      bankDelta += (l.debit - l.credit);
    }
  }

  const openingCash = Number(open.openingCash) || 0;
  // النقد المتوقع في الدرج = الافتتاحي + تحصيلات الصندوق فقط (لا البطاقات/البنك).
  const expectedCash = +(openingCash + expectedCashDelta).toFixed(2);
  const variance = +(Number(closingCash) - expectedCash).toFixed(2);
  const zReportNo = `Z-${dayDate.replace(/-/g, '')}-${String(open.dayDate ? 1 : 1).padStart(3, '0')}`;

  try {
    return await base44.entities.BusinessDay.update(open.id, {
      status: 'CLOSED',
      closedAt: new Date().toISOString(),
      closedBy: user?.id || '',
      closedByName: user?.full_name || user?.email || '',
      closingCash: Number(closingCash) || 0,
      expectedCash,
      cashVariance: variance,
      zReportNo,
      totals: {
        salesCount: (journalEntries || []).filter(je => je.isPosted && toBusinessDayDate(je.date, hours) === dayDate).length,
        grossSales: +grossSales.toFixed(2),
        netSales: +(grossSales - vatCollected).toFixed(2),
        vatCollected: +vatCollected.toFixed(2),
        discounts: +discounts.toFixed(2),
        // تفصيل التحصيلات حسب النوع — النقد فقط هو ما يدخل الدرّج الفعلي.
        cashCollected: +expectedCashDelta.toFixed(2),
        cardCollected: +cardSettlementsDelta.toFixed(2),
        bankCollected: +bankDelta.toFixed(2),
        byPaymentMethod,
      },
    });
  } catch (e) {
    console.warn('closeBusinessDay failed:', e);
    throw e;
  }
}
