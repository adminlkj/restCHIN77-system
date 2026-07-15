/**
 * Validation Engine — محرك التحقق المركزي
 *
 * يمنع العمليات الناقصة أو غير الصحيحة قبل وصولها لمحرك الأعمال.
 * كل شاشة تستدعي validate(operationType, data) → تحصل على { valid, errors }.
 * الأخطاء بالعربية جاهزة للعرض مباشرة للمستخدم.
 */

// أدوات مساعدة صغيرة
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';
const num = (v) => parseFloat(v) || 0;

/**
 * قواعد التحقق لكل نوع عملية.
 * كل قاعدة: { field, message, test } — test(data) يرجع true إذا القيمة صحيحة.
 */
const RULES = {
  SALES_INVOICE: [
    { message: 'رقم الفاتورة مطلوب', test: (d) => !isBlank(d.invoiceNo) },
    { message: 'اختيار العميل مطلوب', test: (d) => !isBlank(d.clientId) },
    { message: 'تاريخ الفاتورة مطلوب', test: (d) => !isBlank(d.date) },
    { message: 'المبلغ الأساسي يجب أن يكون أكبر من صفر', test: (d) => num(d.subtotal) > 0 },
    { message: 'تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة', test: (d) => isBlank(d.dueDate) || isBlank(d.date) || d.dueDate >= d.date },
    { message: 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة', test: (d) => num(d.paidAmount) <= num(d.subtotal) * (1 + (num(d.vatRate) || 0.15)) + 0.01 },
  ],
  PURCHASE_ORDER: [
    { message: 'رقم الأمر مطلوب', test: (d) => !isBlank(d.orderNo) },
    { message: 'اختيار المورد مطلوب', test: (d) => !isBlank(d.supplierId) },
    { message: 'تاريخ الأمر مطلوب', test: (d) => !isBlank(d.date) },
    { message: 'قيمة الأمر يجب أن تكون أكبر من صفر', test: (d) => num(d.totalAmount) > 0 },
    { message: 'تاريخ التسليم المتوقع لا يمكن أن يسبق تاريخ الأمر', test: (d) => isBlank(d.expectedDelivery) || isBlank(d.date) || d.expectedDelivery >= d.date },
  ],
  EXPENSE: [
    { message: 'بند المصروف مطلوب', test: (d) => !isBlank(d.category) },
    { message: 'وصف المصروف مطلوب', test: (d) => !isBlank(d.description) },
    { message: 'تاريخ المصروف مطلوب', test: (d) => !isBlank(d.date) },
    { message: 'المبلغ يجب أن يكون أكبر من صفر', test: (d) => num(d.amount) > 0 },
  ],
  RENTAL_CONTRACT: [
    { message: 'رقم العقد مطلوب', test: (d) => !isBlank(d.contractNo) },
    { message: 'اختيار المعدة مطلوب', test: (d) => !isBlank(d.equipmentId) },
    { message: 'اختيار العميل مطلوب', test: (d) => !isBlank(d.clientId) },
    { message: 'قيمة الإيجار يجب أن تكون أكبر من صفر', test: (d) => num(d.rate) > 0 },
    { message: 'تاريخ نهاية العقد لا يمكن أن يسبق تاريخ البداية', test: (d) => isBlank(d.endDate) || isBlank(d.startDate) || d.endDate >= d.startDate },
  ],
  PAYROLL: [
    { message: 'كود المسير مطلوب', test: (d) => !isBlank(d.code) },
    { message: 'الشهر مطلوب (1-12)', test: (d) => num(d.month) >= 1 && num(d.month) <= 12 },
    { message: 'السنة مطلوبة', test: (d) => num(d.year) >= 2000 },
    { message: 'صافي المسير يجب أن يكون أكبر من صفر عند الاعتماد', test: (d) => d.status !== 'PAID' || num(d.netAmount) > 0 },
  ],
  PROJECT: [
    { message: 'كود المشروع مطلوب', test: (d) => !isBlank(d.code) },
    { message: 'اسم المشروع مطلوب', test: (d) => !isBlank(d.name) },
    { message: 'تاريخ النهاية لا يمكن أن يسبق تاريخ البداية', test: (d) => isBlank(d.endDate) || isBlank(d.startDate) || d.endDate >= d.startDate },
  ],
};

/**
 * يتحقق من صحة بيانات عملية معينة.
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validate(operationType, data) {
  const rules = RULES[operationType] || [];
  const errors = rules.filter((r) => !r.test(data || {})).map((r) => r.message);
  return { valid: errors.length === 0, errors };
}

/**
 * يرمي خطأ يحمل أول رسالة تحقق فاشلة (للاستخدام داخل المحرك).
 */
export function assertValid(operationType, data) {
  const { valid, errors } = validate(operationType, data);
  if (!valid) {
    const err = new Error(errors[0]);
    err.validationErrors = errors;
    throw err;
  }
}