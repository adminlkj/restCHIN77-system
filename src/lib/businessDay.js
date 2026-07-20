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
export async function closeBusinessDay({ branchId, hours, closingCash = 0, user, journalEntries = [], accountMap = {}, salesInvoices = [], salesReturns = [] }) {
  if (!branchId) return null;
  const open = await getOpenBusinessDay(branchId, hours);
  if (!open) throw new Error('لا يوجد يوم عمل مفتوح لهذا الفرع');
  const dayDate = open.dayDate;
  // اسم الفرع — نُجمَع فقط سطور هذا الفرع (costCenter على السطر) حتى لا
  // يختلط نقد فرع بآخر في Z-Report. كل فرع له درجّه وزرّه الخاص.
  const branchName = open.branchName || '';

  // اجمع كل القيود المرحّلة لهذا اليوم (حسب يوم العمل، لا التقويم الخام)
  // ولهذا الفرع فقط.
  const dayLines = [];
  for (const je of (journalEntries || [])) {
    if (!je || !je.isPosted) continue;
    if (toBusinessDayDate(je.date, hours) !== dayDate) continue;
    for (const l of (je.lines || [])) {
      // فلترة الفرع: السطر يجب أن ينتمي لنفس فرع اليوم المفتوح.
      if (branchName && (l.costCenter || '') !== branchName) continue;
      dayLines.push({
        ...l,
        entryNo: je.entryNo || '',
        sourceType: je.sourceType || '',
        accountCode: l.accountCode || '',
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
      });
    }
  }

  // احسب الإجماليات من القيود المرحّلة.
  let grossSales = 0, vatCollected = 0;
  // الخصومات: نُجمَعها من فواتير اليوم (discountAmount) لأنها لا تظهر كحساب
  // مستقل في القيود (الإيراد يُسجَّل صافياً بعد الخصم وفقاً لـ ZATCA).
  let discounts = 0;
  let grossReturns = 0;       // إجمالي مرتجعات اليوم
  const returnsList = [];      // تفصيل المرتجعات (رقم المرتجع + الفاتورة + المبلغ)
  // النقد المتوقع في الدرج = الصندوق فقط (1111). البطاقات (1114) والبنك (1112)
  // تُحصّل لاحقاً عبر تسويات، فلا تدخل في عدّاد الدرّج الفعلي. لو أضفناها لظهر
  // "النقد المتوقع" = إجمالي المحصّل (نقد + بطاقات + بنك) وهو خطأ محاسبي.
  let expectedCashDelta = 0;       // الصندوق فقط (1111)
  let cardSettlementsDelta = 0;    // البطاقات (1114) — للمعلومة، لا للدرج
  let bankDelta = 0;               // البنك (1112) — للمعلومة
  for (const l of dayLines) {
    const acc = accountMap[l.accountCode] || {};
    const code = acc.code || '';
    if (acc.semanticRole === 'REVENUE_SALES' || acc.accountType === 'REVENUE') {
      // مرتجع المبيعات يقلب الإيراد (مدين) فلا نضيفه لإجمالي المبيعات الخام.
      if (l.sourceType === 'SalesReturn') {
        grossReturns += (l.debit - l.credit);
      } else {
        grossSales += (l.credit - l.debit);
      }
    } else if (acc.semanticRole === 'VAT_PAYABLE') {
      if (l.sourceType === 'SalesReturn') {
        // عكس الضريبة — لا تُضمّ لل VAT المحصلة الإيجابي.
      } else {
        vatCollected += (l.credit - l.debit);
      }
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

  // تفصيل البطاقات والمنصات والخصومات والمرتجعات من فواتير اليوم (notes.payments
  // و notes.platform تحتفظ بالتفصيل التشغيلي الذي لا يظهر في JE المُجمَّع على 1114).
  // نطابّق الفاتورة على يوم العمل + الفرع.
  const cardBreakdown = { mada: 0, visa: 0, mastercard: 0, other: 0 };
  const platformSales = {};       // { platformName: { count, gross, commission, net } }
  let cashFromInvoices = 0;       // تحقّق: يجب أن يُطابق expectedCashDelta تقريباً
  let bankFromInvoices = 0;
  const todayInvoices = [];
  for (const inv of (salesInvoices || [])) {
    if (!inv || inv.status === 'CANCELLED' || inv.status === 'DRAFT') continue;
    if (toBusinessDayDate(inv.date, hours) !== dayDate) continue;
    // فلترة الفرع: projectName على الفاتورة يجب أن يطابق فرع اليوم.
    if (branchName && (inv.projectName || '') !== branchName) continue;
    todayInvoices.push(inv);
    // الخصومات من الفاتورة.
    const disc = Number(inv.discountAmount || 0);
    if (disc > 0) discounts += disc;
    // التفصيل من notes.
    let notesObj = {};
    try { notesObj = inv.notes ? JSON.parse(inv.notes) : {}; } catch { notesObj = {}; }
    const payments = Array.isArray(notesObj.payments) ? notesObj.payments : [];
    for (const p of payments) {
      const amt = Number(p.amount || 0);
      const m = String(p.method || '').toUpperCase();
      if (m === 'CASH' || m === 'C') { cashFromInvoices += amt; }
      else if (m === 'CARD_MADA' || m === 'MADA') { cardBreakdown.mada += amt; }
      else if (m === 'CARD_VISA' || m === 'VISA') { cardBreakdown.visa += amt; }
      else if (m === 'CARD_MC' || m === 'MASTERCARD' || m === 'MC') { cardBreakdown.mastercard += amt; }
      else if (m === 'CARD_OTHER' || m === 'CARD') { cardBreakdown.other += amt; }
      else if (m === 'BANK' || m === 'BANK_TRANSFER') { bankFromInvoices += amt; }
    }
    // بيع المنصات.
    if (notesObj.isPlatformSale || inv.isPlatformSale) {
      const pname = notesObj?.platform?.platformName || inv.platformName || 'منصة غير محددة';
      const commission = Number(notesObj?.platform?.platformCommission || inv.platformCommission || 0);
      if (!platformSales[pname]) platformSales[pname] = { count: 0, gross: 0, commission: 0, net: 0 };
      platformSales[pname].count += 1;
      platformSales[pname].gross += Number(inv.totalAmount || 0);
      platformSales[pname].commission += commission;
      platformSales[pname].net += Number(inv.totalAmount || 0) - commission;
    }
  }

  // تفصيل المرتجعات من salesReturns.
  for (const sr of (salesReturns || [])) {
    if (!sr) continue;
    if (toBusinessDayDate(sr.date || sr.createdAt, hours) !== dayDate) continue;
    if (branchName && (sr.branchName || sr.costCenter || '') !== branchName) continue;
    returnsList.push({
      returnNo: sr.returnNo || sr.code || '',
      originalInvoiceNo: sr.originalInvoiceNo || '',
      amount: Number(sr.totalAmount || 0),
      type: sr.returnType || 'FULL',
    });
  }

  const openingCash = Number(open.openingCash) || 0;
  // النقد المتوقع في الدرج = الافتتاحي + تحصيلات الصندوق فقط (لا البطاقات/البنك).
  const expectedCash = +(openingCash + expectedCashDelta).toFixed(2);
  const variance = +(Number(closingCash) - expectedCash).toFixed(2);
  // رقم Z-Report: نُولّده من dayDate + تتابع يومي (إن وُجدت تقارير سابقة لليوم).
  const zReportNo = await generateZReportNo(branchId, dayDate);

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
        salesCount: todayInvoices.length,
        grossSales: +grossSales.toFixed(2),
        netSales: +(grossSales - vatCollected).toFixed(2),
        vatCollected: +vatCollected.toFixed(2),
        discounts: +discounts.toFixed(2),
        // النقد في الدرّج (للإقفال) — الصندوق فقط.
        cashCollected: +expectedCashDelta.toFixed(2),
        cardCollected: +cardSettlementsDelta.toFixed(2),
        bankCollected: +bankDelta.toFixed(2),
        // ─── تفصيل Z-Report حسب طلب المستخدم ───────────────────────────
        // تفصيل التحصيل النقدي.
        paymentBreakdown: {
          cash: +cashFromInvoices.toFixed(2),
          bank: +bankFromInvoices.toFixed(2),
          cards: {
            mada: +cardBreakdown.mada.toFixed(2),
            visa: +cardBreakdown.visa.toFixed(2),
            mastercard: +cardBreakdown.mastercard.toFixed(2),
            other: +cardBreakdown.other.toFixed(2),
            total: +(cardBreakdown.mada + cardBreakdown.visa + cardBreakdown.mastercard + cardBreakdown.other).toFixed(2),
          },
        },
        // بيع المنصات بالتفصيل: هنقرستيشن / كيتا / جاهز / ...
        platforms: Object.fromEntries(
          Object.entries(platformSales).map(([k, v]) => [k, {
            count: v.count,
            gross: +v.gross.toFixed(2),
            commission: +v.commission.toFixed(2),
            net: +v.net.toFixed(2),
          }])
        ),
        // الخصومات الممنوحة خلال اليوم.
        totalDiscounts: +discounts.toFixed(2),
        // المرتجعات.
        returns: {
          count: returnsList.length,
          total: +grossReturns.toFixed(2),
          details: returnsList,
        },
      },
    });
  } catch (e) {
    console.warn('closeBusinessDay failed:', e);
    throw e;
  }
}

// يُولّد رقم Z-Report فريداً لليوم: Z-YYYYMMDD-NNN حيث NNN تتابع يومي.
// نبحث عن عدد الأيام المقفلة لنفس الفرع ونفس dayDate لإحتساب التتابع.
async function generateZReportNo(branchId, dayDate) {
  try {
    const all = await base44.entities.BusinessDay.filter({ branchId }, '-dayDate', 50);
    const sameDay = (all || []).filter(d => d.dayDate === dayDate && d.status === 'CLOSED');
    const seq = String(sameDay.length + 1).padStart(3, '0');
    return `Z-${dayDate.replace(/-/g, '')}-${seq}`;
  } catch {
    return `Z-${dayDate.replace(/-/g, '')}-001`;
  }
}
