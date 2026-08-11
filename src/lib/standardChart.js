/**
 * الدليل المحاسبي القياسي لنشاط المطاعم (Standard Restaurant Chart of Accounts)
 *
 * مبني على مبدأ "الأقسام الرئيسية فقط" — النظام يبدأ بأقل عدد ممكن من الحسابات
 * الضرورية لتشغيل القيود التلقائية، ثم يُضيف المستخدم الحسابات الفرعية التي
 * يحتاجها (إيجار/كهرباء/هاتف/رواتب تفصيلية...) تحت أي قسم رئيسي.
 *
 * قواعد التصميم:
 *   1. كل حساب يحمل `semanticRole` يكون `isSystem: true` (لا يُحذف) — لأن المحرك
 *      يعتمد عليه لترحيل القيود التلقائية. حذفه يكسر النظام.
 *   2. الحسابات التجميعية الخمسة الرئيسية (1000/2000/3000/4000/5000) محمية أيضاً
 *      لأنها جذور الشجرة.
 *   3. المستخدم يستطيع: إضافة فروع جديدة، إعادة تسمية، تنشيط/إلغاء نشاط أي حساب،
 *      لكنه لا يستطيع حذف الحسابات النظامية أو تغيير دورها الدلالي/طبيعتها.
 *
 * ⚠️ الأدوار الدلالية (semanticRole) يجب أن تتطابق مع ACCOUNTS map في:
 *    - base44/functions/postOperation/entry.ts (server)
 *    - src/lib/businessEngine.js (frontend fallback)
 *    لا تُغيّر أي semanticRole موجود — فقط أعِد تسمية الحسابات وأضف جديدة.
 *
 * البنية الكودية (Numbering):
 *   1xxx أصول · 2xxx خصوم · 3xxx حقوق ملكية · 4xxx إيرادات · 5xxx مصروفات
 */

