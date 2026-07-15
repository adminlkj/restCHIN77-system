// Utility helpers for Binaa System

export function t(ar, en, lang) {
  return lang === 'ar' ? ar : en;
}

export function formatNumber(num, decimals = 2) {
  if (num === null || num === undefined) return '0';
  return Number(num).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Unicode codepoint for the official Saudi Riyal symbol (U+20C1),
// rendered via the "saudi_riyal" webfont loaded globally in index.css.
export const RIYAL_SYMBOL = '\u20C1';

export function formatCurrency(num, lang = 'ar') {
  const n = formatNumber(num);
  // The Riyal symbol goes after the amount in both languages, rendered slightly larger.
  return `${n}\u00A0${RIYAL_SYMBOL}`;
}

// نسخة JSX من رمز العملة مع تكبير رمز الريال قليلاً — للاستخدام في المستندات.
export function currencyParts(num) {
  return { amount: formatNumber(num), symbol: RIYAL_SYMBOL };
}

// توليد رقم فاتورة بصيغة INV-YYYY-0001 حسب سنة التاريخ وعدد الفواتير الحالي.
export function genInvoiceNo(prefix, year, count) {
  const y = year || new Date().getFullYear();
  return `${prefix}-${y}-${String(count).padStart(4, '0')}`;
}

export function formatDate(dateStr, lang = 'ar') {
  if (!dateStr) return '—';
  const raw = String(dateStr);
  const iso = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  } catch {
    return raw;
  }
}

export function genCode(prefix, num) {
  return `${prefix}-${String(num).padStart(4, '0')}`;
}

export function nextCodeFromList(list = [], prefix, field = 'code') {
  const max = (list || []).reduce((highest, item) => {
    const value = item?.[field] || '';
    const match = String(value).match(/(\d+)$/);
    return match ? Math.max(highest, Number(match[1])) : highest;
  }, 0);
  return genCode(prefix, max + 1);
}

/**
 * أنماط الحالات الموحّدة على مستوى النظام — مصدر واحد للألوان.
 * كل شارات الحالة في كل الشاشات يجب أن تشتق درجتها من هنا حسب "المعنى".
 * المفتاح = المعنى الدلالي، وليس اسم الحالة في كل كيان.
 */
export const STATUS_TONE = {
  NEUTRAL:  'bg-slate-100 text-slate-700 border border-slate-200',   // مسودة / بدون
  INFO:     'bg-blue-100 text-blue-700 border border-blue-200',      // مرسلة / معتمدة (معلومة)
  PENDING:  'bg-amber-100 text-amber-700 border border-amber-200',   // قيد المعالجة / جزئي / مطلوب
  SUCCESS:  'bg-emerald-100 text-emerald-700 border border-emerald-200', // مكتمل / مدفوع / مرحّل / نشط
  DONE:     'bg-teal-100 text-teal-700 border border-teal-200',      // منجز / مغلق
  DANGER:   'bg-rose-100 text-rose-700 border border-rose-200',      // متأخر / خطأ
  MUTED:    'bg-slate-100 text-slate-400 border border-slate-200',   // ملغي / مؤرشف
  PURPLE:   'bg-purple-100 text-purple-700 border border-purple-200',// حالة خاصة (مؤجرة)
};

