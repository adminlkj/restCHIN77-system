/**
 * الشجرة المحاسبية القياسية لنشاط المطاعم (Standard Restaurant Chart of Accounts)
 *
 * تُبنى على 5 حسابات أب رئيسية (أصول، خصوم، حقوق ملكية، إيرادات، مصروفات)،
 * ثم حسابات تجميعية تحتها (غير قابلة للترحيل)، ثم حسابات تفصيلية قابلة للترحيل.
 *
 * الحسابات التفصيلية التي يحتاجها المحرك تحمل semanticRole ليربطها بالقيود
 * التلقائية. يستطيع المستخدم لاحقاً إضافة حسابات فرعية أخرى تحت أي حساب رئيسي.
 *
 * ⚠️ ملاحظة حرجة: الـ semanticRoles يجب أن تتطابق مع ما يستخدمه businessEngine.js
 *    (REVENUE_CONSTRUCTION = مبيعات الصالة، REVENUE_SERVICE = مبيعات التوصيل، إلخ).
 *    لا تُغيّر أي semanticRole موجود — فقط أعِد تسمية الحسابات وأضف جديدة.
 *
 * البنية الكودية (Numbering):
 *   1xxx أصول · 2xxx خصوم · 3xxx حقوق ملكية · 4xxx إيرادات · 5xxx مصروفات
 */

