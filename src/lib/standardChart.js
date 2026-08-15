/**
 * الدليل المحاسبي القياسي لنشاط المطاعم (Standard Restaurant Chart of Accounts)
 *
 * مبني على قاعدة: وظيفة في النظام → عملية مالية → جهة/التزام → الحساب المطلوب →
 * Required أم Default. لا حسابات "عامة" بلا وظيفة، ولا وظيفة بلا حساب.
 *
 * مستويات الحماية:
 *   - isRequired: مطلوب لتشغيل وظيفة محرّكية (يحمل semanticRole تستخدمه محركات
 *     الترحيل entry.ts / assetDepreciation) أو مجموعة تحته حساب مطلوب أو جذر
 *     الشجرة — مقفل: لا حذف ولا تغيير دور/نوع/طبيعة/رمز/أب؛ فقط إعادة تسمية
 *     وتنشيط/إلغاء.
 *   - isSystem (Default): مُولَّد افتراضياً كبنية تفصيلية يتحكم بها المستخدم
 *     بالكامل (إعادة تسمية/تعطيل/حذف إن لم يُستخدم بقيد).
 *   - حساب أنشأه المستخدم (!isSystem): ملكه بالكامل.
 *
 * ⚠️ الأدوار الدلالية يجب أن تتطابق مع ACCOUNTS في:
 *    - base44/functions/postOperation/entry.ts (المحرك)
 *    - base44/functions/assetDepreciation/entry.ts (الإهلاك)
 *    - src/lib/businessEngine.js (fallback الواجهة)
 *    لا تُغيّر أي semanticRole موجود.
 *
 * البنية الكودية: 1xxx أصول · 2xxx خصوم · 3xxx حقوق ملكية · 4xxx إيرادات · 5xxx مصروفات
 */