// Status configs
// ملاحظة: المفاتيح (PLANNING, ACTIVE, ...) ثابتة لا تُغيَّر لأن المحركات والواجهات تعتمد عليها.
// التسميات (ar/en) حُدّثت لتتناسب مع المطاعم.
export const PROJECT_STATUS = {
  PLANNING: { ar: 'قيد التحضير', en: 'Preparing', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  ACTIVE: { ar: 'مفتوح', en: 'Open', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  ON_HOLD: { ar: 'معلق', en: 'On Hold', color: 'bg-orange-100 text-orange-700 border border-orange-200' },
  COMPLETED: { ar: 'مُسلّم', en: 'Served', color: 'bg-teal-100 text-teal-700 border border-teal-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

export const EQUIPMENT_STATUS = {
  AVAILABLE: { ar: 'متاحة', en: 'Available', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  IN_USE: { ar: 'قيد الاستخدام', en: 'In Use', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  RENTED: { ar: 'مؤجرة', en: 'Rented', color: 'bg-purple-100 text-purple-700 border border-purple-200' },
  MAINTENANCE: { ar: 'صيانة', en: 'Maintenance', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
  OUT_OF_SERVICE: { ar: 'خارج الخدمة', en: 'Out of Service', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
};

// حالات الإيصال — تُستخدم للإيصالات الحرارية وإيصالات البيع.
export const INVOICE_STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  APPROVED: { ar: 'معتمد', en: 'Approved', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  SENT: { ar: 'مرسل', en: 'Sent', color: 'bg-blue-100 text-blue-700 border border-blue-200' },
  PARTIALLY_PAID: { ar: 'مدفوع جزئياً', en: 'Partially Paid', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  PAID: { ar: 'مدفوع', en: 'Paid', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  OVERDUE: { ar: 'متأخر', en: 'Overdue', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-gray-100 text-gray-500 border border-gray-200' },
};

export const CONTRACT_STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-teal-100 text-teal-700 border border-teal-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

export const EXPENSE_CATEGORIES = [
  { key: 'RENT', ar: 'إيجار', en: 'Rent' },
  { key: 'MAINTENANCE', ar: 'صيانة', en: 'Maintenance' },
  { key: 'TRANSPORT', ar: 'نقل', en: 'Transport' },
  { key: 'DELIVERY', ar: 'توصيل', en: 'Delivery' },
  { key: 'CONSUMABLES', ar: 'مستهلكات', en: 'Consumables' },
  { key: 'SERVICES', ar: 'خدمات', en: 'Services' },
  { key: 'INSURANCE', ar: 'تأمين', en: 'Insurance' },
  { key: 'FUEL', ar: 'وقود', en: 'Fuel' },
  { key: 'PERMITS', ar: 'تراخيص', en: 'Permits' },
  { key: 'OFFICE', ar: 'مكتبية', en: 'Office' },
  { key: 'HOSPITALITY', ar: 'ضيافة', en: 'Hospitality' },
  { key: 'SALARIES', ar: 'رواتب', en: 'Salaries' },
  { key: 'ELECTRICITY', ar: 'كهرباء', en: 'Electricity' },
  { key: 'WATER', ar: 'مياه', en: 'Water' },
  { key: 'GOV_FEES', ar: 'رسوم حكومية', en: 'Government Fees' },
  { key: 'TRAVEL', ar: 'سفر', en: 'Travel' },
  { key: 'SUBCONTRACTOR', ar: 'مورّد خدمات', en: 'Service Provider' },
  { key: 'OTHER', ar: 'أخرى', en: 'Other' },
];

/**
 * تعريف أنواع المصروفات — كل نوع يحدد:
 * - الحقول المطلوب إظهارها في النموذج الديناميكي (fields)
 * - الفئات المتاحة (categories)
 * - الدور المحاسبي للمصروف (accountRole) الذي يستخدمه المحرك لاختيار الحساب
 * - اللون والأيقونة للعرض
 */
export const EXPENSE_TYPES = [
  {
    key: 'PROJECT',
    ar: 'مصروف طلب',
    en: 'Order Expense',
    icon: 'Building2',
    color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    accountRole: 'EXPENSE_PROJECT',
    fields: ['project'],
    categories: ['CONSUMABLES', 'SERVICES', 'TRANSPORT', 'DELIVERY', 'PERMITS', 'SUBCONTRACTOR', 'OTHER'],
  },
  {
    key: 'EQUIPMENT',
    ar: 'مصروف معدة',
    en: 'Equipment Expense',
    icon: 'Truck',
    color: 'bg-cyan-50 text-cyan-700 border-cyan-200',
    accountRole: 'EXPENSE_EQUIPMENT',
    fields: ['equipment'],
    categories: ['FUEL', 'MAINTENANCE', 'INSURANCE', 'TRANSPORT', 'CONSUMABLES', 'OTHER'],
  },
  {
    key: 'EMPLOYEE',
    ar: 'مصروف موظف',
    en: 'Employee Expense',
    icon: 'User',
    color: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    accountRole: 'EXPENSE_EMPLOYEE',
    fields: ['employee'],
    categories: ['TRAVEL', 'HOSPITALITY', 'TRANSPORT', 'SERVICES', 'OTHER'],
  },
  {
    key: 'GOVERNMENT',
    ar: 'مصروف حكومي',
    en: 'Government Expense',
    icon: 'Landmark',
    color: 'bg-amber-50 text-amber-700 border-amber-200',
    accountRole: 'EXPENSE_GOVERNMENT',
    fields: ['govEntity'],
    categories: ['GOV_FEES', 'PERMITS', 'INSURANCE', 'OTHER'],
  },
  {
    key: 'ADMIN',
    ar: 'مصروف إداري',
    en: 'Administrative Expense',
    icon: 'Briefcase',
    color: 'bg-violet-50 text-violet-700 border-violet-200',
    accountRole: 'EXPENSE_ADMIN',
    fields: [],
    categories: ['OFFICE', 'HOSPITALITY', 'SERVICES', 'TRAVEL', 'OTHER'],
  },
  {
    key: 'COMPANY',
    ar: 'مصروف شركة',
    en: 'Company Expense',
    icon: 'Home',
    color: 'bg-slate-50 text-slate-700 border-slate-200',
    accountRole: 'EXPENSE_GENERAL',
    fields: [],
    categories: ['RENT', 'ELECTRICITY', 'WATER', 'INSURANCE', 'SERVICES', 'MAINTENANCE', 'OTHER'],
  },
];

export function getExpenseType(key) {
  return EXPENSE_TYPES.find(t => t.key === key) || EXPENSE_TYPES.find(t => t.key === 'COMPANY');
}