// group=true → حساب تجميعي (أب) غير قابل للترحيل
// isSystem=true → محمي من الحذف/تغيير الدور (يُضبط لكل حساب ضروري أدناه)
export const STANDARD_CHART = [
  // ═══════════════════ 1 — الأصول (ASSETS) ═══════════════════
  { code: '1000', name: 'الأصول', nameEn: 'Assets', accountType: 'ASSET', nature: 'DEBIT', group: true, isSystem: true },

  // 1100 — الأصول المتداولة
  { code: '1100', name: 'الأصول المتداولة', nameEn: 'Current Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true },

  // 1110 — النقدية وما في حكمها (طرق الدفع)
  { code: '1110', name: 'النقدية وما في حكمها', nameEn: 'Cash & Cash Equivalents', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1111', name: 'صندوق الكاشير', nameEn: 'Cashier Cash', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CASH', cashLike: true, isSystem: true },
  { code: '1112', name: 'البنك', nameEn: 'Bank', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'BANK', cashLike: true, isSystem: true },
  { code: '1113', name: 'العهد النقدية', nameEn: 'Cash Custody', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CUSTODY', cashLike: true, isSystem: true },
  { code: '1114', name: 'نقدية بطاقات البيع (POS)', nameEn: 'POS Card Settlements', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', cashLike: true, isSystem: true },
  { code: '1115', name: 'مستحقات منصات التوصيل', nameEn: 'Delivery Platforms Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'PLATFORM_RECEIVABLE', isSystem: true },

  // 1120 — الذمم المدينة (العملاء الآجلون + الموظفين)
  { code: '1120', name: 'الذمم المدينة', nameEn: 'Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1121', name: 'ذمم الزبائن (آجلة)', nameEn: 'Customer Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'RECEIVABLES', isSystem: true },
  { code: '1125', name: 'تحميلات على الموظفين', nameEn: 'Staff Charge Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'STAFF_RECEIVABLE', isSystem: true },

  // 1130 — المخزون
  { code: '1130', name: 'المخزون', nameEn: 'Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1131', name: 'مخزون المواد الغذائية', nameEn: 'Food Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130', semanticRole: 'INVENTORY_MATERIALS', isSystem: true },

  // 1140 — ضريبة القيمة المضافة المدفوعة (مدخلات)
  { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة', nameEn: 'VAT Receivable (Input)', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', semanticRole: 'VAT_RECEIVABLE', isSystem: true },

  // 1200 — الأصول الثابتة (مجموعة فارغة يضيف المستخدم تحتها معدات/أثاث/سيارات)
  // ملاحظة: 1210 و 1290 ضروريان لمنطق الإهلاك التلقائي (assetDepreciation).
  { code: '1200', name: 'الأصول الثابتة', nameEn: 'Fixed Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true },
  { code: '1210', name: 'معدات المطعم والمطبخ', nameEn: 'Restaurant & Kitchen Equipment', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200', semanticRole: 'FIXED_EQUIPMENT', isSystem: true },
  { code: '1290', name: 'مجمع الإهلاك', nameEn: 'Accumulated Depreciation', accountType: 'ASSET', nature: 'CREDIT', parentCode: '1200', semanticRole: 'ACCUM_DEPRECIATION', isSystem: true },

  // ═══════════════════ 2 — الخصوم (LIABILITIES) ═══════════════════
  { code: '2000', name: 'الخصوم', nameEn: 'Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', group: true, isSystem: true },

  // 2100 — الخصوم المتداولة (الموردون + الرواتب + الضرائب)
  { code: '2100', name: 'الخصوم المتداولة', nameEn: 'Current Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true, isSystem: true },
  { code: '2110', name: 'ذمم الموردين', nameEn: 'Accounts Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'PAYABLES', isSystem: true },
  { code: '2140', name: 'رواتب مستحقة الدفع', nameEn: 'Accrued Salaries', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'ACCRUED_SALARIES', isSystem: true },
  { code: '2160', name: 'ضريبة القيمة المضافة المحصلة', nameEn: 'VAT Payable (Output)', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'VAT_PAYABLE', isSystem: true },
  { code: '2180', name: 'مصروفات مستحقة', nameEn: 'Accrued Expenses', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', group: true, isSystem: true },

  // 2200 — الخصوم طويلة الأجل (مجموعة فارغة — قروض/مخصصات)
  { code: '2200', name: 'الخصوم طويلة الأجل', nameEn: 'Long-term Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true, isSystem: true },

  // ═══════════════════ 3 — حقوق الملكية (EQUITY) ═══════════════════
  { code: '3000', name: 'حقوق الملكية', nameEn: 'Equity', accountType: 'EQUITY', nature: 'CREDIT', group: true, isSystem: true },
  { code: '3100', name: 'رأس المال', nameEn: 'Capital', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'CAPITAL', isSystem: true },
  { code: '3200', name: 'جاري الشركاء', nameEn: 'Partners Current Account', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', isSystem: true },
  { code: '3300', name: 'الأرباح المبقاة', nameEn: 'Retained Earnings', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'RETAINED_EARNINGS', isSystem: true },
  { code: '3900', name: 'رصيد افتتاحي — حقوق ملكية', nameEn: 'Opening Balance Equity', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'OPENING_BALANCE_EQUITY', isSystem: true },

  // ═══════════════════ 4 — الإيرادات (REVENUE) ═══════════════════
  { code: '4000', name: 'الإيرادات', nameEn: 'Revenue', accountType: 'REVENUE', nature: 'CREDIT', group: true, isSystem: true },

  // أنواع المبيعات الرئيسية: صالة + حجوزات + توصيل
  { code: '4100', name: 'إيرادات مبيعات الصالة', nameEn: 'Dine-in Sales Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_CONSTRUCTION', isSystem: true },
  { code: '4200', name: 'إيرادات الحجوزات والمناسبات', nameEn: 'Reservations & Events Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_RENTAL', isSystem: true },
  { code: '4300', name: 'إيرادات مبيعات التوصيل', nameEn: 'Delivery Sales Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_SERVICE', isSystem: true },

  // فروقات الجرد (الزيادة تُرحّل هنا)
  { code: '4430', name: 'فروقات جرد المخزون (زيادة)', nameEn: 'Inventory Count Gain', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'INVENTORY_GAIN', isSystem: true },

  // إيرادات متنوعة — مجموعة فارغة يضيف المستخدم تحتها
  { code: '4900', name: 'إيرادات متنوعة', nameEn: 'Miscellaneous Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', group: true, isSystem: true },

  // ═══════════════════ 5 — المصروفات (EXPENSES) ═══════════════════
  { code: '5000', name: 'المصروفات', nameEn: 'Expenses', accountType: 'EXPENSE', nature: 'DEBIT', group: true, isSystem: true },

  // 5100 — تكلفة المبيعات (COGS) — أهم قسم للمطاعم
  { code: '5100', name: 'تكلفة المبيعات (COGS)', nameEn: 'Cost of Goods Sold', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5110', name: 'تكلفة المواد الغذائية', nameEn: 'Food Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PURCHASE', isSystem: true },
  { code: '5150', name: 'مصروفات تجهيز الطلبات', nameEn: 'Order Preparation Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PROJECT', isSystem: true },
  { code: '5170', name: 'خسائر تلف وهدر المخزون', nameEn: 'Inventory Damage & Loss', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'INVENTORY_LOSS', isSystem: true },

  // 5200 — المصروفات التشغيلية والإدارية (مجموعات رئيسية + الحسابات الافتراضية للأنواع)
  { code: '5200', name: 'المصروفات التشغيلية والإدارية', nameEn: 'Operating & Admin Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },

  // 5210 — الرواتب (مجموعة رئيسية — يضيف المستخدم فروع رواتب تفصيلية)
  { code: '5210', name: 'الرواتب والأجور', nameEn: 'Salaries & Wages', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_SALARIES', isSystem: true },
  { code: '5215', name: 'بدلات ومكافآت الموظفين', nameEn: 'Allowances & Bonuses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210', semanticRole: 'EXPENSE_EMPLOYEE', isSystem: true },

  // 5220 — مصروفات التشغيل (مجموعة رئيسية — يضيف إيجار/كهرباء/غاز/صيانة)
  { code: '5220', name: 'مصروفات التشغيل', nameEn: 'Operating Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_GENERAL', isSystem: true },
  { code: '5224', name: 'صيانة المعدات', nameEn: 'Equipment Maintenance', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220', semanticRole: 'EXPENSE_EQUIPMENT', isSystem: true },

  // 5230 — مصروفات التسويق والمنصات (مجموعة رئيسية — يضيف إعلانات/ترويج)
  { code: '5230', name: 'مصروفات التسويق والمنصات', nameEn: 'Marketing & Platform Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, isSystem: true },
  { code: '5231', name: 'عمولات منصات التوصيل', nameEn: 'Delivery Platform Commissions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5230', semanticRole: 'COMMISSION_EXPENSE', isSystem: true },

  // 5240 — مصروفات إدارية (مجموعة رئيسية — يضيف اتصالات/قرطاسية/برامج)
  { code: '5240', name: 'مصروفات إدارية', nameEn: 'Administrative Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_ADMIN', isSystem: true },

  // 5250 — رسوم حكومية
  { code: '5250', name: 'رسوم ومصروفات حكومية', nameEn: 'Government Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_GOVERNMENT', isSystem: true },

  // 5260 — الإهلاك
  { code: '5260', name: 'مصروف الإهلاك', nameEn: 'Depreciation Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_DEPRECIATION', isSystem: true },

  // 5900 — مصروفات أخرى (مجموعة فارغة)
  { code: '5900', name: 'مصروفات أخرى', nameEn: 'Other Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
];

// يحوّل الشجرة القياسية إلى سجلات جاهزة للإنشاء في الدليل المحاسبي.
export function buildStandardAccounts() {
  return STANDARD_CHART.map(a => {
    const depth = a.parentCode
      ? STANDARD_CHART.filter(x => x.code === a.parentCode)[0]
        ? levelOf(a.code)
        : 1
      : 1;
    const { group, cashLike, isSystem, ...rest } = a;
    return {
      ...rest,
      parentCode: a.parentCode || '',
      semanticRole: a.semanticRole || '',
      isPostable: !group,
      isSystem: a.isSystem === true,
      isActive: true,
      level: depth,
    };
  });
}

// يحسب مستوى الحساب بتتبّع سلسلة الآباء.
function levelOf(code) {
  let level = 1;
  let cur = STANDARD_CHART.find(a => a.code === code);
  while (cur && cur.parentCode) {
    level += 1;
    cur = STANDARD_CHART.find(a => a.code === cur.parentCode);
  }
  return level;
}
