/**
 * Workflow Engine — محرك سير العمل
 *
 * يضبط الانتقالات المسموحة بين حالات المستندات ويمنع القفزات غير المنطقية
 * (مثلاً: فاتورة لا تنتقل من DRAFT مباشرة إلى PAID، أمر شراء لا يعود من RECEIVED إلى DRAFT).
 *
 * كل شاشة/محرك يستدعي assertTransition(docType, from, to) قبل الحفظ،
 * أو canTransition(docType, from, to) لمعرفة الانتقالات المتاحة في الواجهة.
 * الرسائل بالعربية جاهزة للعرض مباشرة.
 */

// خريطة الانتقالات المسموحة لكل نوع مستند: { الحالة الحالية: [الحالات المسموح الانتقال إليها] }
const TRANSITIONS = {
  SALES_INVOICE: {
    DRAFT:          ['APPROVED', 'CANCELLED'],
    APPROVED:       ['SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
    SENT:           ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
    PARTIALLY_PAID: ['PAID', 'OVERDUE', 'CANCELLED'],
    OVERDUE:        ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    PAID:           [],
    CANCELLED:      [],
  },
  PURCHASE_ORDER: {
    DRAFT:     ['APPROVED', 'CANCELLED'],
    APPROVED:  ['ORDERED', 'CANCELLED'],
    ORDERED:   ['RECEIVED', 'CANCELLED'],
    RECEIVED:  [],
    CANCELLED: [],
  },
  PAYROLL: {
    DRAFT:    ['APPROVED'],
    APPROVED: ['PAID'],
    PAID:     [],
  },
  PROJECT: {
    PLANNING:  ['ACTIVE', 'CANCELLED'],
    ACTIVE:    ['ON_HOLD', 'COMPLETED', 'CANCELLED'],
    ON_HOLD:   ['ACTIVE', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
  },
};

/**
 * هل الانتقال من حالة إلى أخرى مسموح؟
 * البقاء على نفس الحالة مسموح دائماً (تعديل بيانات دون تغيير الحالة).
 */
export function canTransition(docType, from, to) {
  if (!from || from === to) return true;
  const map = TRANSITIONS[docType];
  if (!map) return true; // نوع غير محكوم بسير عمل → لا قيود
  const allowed = map[from];
  if (!allowed) return true; // حالة غير معروفة → لا نمنع
  return allowed.includes(to);
}

/**
 * الحالات المتاحة للانتقال من الحالة الحالية (تشمل الحالة الحالية نفسها).
 * مفيدة لعرض قائمة الحالات المسموحة فقط في الواجهة.
 */
export function nextStates(docType, from) {
  const map = TRANSITIONS[docType];
  if (!map || !from || !map[from]) return null; // null = لا قيود، اعرض كل الحالات
  return [from, ...map[from]];
}

/**
 * يرمي خطأ عربي إذا كان الانتقال غير مسموح (للاستخدام داخل المحرك قبل الحفظ).
 */
export function assertTransition(docType, from, to) {
  if (!canTransition(docType, from, to)) {
    throw new Error(`لا يمكن الانتقال من الحالة "${from}" إلى "${to}" — انتقال غير مسموح في سير العمل`);
  }
}