// group=true → حساب تجميعي غير قابل للترحيل
export const STANDARD_CHART = [
  // ═══════════════════ 1 — الأصول (ASSETS) ═══════════════════
  { code: '1000', name: 'الأصول', nameEn: 'Assets', accountType: 'ASSET', nature: 'DEBIT', group: true, isSystem: true, isRequired: true },

  // 1100 — الأصول المتداولة
  { code: '1100', name: 'الأصول المتداولة', nameEn: 'Current Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true, isRequired: true },

  // 1110 — النقدية وما في حكمها (طرق الدفع)
  { code: '1110', name: 'النقدية وما في حكمها', nameEn: 'Cash & Equivalents', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true, isRequired: true },
  { code: '1111', name: 'صندوق الكاشير', nameEn: 'Cashier Cash', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CASH', cashLike: true, isSystem: true, isRequired: true },
  { code: '1112', name: 'البنك', nameEn: 'Bank', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'BANK', cashLike: true, isSystem: true, isRequired: true },
  { code: '1113', name: 'العهد النقدية', nameEn: 'Cash Custody', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CUSTODY', cashLike: true, isSystem: true },
  { code: '1114', name: 'نقدية بطاقات البيع (POS)', nameEn: 'POS Card Settlements', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', cashLike: true, isSystem: true, isRequired: true },
  { code: '1115', name: 'مستحقات منصات التوصيل', nameEn: 'Delivery Platforms Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'PLATFORM_RECEIVABLE', isSystem: true, isRequired: true },

  // 1120 — الذمم المدينة
  { code: '1120', name: 'الذمم المدينة', nameEn: 'Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true, isRequired: true },
  { code: '1121', name: 'ذمم الزبائن (آجلة)', nameEn: 'Customer Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'RECEIVABLES', isSystem: true, isRequired: true },
  { code: '1125', name: 'تحميلات على الموظفين', nameEn: 'Staff Charge Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'STAFF_RECEIVABLE', isSystem: true, isRequired: true },

  // 1130 — المخزون (الجرد الدوري: كميات تُتابع من شاشة المخزون)
  { code: '1130', name: 'المخزون', nameEn: 'Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true, isSystem: true, isRequired: true },
  { code: '1131', name: 'مخزون المواد الغذائية', nameEn: 'Food Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130', semanticRole: 'INVENTORY_MATERIALS', isSystem: true, isRequired: true },

  // 1140 — ضريبة القيمة المضافة المدفوعة (مدخلات)
  { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة', nameEn: 'VAT Receivable (Input)', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', semanticRole: 'VAT_RECEIVABLE', isSystem: true, isRequired: true },

  // 1200 — الأصول الثابتة (وظيفة الإهلاك assetDepreciation)
  { code: '1200', name: 'الأصول الثابتة', nameEn: 'Fixed Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true, isSystem: true, isRequired: true },
  { code: '1210', name: 'معدات المطعم والمطبخ', nameEn: 'Restaurant & Kitchen Equipment', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200', semanticRole: 'FIXED_EQUIPMENT', isSystem: true, isRequired: true },
  { code: '1290', name: 'مجمع الإهلاك', nameEn: 'Accumulated Depreciation', accountType: 'ASSET', nature: 'CREDIT', parentCode: '1200', semanticRole: 'ACCUM_DEPRECIATION', isSystem: true, isRequired: true },

  // ═══════════════════ 2 — الخصوم (LIABILITIES) ═══════════════════
  { code: '2000', name: 'الخصوم', nameEn: 'Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },

  // 2100 — الخصوم المتداولة (الموردون + الرواتب + الضرائب فقط — كلها وظائف حقيقية)
  { code: '2100', name: 'الخصوم المتداولة', nameEn: 'Current Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true, isSystem: true, isRequired: true },
  { code: '2110', name: 'ذمم الموردين', nameEn: 'Accounts Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'PAYABLES', isSystem: true, isRequired: true },
  { code: '2140', name: 'رواتب مستحقة الدفع', nameEn: 'Accrued Salaries', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'ACCRUED_SALARIES', isSystem: true, isRequired: true },
  { code: '2150', name: 'مصروفات مستحقة', nameEn: 'Accrued Expenses', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', isSystem: true },
  { code: '2160', name: 'ضريبة القيمة المضافة المحصلة', nameEn: 'VAT Payable (Output)', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'VAT_PAYABLE', isSystem: true, isRequired: true },
  // ملاحظة: حُذفت 2120 (دائنون آخرون) و2130 (دفعات مقدمة من العملاء) و2200 (خصوم
  // طويلة الأجل) — لا توجد وظائف نظام تدعمها (لا تحصيل دفعات مقدمة، لا قروض).
  // يضيفها المستخدم عند الحاجة كحسابات خاصة به.

  // ═══════════════════ 3 — حقوق الملكية (EQUITY) ═══════════════════
  { code: '3000', name: 'حقوق الملكية', nameEn: 'Equity', accountType: 'EQUITY', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },
  { code: '3100', name: 'رأس المال', nameEn: 'Capital', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', isSystem: true },
  { code: '3200', name: 'جاري الشركاء', nameEn: 'Partners Current Account', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', isSystem: true },
  { code: '3300', name: 'الأرباح المبقاة', nameEn: 'Retained Earnings', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'RETAINED_EARNINGS', isSystem: true, isRequired: true },
  { code: '3400', name: 'مسحوبات الشركاء', nameEn: 'Partners Drawings', accountType: 'EQUITY', nature: 'DEBIT', parentCode: '3000', isSystem: true },
  { code: '3900', name: 'رصيد افتتاحي — حقوق ملكية', nameEn: 'Opening Balance Equity', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'OPENING_BALANCE_EQUITY', isSystem: true, isRequired: true },

  // ═══════════════════ 4 — الإيرادات (REVENUE) ═══════════════════
  { code: '4000', name: 'الإيرادات', nameEn: 'Revenue', accountType: 'REVENUE', nature: 'CREDIT', group: true, isSystem: true, isRequired: true },
  { code: '4100', name: 'مبيعات الصالة', nameEn: 'Dine-in Sales', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_DINE_IN', isSystem: true, isRequired: true },
  { code: '4200', name: 'مبيعات منصات التوصيل', nameEn: 'Delivery Sales', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_DELIVERY', isSystem: true, isRequired: true },
  { code: '4300', name: 'مبيعات الحجوزات والمناسبات', nameEn: 'Reservations & Events', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_EVENTS', isSystem: true, isRequired: true },
  { code: '4430', name: 'فروقات جرد المخزون (زيادة)', nameEn: 'Inventory Count Gain', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'INVENTORY_GAIN', isSystem: true, isRequired: true },
  { code: '4900', name: 'إيرادات متنوعة', nameEn: 'Miscellaneous Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', group: true, isSystem: true },

  // ═══════════════════ 5 — المصروفات (EXPENSES) ═══════════════════
  { code: '5000', name: 'المصروفات', nameEn: 'Expenses', accountType: 'EXPENSE', nature: 'DEBIT', group: true, isSystem: true, isRequired: true },

  // 5100 — تكلفة المبيعات (COGS)
  { code: '5100', name: 'تكلفة المبيعات', nameEn: 'Cost of Goods Sold', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5110', name: 'تكلفة المواد الغذائية', nameEn: 'Food Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PURCHASE', isSystem: true, isRequired: true },
  { code: '5120', name: 'تكلفة المشروبات', nameEn: 'Beverage Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', isSystem: true },
  { code: '5130', name: 'تكاليف أخرى مباشرة', nameEn: 'Other Direct Costs', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PROJECT', isSystem: true, isRequired: true },
  // بند وظيفي (ليس في الهيكل المطلوب لكن وظيفة التلف/عجز الجرد DAMAGE_NORMAL/
  // DAMAGE_ABNORMAL/ADJUST_DECREASE تحتاج حساباً) — قاعدة: وظيفة → حساب.
  { code: '5140', name: 'خسائر تلف وهدر المخزون', nameEn: 'Inventory Damage & Loss', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'INVENTORY_LOSS', isSystem: true, isRequired: true },

  // 5200 — المصروفات التشغيلية
  { code: '5200', name: 'المصروفات التشغيلية', nameEn: 'Operating Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5210', name: 'إيجار', nameEn: 'Rent', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5220', name: 'كهرباء ومياه', nameEn: 'Electricity & Water', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5230', name: 'غاز', nameEn: 'Gas', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5240', name: 'اتصالات وإنترنت', nameEn: 'Telecom & Internet', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5250', name: 'نظافة', nameEn: 'Cleaning', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5260', name: 'صيانة وإصلاح', nameEn: 'Maintenance & Repair', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_EQUIPMENT', isSystem: true, isRequired: true },
  { code: '5270', name: 'وقود', nameEn: 'Fuel', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5280', name: 'نقل وشحن وتوصيل', nameEn: 'Transport & Shipping', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', isSystem: true },
  { code: '5290', name: 'مستلزمات تشغيلية', nameEn: 'Operating Supplies', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_GENERAL', isSystem: true, isRequired: true },

  // 5300 — المصروفات الإدارية والعمومية
  { code: '5300', name: 'المصروفات الإدارية والعمومية', nameEn: 'General & Administrative Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5310', name: 'الرواتب والأجور', nameEn: 'Salaries & Wages', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_SALARIES', isSystem: true, isRequired: true },
  { code: '5320', name: 'بدلات الموظفين', nameEn: 'Employee Allowances', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_EMPLOYEE', isSystem: true, isRequired: true },
  { code: '5330', name: 'حوافز ومكافآت الموظفين', nameEn: 'Employee Bonuses & Incentives', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', isSystem: true },
  { code: '5340', name: 'خدمات الموظفين', nameEn: 'Employee Services', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', isSystem: true },
  { code: '5350', name: 'رسوم وإقامات الموظفين', nameEn: 'Employee Fees & Residency', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', isSystem: true },
  { code: '5360', name: 'سفر وانتقالات', nameEn: 'Travel & Transportation', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', isSystem: true },
  { code: '5370', name: 'تدريب وتطوير الموظفين', nameEn: 'Employee Training', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', isSystem: true },
  { code: '5380', name: 'مصروفات إدارية عامة', nameEn: 'General Administrative Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5300', semanticRole: 'EXPENSE_ADMIN', isSystem: true, isRequired: true },

  // 5400 — المصروفات التسويقية
  { code: '5400', name: 'المصروفات التسويقية', nameEn: 'Marketing Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5410', name: 'إعلانات وتسويق', nameEn: 'Advertising & Marketing', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5400', isSystem: true },
  { code: '5420', name: 'عروض وحملات تسويقية', nameEn: 'Promotions & Campaigns', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5400', isSystem: true },
  { code: '5430', name: 'عمولات وخدمات المنصات', nameEn: 'Platform Commissions & Services', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5400', semanticRole: 'COMMISSION_EXPENSE', isSystem: true, isRequired: true },

  // 5500 — المصروفات البيعية
  { code: '5500', name: 'المصروفات البيعية', nameEn: 'Selling Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5510', name: 'رسوم التوصيل', nameEn: 'Delivery Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5500', isSystem: true },
  { code: '5520', name: 'عمولات البيع', nameEn: 'Sales Commissions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5500', isSystem: true },
  { code: '5530', name: 'مصروفات مرتبطة بالمبيعات', nameEn: 'Sales-related Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5500', isSystem: true },

  // 5600 — المصروفات الحكومية
  { code: '5600', name: 'المصروفات الحكومية', nameEn: 'Government Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5610', name: 'رسوم حكومية', nameEn: 'Government Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5600', semanticRole: 'EXPENSE_GOVERNMENT', isSystem: true, isRequired: true },
  { code: '5620', name: 'رسوم تراخيص وتصاريح', nameEn: 'Licenses & Permits', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5600', isSystem: true },
  { code: '5630', name: 'غرامات ومخالفات', nameEn: 'Fines & Penalties', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5600', isSystem: true },
  { code: '5640', name: 'رسوم وخدمات حكومية أخرى', nameEn: 'Other Government Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5600', isSystem: true },

  // 5700 — المصروفات المالية
  { code: '5700', name: 'المصروفات المالية', nameEn: 'Financial Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
  { code: '5710', name: 'رسوم بنكية', nameEn: 'Bank Charges', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5700', isSystem: true },
  { code: '5720', name: 'رسوم خدمات الدفع', nameEn: 'Payment Service Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5700', isSystem: true },
  { code: '5730', name: 'فوائد ومصاريف تمويلية', nameEn: 'Interest & Financing Costs', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5700', isSystem: true },

  // 5800 — الإهلاك والمخصصات
  { code: '5800', name: 'الإهلاك والمخصصات', nameEn: 'Depreciation & Provisions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true, isRequired: true },
  { code: '5810', name: 'مصروف الإهلاك', nameEn: 'Depreciation Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5800', semanticRole: 'EXPENSE_DEPRECIATION', isSystem: true, isRequired: true },
  { code: '5820', name: 'مصروف مكافأة نهاية الخدمة', nameEn: 'End of Service Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5800', isSystem: true },
  { code: '5830', name: 'مصروفات ومخصصات أخرى', nameEn: 'Other Provisions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5800', isSystem: true },

  // 5900 — مصروفات أخرى
  { code: '5900', name: 'مصروفات أخرى', nameEn: 'Other Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true, isSystem: true },
];

// يحوّل الشجرة القياسية إلى سجلات جاهزة للإنشاء.
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

function levelOf(code) {
  let level = 1;
  let cur = STANDARD_CHART.find(a => a.code === code);
  while (cur && cur.parentCode) {
    level += 1;
    cur = STANDARD_CHART.find(a => a.code === cur.parentCode);
  }
  return level;
}