// group=true → حساب تجميعي (أب) غير قابل للترحيل
export const STANDARD_CHART = [
  // ═══════════════════ 1 — الأصول (ASSETS) ═══════════════════
  { code: '1000', name: 'الأصول', nameEn: 'Assets', accountType: 'ASSET', nature: 'DEBIT', group: true },

  // 1100 — الأصول المتداولة
  { code: '1100', name: 'الأصول المتداولة', nameEn: 'Current Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true },

  // 1110 — النقدية وما في حكمها
  { code: '1110', name: 'النقدية وما في حكمها', nameEn: 'Cash & Cash Equivalents', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true },
  { code: '1111', name: 'صندوق الكاشير', nameEn: 'Cashier Cash', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CASH', cashLike: true },
  { code: '1112', name: 'البنك', nameEn: 'Bank', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'BANK', cashLike: true },
  { code: '1113', name: 'العهد النقدية', nameEn: 'Cash Custody', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', semanticRole: 'CUSTODY', cashLike: true },
  { code: '1114', name: 'نقدية بطاقات البيع (POS)', nameEn: 'POS Card Settlements', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110', cashLike: true },
  { code: '1115', name: 'مستحقات منصات التوصيل', nameEn: 'Delivery Platforms Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1110' },

  // 1120 — الذمم المدينة
  { code: '1120', name: 'الذمم المدينة', nameEn: 'Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true },
  { code: '1121', name: 'ذمم الزبائن (آجلة)', nameEn: 'Customer Receivables', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'RECEIVABLES' },
  { code: '1122', name: 'دفعات مقدمة للموردين', nameEn: 'Advances to Suppliers', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120' },
  { code: '1123', name: 'سلف العاملين', nameEn: 'Employee Advances', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'EMPLOYEE_ADVANCES' },
  { code: '1124', name: 'إيجارات مستحقة القبض', nameEn: 'Rent Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'RETENTION_RECEIVABLE' },
  { code: '1125', name: 'تحميلات على الموظفين', nameEn: 'Staff Charge Receivable', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120', semanticRole: 'STAFF_RECEIVABLE' },

  // 1130 — المخزون (مطاعم)
  { code: '1130', name: 'المخزون', nameEn: 'Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', group: true },
  { code: '1131', name: 'مخزون المواد الغذائية', nameEn: 'Food Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130', semanticRole: 'INVENTORY_MATERIALS' },
  { code: '1132', name: 'مخزون المشروبات', nameEn: 'Beverages Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130' },
  { code: '1133', name: 'مخزون المستهلكات (تغليف/مناديل)', nameEn: 'Consumables Inventory', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130' },
  { code: '1134', name: 'مخزون قطع الغيار وأدوات المطبخ', nameEn: 'Kitchen Spare Parts & Tools', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130' },
  { code: '1135', name: 'أعمال تحت التنفيذ (طلبات قيد التحضير)', nameEn: 'Work in Progress', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1130', semanticRole: 'WIP' },

  // 1140 — ضريبة القيمة المضافة
  { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة', nameEn: 'VAT Receivable (Input)', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1100', semanticRole: 'VAT_RECEIVABLE' },

  // 1200 — الأصول الثابتة (مطاعم)
  { code: '1200', name: 'الأصول الثابتة', nameEn: 'Fixed Assets', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1000', group: true },
  { code: '1210', name: 'معدات المطعم والمطبخ', nameEn: 'Restaurant & Kitchen Equipment', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200', semanticRole: 'FIXED_EQUIPMENT' },
  { code: '1211', name: 'أفران ومواقد', nameEn: 'Ovens & Stoves', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1212', name: 'ثلاجات ومجمدات', nameEn: 'Refrigerators & Freezers', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1213', name: 'أجهزة نقاط البيع (POS)', nameEn: 'POS Terminals', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1220', name: 'الأثاث والتجهيزات (طاولات/كراسي)', nameEn: 'Furniture & Fixtures', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1230', name: 'الأجهزة الكهربائية', nameEn: 'Electrical Appliances', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1240', name: 'المباني والعقارات', nameEn: 'Buildings & Property', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1250', name: 'السيارات (توصيل)', nameEn: 'Delivery Vehicles', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1200' },
  { code: '1290', name: 'مجمع الإهلاك', nameEn: 'Accumulated Depreciation', accountType: 'ASSET', nature: 'CREDIT', parentCode: '1200', semanticRole: 'ACCUM_DEPRECIATION' },

  // ═══════════════════ 2 — الخصوم (LIABILITIES) ═══════════════════
  { code: '2000', name: 'الخصوم', nameEn: 'Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', group: true },

  // 2100 — الخصوم المتداولة
  { code: '2100', name: 'الخصوم المتداولة', nameEn: 'Current Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true },
  { code: '2110', name: 'ذمم الموردين', nameEn: 'Accounts Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'PAYABLES' },
  { code: '2120', name: 'مستحقات موردي الخدمات', nameEn: 'Service Providers Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'SUB_PAYABLES' },
  { code: '2130', name: 'محتجزات لصالح موردي الخدمات', nameEn: 'Retention Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'RETENTION_PAYABLE' },
  { code: '2140', name: 'رواتب مستحقة الدفع', nameEn: 'Accrued Salaries', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'ACCRUED_SALARIES' },
  { code: '2150', name: 'دفعات مقدمة من الزبائن', nameEn: 'Customer Advances', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'CUSTOMER_ADVANCES' },
  { code: '2160', name: 'ضريبة القيمة المضافة المحصلة', nameEn: 'VAT Payable (Output)', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100', semanticRole: 'VAT_PAYABLE' },
  { code: '2170', name: 'مستحقات منصات التوصيل (عمولات)', nameEn: 'Delivery Platforms Commissions Payable', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100' },
  { code: '2180', name: 'مصروفات مستحقة', nameEn: 'Accrued Expenses', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2100' },

  // 2200 — الخصوم طويلة الأجل
  { code: '2200', name: 'الخصوم طويلة الأجل', nameEn: 'Long-term Liabilities', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2000', group: true },
  { code: '2210', name: 'قروض بنكية طويلة الأجل', nameEn: 'Long-term Loans', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2200' },
  { code: '2220', name: 'مخصص نهاية الخدمة', nameEn: 'End of Service Provision', accountType: 'LIABILITY', nature: 'CREDIT', parentCode: '2200', semanticRole: 'EOS_PROVISION' },

  // ═══════════════════ 3 — حقوق الملكية (EQUITY) ═══════════════════
  { code: '3000', name: 'حقوق الملكية', nameEn: 'Equity', accountType: 'EQUITY', nature: 'CREDIT', group: true },
  { code: '3100', name: 'رأس المال', nameEn: 'Capital', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'CAPITAL' },
  { code: '3200', name: 'جاري الشركاء', nameEn: 'Partners Current Account', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000' },
  { code: '3300', name: 'الأرباح المبقاة', nameEn: 'Retained Earnings', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'RETAINED_EARNINGS' },
  { code: '3900', name: 'رصيد افتتاحي — حقوق ملكية', nameEn: 'Opening Balance Equity', accountType: 'EQUITY', nature: 'CREDIT', parentCode: '3000', semanticRole: 'OPENING_BALANCE_EQUITY' },

  // ═══════════════════ 4 — الإيرادات (REVENUE) ═══════════════════
  { code: '4000', name: 'الإيرادات', nameEn: 'Revenue', accountType: 'REVENUE', nature: 'CREDIT', group: true },

  // 4100 — إيرادات المبيعات
  { code: '4100', name: 'إيرادات مبيعات الصالة', nameEn: 'Dine-in Sales Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_CONSTRUCTION' },
  { code: '4200', name: 'إيرادات الحجوزات والمناسبات', nameEn: 'Reservations & Events Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_RENTAL' },
  { code: '4300', name: 'إيرادات مبيعات التوصيل', nameEn: 'Delivery Sales Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', semanticRole: 'REVENUE_SERVICE' },

  // 4400 — إيرادات أخرى
  { code: '4400', name: 'إيرادات أخرى', nameEn: 'Other Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4000', group: true },
  { code: '4410', name: 'إيرادات رسوم التوصيل', nameEn: 'Delivery Fees Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4400' },
  { code: '4420', name: 'إيرادات الخصومات المكتسبة', nameEn: 'Earned Discounts Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4400' },
  { code: '4430', name: 'فروقات جرد المخزون (زيادة)', nameEn: 'Inventory Count Gain', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4400', semanticRole: 'INVENTORY_GAIN' },
  { code: '4900', name: 'إيرادات متنوعة', nameEn: 'Miscellaneous Revenue', accountType: 'REVENUE', nature: 'CREDIT', parentCode: '4400' },

  // ═══════════════════ 5 — المصروفات (EXPENSES) ═══════════════════
  { code: '5000', name: 'المصروفات', nameEn: 'Expenses', accountType: 'EXPENSE', nature: 'DEBIT', group: true },

  // 5100 — تكلفة المبيعات (COGS) — أهم قسم للمطاعم
  { code: '5100', name: 'تكلفة المبيعات (COGS)', nameEn: 'Cost of Goods Sold', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true },
  { code: '5110', name: 'تكلفة المواد الغذائية', nameEn: 'Food Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PURCHASE' },
  { code: '5120', name: 'تكلفة المشروبات', nameEn: 'Beverage Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100' },
  { code: '5130', name: 'تكلفة المستهلكات (تغليف/مناديل)', nameEn: 'Consumables Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100' },
  { code: '5140', name: 'تكلفة موردي الخدمات (كاترينغ/نظافة)', nameEn: 'Service Providers Cost', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_SUBCONTRACTOR' },
  { code: '5150', name: 'مصروفات تجهيز الطلبات', nameEn: 'Order Preparation Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_PROJECT' },
  { code: '5160', name: 'أجور العمالة المباشرة (الطهاة)', nameEn: 'Direct Labor (Chefs)', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'EXPENSE_DIRECT_LABOR' },
  { code: '5170', name: 'خسائر تلف وهدر المخزون', nameEn: 'Inventory Damage & Loss', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5100', semanticRole: 'INVENTORY_LOSS' },

  // 5200 — مصروفات تشغيلية وإدارية
  { code: '5200', name: 'المصروفات التشغيلية والإدارية', nameEn: 'Operating & Admin Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000', group: true },

  // 5210 — الرواتب والأجور
  { code: '5210', name: 'الرواتب والأجور', nameEn: 'Salaries & Wages', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_SALARIES' },
  { code: '5211', name: 'رواتب الكاشير', nameEn: 'Cashier Salaries', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210' },
  { code: '5212', name: 'رواتب مديري الفروع', nameEn: 'Branch Managers Salaries', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210' },
  { code: '5213', name: 'رواتب المحاسبين', nameEn: 'Accountant Salaries', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210' },
  { code: '5214', name: 'رواتب خدمة العملاء', nameEn: 'Customer Service Salaries', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210' },
  { code: '5215', name: 'بدلات ومكافآت الموظفين', nameEn: 'Allowances & Bonuses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5210', semanticRole: 'EXPENSE_EMPLOYEE' },

  // 5220 — مصروفات التشغيل
  { code: '5220', name: 'مصروفات التشغيل', nameEn: 'Operating Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_GENERAL' },
  { code: '5221', name: 'إيجار الفروع', nameEn: 'Branch Rent', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },
  { code: '5222', name: 'كهرباء ومياه', nameEn: 'Electricity & Water', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },
  { code: '5223', name: 'غاز المطبخ', nameEn: 'Kitchen Gas', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },
  { code: '5224', name: 'صيانة المعدات', nameEn: 'Equipment Maintenance', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220', semanticRole: 'EXPENSE_EQUIPMENT' },
  { code: '5225', name: 'صيانة المبنى', nameEn: 'Building Maintenance', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },
  { code: '5226', name: 'نظافة وتعقيم', nameEn: 'Cleaning & Sanitization', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },
  { code: '5227', name: 'وقود السيارات', nameEn: 'Vehicle Fuel', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5220' },

  // 5230 — مصروفات التسويق والمنصات
  { code: '5230', name: 'مصروفات التسويق والمنصات', nameEn: 'Marketing & Platform Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true },
  { code: '5231', name: 'عمولات منصات التوصيل', nameEn: 'Delivery Platform Commissions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5230' },
  { code: '5232', name: 'الإعلانات الرقمية', nameEn: 'Digital Advertising', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5230' },
  { code: '5233', name: 'العينات الترويجية', nameEn: 'Promotional Samples', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5230' },
  { code: '5234', name: 'برامج الولاء والخصومات', nameEn: 'Loyalty & Discount Programs', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5230' },

  // 5240 — مصروفات إدارية
  { code: '5240', name: 'مصروفات إدارية', nameEn: 'Administrative Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', group: true, semanticRole: 'EXPENSE_ADMIN' },
  { code: '5241', name: 'اتصالات وإنترنت', nameEn: 'Telecommunications & Internet', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },
  { code: '5242', name: 'مواد مكتبية', nameEn: 'Office Supplies', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },
  { code: '5243', name: 'برامج واشتراكات', nameEn: 'Software & Subscriptions', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },
  { code: '5244', name: 'تأمين', nameEn: 'Insurance', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },
  { code: '5245', name: 'ضيافة واستقبال', nameEn: 'Hospitality', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },
  { code: '5246', name: 'سفر وانتقالات', nameEn: 'Travel & Transportation', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5240' },

  // 5250 — رسوم حكومية
  { code: '5250', name: 'رسوم ومصروفات حكومية', nameEn: 'Government Fees', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_GOVERNMENT' },

  // 5260 — الإهلاك
  { code: '5260', name: 'مصروف الإهلاك', nameEn: 'Depreciation Expense', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5200', semanticRole: 'EXPENSE_DEPRECIATION' },

  // 5900 — مصروفات أخرى
  { code: '5900', name: 'مصروفات أخرى', nameEn: 'Other Expenses', accountType: 'EXPENSE', nature: 'DEBIT', parentCode: '5000' },
];

// يحوّل الشجرة القياسية إلى سجلات جاهزة للإنشاء في الدليل المحاسبي.
export function buildStandardAccounts() {
  return STANDARD_CHART.map(a => {
    const depth = a.parentCode
      ? STANDARD_CHART.filter(x => x.code === a.parentCode)[0]
        ? levelOf(a.code)
        : 1
      : 1;
    const { group, cashLike, ...rest } = a;
    return {
      ...rest,
      parentCode: a.parentCode || '',
      semanticRole: a.semanticRole || '',
      isPostable: !group,
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
