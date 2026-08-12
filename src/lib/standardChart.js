/**
 * الدليل المحاسبي القياسي لنشاط المطاعم (Standard Restaurant Chart of Accounts)
 *
 * مبني على مبدأ «الأقسام الرئيسية فقط» — النظام يبدأ بأقل عدد ممكن من الحسابات
 * الضرورية لتشغيل القيود التلقائية، ثم يُضيف المستخدم الحسابات الفرعية التي
 * يحتاجها (إيجار/كهرباء/هاتف/رواتب تفصيلية...) تحت أي قسم رئيسي.
 *
 * نموذج الحماية (مستويان):
 *   - isSystem: true  → الحساب مُولَّد من الدليل القياسي (افتراضي).
 *   - isRequired: true → ضروري للمحرك، مقفل كلياً (لا حذف ولا تغيير دور/نوع/طبيعة/
 *     رمز/أب). يبقى允许 إعادة التسمية والتنشيط/الإلغاء فقط.
 *   - حساب عادي (isSystem=false) → يتحكم به المستخدم بالكامل.
 *   القاعدة: الحساب «المطلوب» لا يُحذف أبداً. الحساب «الافتراضي» يُحذف إن لم يُستخدم
 *   في قيد. كلاهما يحترم قاعدة منع حذف حساب عليه قيود.
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
// isSystem=true → مُولَّد من الدليل القياسي (كل الحسابات الافتراضية أدناه)
// isRequired=true → ضروري للمحرك، مقفل كلياً (مجموعة فرعية من isSystem)
export const STANDARD_CHART = [
  // ═══════════════════ 1 — الأصول (ASSETS) ═══════════════════
  { code: '1000', name: 'الأصول', nameEn: 'Assets', accountType: 'ASSET', nature: 'DEBIT', group: true, isSystem: true, isRequired: true },

  // 1100 — الأصول المتداولة
  { code: '1100', name: 'الأصول المتداولة', nameEn: 'Current Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true },

  // 1110 — النقدية وما في حكمها (طرق الدفع)
  { code: '1110', name: 'النقدية وما في حكمها', nameEn: 'Cash & Cash Equivalents', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1111', name: 'صندوق الكاشير', nameEn: 'Cashier Cash', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CASH', cashLike: true, isSystem: true, isRequired: true },
  { code: '1112', name: 'البنك', nameEn: 'Bank', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'BANK', cashLike: true, isSystem: true, isRequired: true },
  { code: '1113', name: 'العهد النقدية', nameEn: 'Cash Custody', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CUSTODY', cashLike: true, isSystem: true },
  { code: '1114', name: 'نقدية بطاقات البيع (POS)', nameEn: 'POS Card Settlements', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', cashLike: true, isSystem: true, isRequired: true },
  { code: '1115', name: 'مستحقات منصات التوصيل', nameEn: 'Delivery Platforms Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'PLATFORM_RECEIVABLE', isSystem: true, isRequired: true },

  // 1120 — الذمم المدينة
  { code: '1120', name: 'الذمم المدينة', nameEn: 'Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1121', name: 'ذمم الزبائن (آجلة)', nameEn: 'Customer Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'RECEIVABLES', isSystem: true, isRequired: true },
  { code: '1125', name: 'تحميلات على الموظفين', nameEn: 'Staff Charge Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'STAFF_RECEIVABLE', isSystem: true },

  // 1130 — المخزون
  { code: '1130', name: 'المخزون', nameEn: 'Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true },
  { code: '1131', name: 'مخزون المواد الغذائية', nameEn: 'Food Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130', semanticRole: 'INVENTORY_MATERIALS', isSystem: true, isRequired: true },

  // 1140 — ضريبة القيمة المضافة المدفوعة (مدخلات)
  { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة', nameEn: 'VAT Receivable (Input)', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', semanticRole: 'VAT_RECEIVABLE', isSystem: true, isRequired: true },

  // 1200 — الأصول الثابتة (مجموعة — يضيف المستخدم تحتها معدات/أثاث/سيارات)
  // 1210 و 1290 ضروريان لمنطق الإهلاك التلقائي لكنهما افتراضيان (يُحذفان إن لم تُستخدم ميزة الإهلاك).
  { code: '1200', name: 'الأصول الثابتة', nameEn: 'Fixed Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true },
  { code: '1210', name: 'معدات المطعم والمطبخ', nameEn: 'Restaurant & Kitchen Equipment', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200', semanticRole: 'FIXED_EQUIPMENT', isSystem: true },
  { code: '1290', name: 'مجمع الإهلاك', nameEn: 'Accumulated Depreciation', accountType: 'ASSET', nature: 'CREDIT', parentCode: '1200', semanticRole: 'ACCUM_DEPRECIATION', isSystem: true },

  // ═══════════════════ 2 — الخصوم (LIABILITIES) ═══════════════════
  { code: '2000', name: 'الخصوم', nameEn: 'Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },

  // 2100 — الخصوم المتداولة
  { code: '2100', name: 'الخصوم المتداولة', nameEn: 'Current Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true, isSystem: true },
  { code: '2110', name: 'ذمم الموردين', nameEn: 'Accounts Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'PAYABLES', isSystem: true, isRequired: true },
  { code: '2120', name: 'دائنون آخرون', nameEn: 'Other Creditors', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', isSystem: true },
  { code: '2130', name: 'دفعات مقدمة من العملاء', nameEn: 'Customer Advances', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', isSystem: true },
  { code: '2140', name: 'رواتب مستحقة الدفع', nameEn: 'Accrued Salaries', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'ACCRUED_SALARIES', isSystem: true },
  { code: '2150', name: 'مصروفات مستحقة', nameEn: 'Accrued Expenses', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', isSystem: true },
  { code: '2160', name: 'ضريبة القيمة المضافة المحصلة', nameEn: 'VAT Payable (Output)', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'VAT_PAYABLE', isSystem: true, isRequired: true },

  // 2200 — الخصوم طويلة الأجل (مجموعة فارغة — قروض/مخصصات)
  { code: '2200', name: 'الخصوم طويلة الأجل', nameEn: 'Long-term Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true, isSystem: true },

  // ═══════════════════ 3 — حقوق الملكية (EQUITY) ═══════════════════
  { code: '3000', name: 'حقوق الملكية', nameEn: 'Equity', accountType: 'EQUITY', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },
  { code: '3100', name: 'رأس المال', nameEn: 'Capital', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'CAPITAL', isSystem: true },
  { code: '3200', name: 'جاري الشركاء', nameEn: 'Partners Current Account', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', isSystem: true },
  { code: '3300', name: 'الأرباح المبقاة', nameEn: 'Retained Earnings', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'RETAINED_EARNINGS', isSystem: true },
  { code: '3400', name: 'مسحوبات الشركاء', nameEn: 'Partners Drawings', accountType: 'EQUITY', nature: 'DEBIT', parentCode: '3000', isSystem: true },
  { code: '3900', name: 'رصيد افتتاحي — حقوق ملكية', nameEn: 'Opening Balance Equity', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'OPENING_BALANCE_EQUITY', isSystem: true, isRequired: true },

  // ═══════════════════ 4 — الإيرادات (REVENUE) ═══════════════════
  { code: '4000', name: 'الإيرادات', nameEn: 'Revenue', accountType: 'REVENUE', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },

  // مصادر الإيراد الرئيسية: صالة + توصيل + حجوزات
  { code: '4100', name: 'مبيعات الصالة', nameEn: 'Dine-in Sales', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_DINE_IN', isSystem: true, isRequired: true },
  { code: '4200', name: 'مبيعات منصات التوصيل', nameEn: 'Delivery Sales', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_DELIVERY', isSystem: true, isRequired: true },
  { code: '4300', name: 'مبيعات الحجوزات والمناسبات', nameEn: 'Reservations & Events', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_EVENTS', isSystem: true },

  // فروقات الجرد بالزيادة (إيراد). العجز يُرحّل على 5170 (مصروف) — لا يجمعان تحت
  // مجموعة واحدة لاختلاف الطبيعة المحاسبية (إيراد vs مصروف).
  { code: '4430', name: 'فروقات جرد المخزون (زيادة)', nameEn: 'Inventory Count Gain', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'INVENTORY_GAIN', isSystem: true },

  // إيرادات متنوعة — مجموعة فارغة يضيف المستخدم تحتها
  { code: '4900', name: 'إيرادات متنوعة', nameEn: 'Miscellaneous Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', group: true, isSystem: true },

  // ═══════════════════ 5 — المصروفات (EXPENSES) ═══════════════════
  { code: '5000', name: 'المصروفات', nameEn: 'Expenses', accountType: 'EXPENSE', nature: 'DEBIT', group: true, isSystem: true, isRequired: true },

  // 5100 — تكلفة المبيعات (COGS)
  { code: '5100', name: 'تكلفة المبيعات', nameEn: 'Cost of Goods Sold', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5110', name: 'تكلفة المواد الغذائية', nameEn: 'Food Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PURCHASE', isSystem: true, isRequired: true },
  { code: '5150', name: 'مصروفات تجهيز الطلبات', nameEn: 'Order Preparation Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PROJECT', isSystem: true },
  { code: '5170', name: 'خسائر تلف وهدر المخزون', nameEn: 'Inventory Damage & Loss', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'INVENTORY_LOSS', isSystem: true },

  // 5200 — المصروفات التشغيلية (مجموعة — يضيف المستخدم إيجار/كهرباء/غاز/نظافة)
  { code: '5200', name: 'المصروفات التشغيلية', nameEn: 'Operating Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5220', name: 'مصروفات التشغيل', nameEn: 'Operating Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_GENERAL', isSystem: true },
  { code: '5224', name: 'صيانة المعدات', nameEn: 'Equipment Maintenance', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_EQUIPMENT', isSystem: true },

  // 5300 — المصروفات الإدارية والعمومية
  { code: '5300', name: 'المصروفات الإدارية والعمومية', nameEn: 'Administrative & General Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5210', name: 'الرواتب والأجور', nameEn: 'Salaries & Wages', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_SALARIES', isSystem: true },
  { code: '5215', name: 'بدلات ومكافآت الموظفين', nameEn: 'Allowances & Bonuses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_EMPLOYEE', isSystem: true },
  { code: '5240', name: 'مصروفات إدارية', nameEn: 'Administrative Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_ADMIN', isSystem: true },
  { code: '5250', name: 'رسوم ومصروفات حكومية', nameEn: 'Government Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_GOVERNMENT', isSystem: true },

  // 5400 — المصروفات التسويقية (مجموعة فارغة — يضيف المستخدم إعلانات/ترويج)
  { code: '5400', name: 'المصروفات التسويقية', nameEn: 'Marketing Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },

  // 5500 — المصروفات البيعية
  { code: '5500', name: 'المصروفات البيعية', nameEn: 'Selling Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5231', name: 'عمولات منصات التوصيل', nameEn: 'Delivery Platform Commissions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5500', semanticRole: 'COMMISSION_EXPENSE', isSystem: true, isRequired: true },

  // 5600 — مصروف الإهلاك
  { code: '5600', name: 'مصروف الإهلاك', nameEn: 'Depreciation Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5260', name: 'مصروف الإهلاك', nameEn: 'Depreciation Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5600', semanticRole: 'EXPENSE_DEPRECIATION', isSystem: true },

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
    const { group, cashLike, isSystem, isRequired, ...rest } = a;
    return {
      ...rest,
      parentCode: a.parentCode || '',
      semanticRole: a.semanticRole || '',
      isPostable: !group,
      isSystem: a.isSystem === true,
      isRequired: a.isRequired === true,
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
