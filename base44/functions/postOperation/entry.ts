import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

/**
 * postOperation — تنفيذ العمليات المالية كترانسكشن ذرّي على الخادم.
 *
 * كل عملية (إنشاء السجل + ترحيل القيد المحاسبي) تُنفَّذ هنا في نداء واحد.
 * إن فشلت أي خطوة بعد إنشاء السجل، يُحذف السجل (rollback) فلا تبقى معاملة
 * مالية بلا قيد مقابل. الشاشات تنادي هذه الدالة عبر SDK باستدعاء واحد.
 *
 * الحمولة: { operation, mode, data, id, prevStatus }
 *   operation: SALES_INVOICE | PURCHASE_ORDER | EXPENSE | RENTAL_CONTRACT | PAYROLL
 *   mode:      create | update
 */

const VAT_RATE = 0.15;

// خريطة الحسابات الافتراضية حسب الدور (تُستخدم كخطة بديلة إن لم يوجد حساب في الدليل)
// خطة بديلة تطابق الشجرة القياسية الحالية — تُستخدم فقط إن لم يوجد الدور في الدليل.
// ملاحظة محاسبية: البيع النقدي يُذهب للصندوق/البنك/البطاقة حسب طريقة الدفع،
// والبيع الآجل يُذهب لذمم العملاء، وبيع المنصات يُذهب لذمم المنصات (الصافي بعد العمولة)
// مع تسجيل مصروف العمولة وضريبة العمولة المدفوعة.
const ACCOUNTS = {
  CASH:                 { code: '1111', name: 'صندوق الكاشير' },
  BANK:                 { code: '1112', name: 'البنك' },
  CARD_MADA:            { code: '1114', name: 'نقدية بطاقات البيع (مدى)' },
  CARD_VISA:            { code: '1114', name: 'نقدية بطاقات البيع (فيزا)' },
  CARD_MC:              { code: '1114', name: 'نقدية بطاقات البيع (ماستركارد)' },
  CARD_OTHER:           { code: '1114', name: 'نقدية بطاقات البيع (أخرى)' },
  RECEIVABLES:          { code: '1121', name: 'ذمم الزبائن (آجلة)' },
  PLATFORM_RECEIVABLE:  { code: '1115', name: 'مستحقات منصات التوصيل' },
  PAYABLES:             { code: '2110', name: 'ذمم الموردين' },
  VAT_PAYABLE:          { code: '2160', name: 'ضريبة القيمة المضافة المحصلة' },
  VAT_RECEIVABLE:       { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة' },
  ACCRUED_SALARIES:     { code: '2140', name: 'رواتب مستحقة الدفع' },
  REVENUE_SALES:        { code: '4100', name: 'إيرادات مبيعات الصالة' },
  REVENUE_CONSTRUCTION: { code: '4100', name: 'إيرادات مبيعات الصالة' },
  REVENUE_RENTAL:       { code: '4200', name: 'إيرادات الحجوزات والمناسبات' },
  REVENUE_SERVICE:      { code: '4300', name: 'إيرادات مبيعات التوصيل' },
  COMMISSION_EXPENSE:   { code: '5231', name: 'عمولات منصات التوصيل' },
  COMMISSION_VAT_INPUT: { code: '1140', name: 'ضريبة القيمة المضافة المدفوعة (عمولات)' },
  EXPENSE_GENERAL:      { code: '5250', name: 'رسوم ومصروفات حكومية' },
  EXPENSE_SALARIES:     { code: '5210', name: 'الرواتب والأجور' },
  EXPENSE_PURCHASE:     { code: '5110', name: 'تكلفة المواد الغذائية' },
  EXPENSE_PROJECT:      { code: '5150', name: 'مصروفات تجهيز الطلبات' },
  EXPENSE_EQUIPMENT:    { code: '5224', name: 'صيانة المعدات' },
  EXPENSE_EMPLOYEE:     { code: '5215', name: 'بدلات ومكافآت الموظفين' },
  EXPENSE_GOVERNMENT:   { code: '5250', name: 'رسوم ومصروفات حكومية' },
  EXPENSE_ADMIN:        { code: '5240', name: 'مصروفات إدارية' },
  INVENTORY_MATERIALS:  { code: '1131', name: 'مخزون المواد الغذائية' },
  OPENING_BALANCE_EQUITY: { code: '3900', name: 'رصيد افتتاحي — حقوق ملكية' },
  RETAINED_EARNINGS:    { code: '3200', name: 'الأرباح المبقاة' },
  INVENTORY_LOSS:       { code: '5170', name: 'خسائر تلف وهدر المخزون' },
  INVENTORY_GAIN:       { code: '4430', name: 'فروقات جرد المخزون (زيادة)' },
  STAFF_RECEIVABLE:     { code: '1125', name: 'تحميلات على الموظفين' },
  SUB_PAYABLES:         { code: '2120', name: 'مستحقات موردي الخدمات' },
  RETENTION_PAYABLE:    { code: '2130', name: 'محتجزات لصالح موردي الخدمات' },
};

const EXPENSE_TYPE_ACCOUNTS = {
  EXPENSE_PROJECT:    ACCOUNTS.EXPENSE_PROJECT,     // 5150 — مصروفات تجهيز الطلبات (تكلفة مباشرة)
  EXPENSE_EQUIPMENT:  ACCOUNTS.EXPENSE_EQUIPMENT,    // 5224 — صيانة المعدات
  EXPENSE_EMPLOYEE:   ACCOUNTS.EXPENSE_EMPLOYEE,     // 5215 — بدلات ومكافآت الموظفين
  EXPENSE_GOVERNMENT: ACCOUNTS.EXPENSE_GOVERNMENT,    // 5250 — رسوم حكومية
  EXPENSE_ADMIN:      ACCOUNTS.EXPENSE_ADMIN,         // 5240 — مصروفات إدارية
  EXPENSE_GENERAL:    { code: '5220', name: 'مصروفات التشغيل' }, // 5220 — مصروفات تشغيلية (إيجار/كهرباء/ماء)
};

const num = (v) => parseFloat(v) || 0;
const isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

function calcVAT(amount, rate = VAT_RATE) {
  const base = num(amount);
  const vat = +(base * rate).toFixed(2);
  const total = +(base + vat).toFixed(2);
  return { base, vat, total };
}

// ─── قواعد التحقق ─────────────────────────────────────────────────────────────
const RULES = {
  SALES_INVOICE: [
    { m: 'رقم الفاتورة مطلوب', t: (d) => !isBlank(d.invoiceNo) },
    { m: 'تاريخ الفاتورة مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'المبلغ الأساسي يجب أن يكون أكبر من صفر', t: (d) => num(d.subtotal) > 0 },
    { m: 'تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة', t: (d) => isBlank(d.dueDate) || isBlank(d.date) || d.dueDate >= d.date },
    { m: 'المبلغ المدفوع لا يمكن أن يتجاوز إجمالي الفاتورة', t: (d) => num(d.paidAmount) <= num(d.subtotal) * (1 + (num(d.vatRate) || 0.15)) + 0.01 },
  ],
  PLATFORM_SETTLEMENT: [
    { m: 'معرّف المنصة مطلوب', t: (d) => !isBlank(d.platformId) },
    { m: 'تاريخ التسوية مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'مبلغ التسوية يجب أن يكون أكبر من صفر', t: (d) => num(d.settledAmount) > 0 },
  ],
  PURCHASE_ORDER: [
    { m: 'رقم الأمر مطلوب', t: (d) => !isBlank(d.orderNo) },
    { m: 'اختيار المورد مطلوب', t: (d) => !isBlank(d.supplierId) },
    { m: 'تاريخ الأمر مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'قيمة الأمر يجب أن تكون أكبر من صفر — أضف بنوداً أو مبلغاً', t: (d) => num(d.totalAmount) > 0 || (Array.isArray(d.items) && d.items.some((l) => num(l.orderedQty) * num(l.unitPrice) > 0)) },
    { m: 'تاريخ التسليم المتوقع لا يمكن أن يسبق تاريخ الأمر', t: (d) => isBlank(d.expectedDelivery) || isBlank(d.date) || d.expectedDelivery >= d.date },
  ],
  EXPENSE: [
    { m: 'بند المصروف مطلوب', t: (d) => !isBlank(d.category) },
    { m: 'وصف المصروف مطلوب', t: (d) => !isBlank(d.description) },
    { m: 'تاريخ المصروف مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'المبلغ يجب أن يكون أكبر من صفر', t: (d) => num(d.amount) > 0 },
    { m: 'اختيار حساب السداد (نقدي/بنك) مطلوب — لا يمكن ترحيل مصروف بلا حساب', t: (d) => !isBlank(d.paymentAccountCode) },
  ],
  RENTAL_CONTRACT: [
    { m: 'رقم العقد مطلوب', t: (d) => !isBlank(d.contractNo) },
    { m: 'اختيار المعدة مطلوب', t: (d) => !isBlank(d.equipmentId) },
    { m: 'قيمة الإيجار يجب أن تكون أكبر من صفر', t: (d) => num(d.rate) > 0 },
    { m: 'تاريخ نهاية العقد لا يمكن أن يسبق تاريخ البداية', t: (d) => isBlank(d.endDate) || isBlank(d.startDate) || d.endDate >= d.startDate },
  ],
  PAYROLL: [
    { m: 'كود المسير مطلوب', t: (d) => !isBlank(d.code) },
    { m: 'الشهر مطلوب (1-12)', t: (d) => num(d.month) >= 1 && num(d.month) <= 12 },
    { m: 'السنة مطلوبة', t: (d) => num(d.year) >= 2000 },
    { m: 'صافي المسير يجب أن يكون أكبر من صفر', t: (d) => num(d.netAmount) > 0 },
    { m: 'لا يمكن اعتماد مسير مدفوع دون تحديد طريقة الدفع (الحساب النقدي)', t: (d) => d.status !== 'PAID' || !isBlank(d.paymentAccountCode) },
    { m: 'لا يمكن اعتماد مسير مدفوع دون تحديد تاريخ الدفع', t: (d) => d.status !== 'PAID' || !isBlank(d.paymentDate) },
  ],
  CLIENT_PAYMENT: [
    { m: 'تاريخ السند مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'المبلغ يجب أن يكون أكبر من صفر', t: (d) => num(d.amount) > 0 },
    { m: 'اختيار الحساب النقدي (صندوق/بنك) مطلوب — لا يمكن تحصيل بلا حساب', t: (d) => !isBlank(d.cashAccountCode) },
  ],
  SUPPLIER_PAYMENT: [
    { m: 'اختيار المورد مطلوب', t: (d) => !isBlank(d.supplierId) },
    { m: 'تاريخ السند مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'المبلغ يجب أن يكون أكبر من صفر', t: (d) => num(d.amount) > 0 },
    { m: 'اختيار الحساب النقدي (صندوق/بنك) مطلوب — لا يمكن الصرف بلا حساب', t: (d) => !isBlank(d.cashAccountCode) },
  ],
  SUPPLIER_INVOICE: [
    { m: 'رقم الفاتورة مطلوب', t: (d) => !isBlank(d.invoiceNo) },
    { m: 'اختيار المورد مطلوب', t: (d) => !isBlank(d.supplierId) },
    { m: 'تاريخ الفاتورة مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'المبلغ الأساسي يجب أن يكون أكبر من صفر', t: (d) => num(d.baseAmount) > 0 },
    { m: 'تاريخ الاستحقاق لا يمكن أن يسبق تاريخ الفاتورة', t: (d) => isBlank(d.dueDate) || isBlank(d.date) || d.dueDate >= d.date },
    // فرض السلسلة: لا فاتورة مورد بدون سند استلام معتمد
    { m: 'يجب ربط الفاتورة بسند استلام معتمد — لا يمكن إنشاء فاتورة مورد بدون سند استلام', t: (d) => !isBlank(d.goodsReceiptId) },
  ],
  SUBCONTRACTOR_INVOICE: [
    { m: 'رقم المستخلص مطلوب', t: (d) => !isBlank(d.invoiceNo) },
    { m: 'اختيار مقاول الباطن مطلوب', t: (d) => !isBlank(d.subcontractorId) },
    { m: 'المبلغ الأساسي يجب أن يكون أكبر من صفر', t: (d) => num(d.baseAmount) > 0 },
  ],
  SUBCONTRACTOR_PAYMENT: [
    { m: 'اختيار مقاول الباطن مطلوب', t: (d) => !isBlank(d.subcontractorId) },
    { m: 'تاريخ السند مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'مبلغ السداد يجب أن يكون أكبر من صفر', t: (d) => num(d.amount) > 0 },
    { m: 'اختيار حساب السداد مطلوب — لا يمكن ترحيل سند صرف بلا حساب نقدي/بنكي', t: (d) => !isBlank(d.cashAccountCode) },
  ],
  RENTAL_INVOICE: [
    { m: 'رقم الفاتورة مطلوب', t: (d) => !isBlank(d.invoiceNo) },
    { m: 'تاريخ الفاتورة مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'قيمة الفاتورة يجب أن تكون أكبر من صفر', t: (d) => num(d.baseAmount) + num(d.extraCharges) + num(d.deliveryAmount) > 0 },
  ],
  STOCK_MOVEMENT: [
    { m: 'تاريخ الحركة مطلوب', t: (d) => !isBlank(d.date) },
    { m: 'اختيار الصنف مطلوب', t: (d) => !isBlank(d.itemId) },
    { m: 'الكمية يجب أن تكون أكبر من صفر', t: (d) => num(d.quantity) > 0 },
    { m: 'نوع الحركة غير صحيح', t: (d) => ['RECEIVE', 'ISSUE', 'TRANSFER', 'DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_INCREASE', 'ADJUST_DECREASE'].includes(d.type) },
    { m: 'مخزن الاستلام مطلوب', t: (d) => !['RECEIVE', 'ADJUST_INCREASE'].includes(d.type) || !isBlank(d.toWarehouseId) },
    { m: 'مخزن الصرف مطلوب', t: (d) => !['ISSUE', 'DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_DECREASE'].includes(d.type) || !isBlank(d.fromWarehouseId) },
    { m: 'مخزن المصدر ومخزن الوجهة مطلوبان للتحويل', t: (d) => d.type !== 'TRANSFER' || (!isBlank(d.fromWarehouseId) && !isBlank(d.toWarehouseId)) },
    { m: 'لا يمكن التحويل إلى نفس المخزن', t: (d) => d.type !== 'TRANSFER' || d.fromWarehouseId !== d.toWarehouseId },
    { m: 'اختيار المورد مطلوب عند الاستلام بذمة مورد', t: (d) => d.type !== 'RECEIVE' || d.sourceType !== 'SUPPLIER' || !isBlank(d.supplierId) },
    { m: 'اختيار الحساب النقدي مطلوب عند الشراء النقدي', t: (d) => d.type !== 'RECEIVE' || d.sourceType !== 'CASH' || !isBlank(d.cashAccountCode) },
    { m: 'اختيار المسؤول المُحمّل عليه التلف مطلوب في التلف غير الطبيعي', t: (d) => d.type !== 'DAMAGE_ABNORMAL' || !isBlank(d.responsibleName) },
    { m: 'تكلفة الوحدة مطلوبة للتلف وتسويات الجرد لإثبات القيمة المحاسبية', t: (d) => !['DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_INCREASE', 'ADJUST_DECREASE'].includes(d.type) || num(d.unitCost) > 0 },
  ],
};

function assertValid(operationType, data) {
  const rules = RULES[operationType] || [];
  const errors = rules.filter((r) => !r.t(data || {})).map((r) => r.m);
  if (errors.length) throw new Error(errors[0]);
}

// ─── سير العمل: الانتقالات المسموحة ──────────────────────────────────────────
const TRANSITIONS = {
  SALES_INVOICE: {
    DRAFT: ['SENT', 'CANCELLED'], SENT: ['PARTIALLY_PAID', 'PAID', 'OVERDUE', 'CANCELLED'],
    PARTIALLY_PAID: ['PAID', 'OVERDUE', 'CANCELLED'], OVERDUE: ['PARTIALLY_PAID', 'PAID', 'CANCELLED'],
    PAID: [], CANCELLED: [],
  },
  PURCHASE_ORDER: {
    DRAFT: ['APPROVED', 'CANCELLED'], APPROVED: ['ORDERED', 'CANCELLED'],
    ORDERED: ['RECEIVED', 'CANCELLED'], RECEIVED: [], CANCELLED: [],
  },
  RENTAL_CONTRACT: {
    DRAFT: ['ACTIVE', 'CANCELLED'], ACTIVE: ['COMPLETED', 'CANCELLED'], COMPLETED: [], CANCELLED: [],
  },
  PAYROLL: { DRAFT: ['APPROVED'], APPROVED: ['PAID'], PAID: [] },
};

function assertTransition(docType, from, to) {
  if (!from || from === to) return;
  const map = TRANSITIONS[docType];
  if (!map) return;
  const allowed = map[from];
  if (!allowed) return;
  if (!allowed.includes(to)) {
    throw new Error(`لا يمكن الانتقال من الحالة "${from}" إلى "${to}" — انتقال غير مسموح في سير العمل`);
  }
}

// ─── الترحيل الدلالي: حل الأدوار من الدليل المحاسبي ───────────────────────────
function resolveAccount(role, accounts) {
  const fromChart = (accounts || []).find((a) => a.semanticRole === role && a.isActive !== false);
  if (fromChart) return { code: fromChart.code, name: fromChart.name };
  const fallback = ACCOUNTS[role];
  if (fallback) return { code: fallback.code, name: fallback.name };
  return { code: '????', name: `دور غير معرّف: ${role}`, unmapped: true };
}

// أدوار الذمم التي تُوسم بالطرف (عميل/مورد) لبناء الكشوفات من القيود المرحّلة.
const PARTY_ROLE_TYPE = { RECEIVABLES: 'CLIENT', PAYABLES: 'SUPPLIER', SUB_PAYABLES: 'SUBCONTRACTOR' };

function buildLinesFromTemplate(template, amounts, accounts, description, party) {
  const lines = [];
  const unmappedRoles = [];
  for (const tl of template.lines || []) {
    const amount = +(amounts[tl.amountField] || 0);
    if (tl.optional && amount <= 0) continue;
    const acc = resolveAccount(tl.semanticRole, accounts);
    if (acc.unmapped) unmappedRoles.push(tl.semanticRole);
    const line = {
      accountCode: acc.code, accountName: acc.name,
      debit: tl.side === 'DEBIT' ? amount : 0,
      credit: tl.side === 'CREDIT' ? amount : 0,
      description: tl.description || description || '',
    };
    // وسم سطر الذمم بالطرف المطابق لدوره الدلالي (عميل لذمم مدينة، مورد لذمم دائنة).
    if (party && PARTY_ROLE_TYPE[tl.semanticRole] === party.type) {
      line.partyType = party.type; line.partyId = party.id; line.partyName = party.name;
    }
    lines.push(line);
  }
  const totalDebit = +lines.reduce((s, l) => s + l.debit, 0).toFixed(2);
  const totalCredit = +lines.reduce((s, l) => s + l.credit, 0).toFixed(2);
  return { lines, totalDebit, totalCredit, unmappedRoles };
}

async function buildJEFromTemplate(base44, operationType, meta, amounts, party) {
  const [accounts, templates] = await Promise.all([
    base44.asServiceRole.entities.ChartAccount.list('code', 1000),
    base44.asServiceRole.entities.PostingTemplate.filter({ operationType, isActive: true }),
  ]);
  const template = (templates || [])[0];
  if (!template) return null;
  const { lines, totalDebit, totalCredit, unmappedRoles } = buildLinesFromTemplate(template, amounts, accounts || [], meta.description, party);
  if (unmappedRoles.length > 0) {
    throw new Error(`أدوار محاسبية غير معرّفة في الدليل: ${unmappedRoles.join(', ')} — لا يمكن ترحيل القيد ${meta.entryNo}`);
  }
  return { entryNo: meta.entryNo, date: meta.date, description: meta.description, sourceType: meta.sourceType, isPosted: true, totalDebit, totalCredit, lines };
}

async function buildJE(base44, operationType, meta, amounts, fallbackBuilder, party) {
  const fromTemplate = await buildJEFromTemplate(base44, operationType, meta, amounts, party);
  return fromTemplate || fallbackBuilder();
}

// ─── بناة القيود الثابتة ──────────────────────────────────────────────────────
// خريطة طرق الدفع → الحساب المدين (للبيع النقدي: الصندوق/البنك/البطاقة).
// السياسة المحاسبية الإلزامية:
//   - البيع النقدي (CASH/CARD_*): مدين = الحساب النقدي المعني، NO ذمم عملاء.
//   - البيع الآجل (CREDIT بدون دفع): مدين = ذمم العملاء.
//   - بيع المنصات (isPlatformSale): مدين = ذمم المنصات (مع partyType=PLATFORM).
//   - الدفع المتعدد: يُنشأ سطر مدين لكل طريقة دفع بقيمتها.
const PAYMENT_METHOD_ACCOUNTS = {
  CASH:       ACCOUNTS.CASH,
  CARD_MADA:  ACCOUNTS.CARD_MADA,
  CARD_VISA:  ACCOUNTS.CARD_VISA,
  CARD_MC:    ACCOUNTS.CARD_MC,
  CARD_OTHER: ACCOUNTS.CARD_OTHER,
  BANK:       ACCOUNTS.BANK,
};

function buildSalesInvoiceJE({ invoiceNo, date, clientId, clientName, subtotal, vatAmount, totalAmount, invoiceType, projectName, payments, isPlatformSale, platformId, platformName, platformCommission, platformCommissionVat, settlementMethod }) {
  const rev = invoiceType === 'RENTAL' ? ACCOUNTS.REVENUE_RENTAL : invoiceType === 'SERVICE' ? ACCOUNTS.REVENUE_SERVICE : ACCOUNTS.REVENUE_SALES;
  const costCenter = projectName || '';
  const vat = num(vatAmount);
  const commission = num(platformCommission);
  const commissionVat = num(platformCommissionVat);
  // طريقة التسوية: NET (افتراضي) = المنصة تخصم العمولة قبل التحويل، GROSS = تحويل بالإجمالي ثم فاتورة عمولة لاحقاً.
  const method = settlementMethod === 'GROSS' ? 'GROSS' : 'NET';

  // قرر سطور المدين حسب نوع البيع وطرق الدفع.
  let debitLines = [];

  if (isPlatformSale) {
    if (method === 'NET') {
      // NET: المنصة تخصم العمولة (وvat العمولة) وتُحوّل الصافي للمطعم لاحقاً.
      // القيد عند البيع:
      //   مدين: ذمم المنصة (الصافي = total - commission - commissionVat)
      //   مدين: مصروف العمولة (commission)
      //   مدين: ضريبة العمولة المدفوعة (commissionVat)
      //   دائن: إيراد المبيعات (subtotal) + ضريبة المبيعات (vatAmount)
      const netReceivable = num(totalAmount) - commission - commissionVat;
      if (netReceivable < -0.01) {
        throw new Error(`العمولة (${commission}) + ضريبتها (${commissionVat}) تتجاوز إجمالي الفاتورة (${totalAmount}) للمنصة ${platformName || ''}`);
      }
      debitLines.push({
        accountCode: ACCOUNTS.PLATFORM_RECEIVABLE.code,
        accountName: ACCOUNTS.PLATFORM_RECEIVABLE.name,
        debit: +netReceivable.toFixed(2), credit: 0,
        description: `صافي مستحق منصة ${platformName || ''} ${invoiceNo}`,
        partyType: 'PLATFORM', partyId: platformId || '', partyName: platformName || '',
        costCenter,
      });
      if (commission > 0) {
        debitLines.push({
          accountCode: ACCOUNTS.COMMISSION_EXPENSE.code,
          accountName: ACCOUNTS.COMMISSION_EXPENSE.name,
          debit: +commission.toFixed(2), credit: 0,
          description: `عمولة منصة ${platformName || ''} ${invoiceNo}`,
          costCenter,
        });
      }
      if (commissionVat > 0) {
        debitLines.push({
          accountCode: ACCOUNTS.COMMISSION_VAT_INPUT.code,
          accountName: ACCOUNTS.COMMISSION_VAT_INPUT.name,
          debit: +commissionVat.toFixed(2), credit: 0,
          description: `ضريبة عمولة منصة ${platformName || ''} ${invoiceNo}`,
          costCenter,
        });
      }
    } else {
      // GROSS: المنصة تحوّل بالإجمالي ثم تصدر فاتورة عمولة مستقلة لاحقاً.
      // القيد عند البيع:
      //   مدين: ذمم المنصة (الإجمالي كاملاً = totalAmount)
      //   دائن: إيراد المبيعات (subtotal) + ضريبة المبيعات (vatAmount)
      // العمولة وضريبتها تُسجّلان عند التسوية (createPlatformSettlement) لأن المنصة
      // تخصمها من المحوّل وتُرسل فاتورة عمولة مستقلة.
      debitLines.push({
        accountCode: ACCOUNTS.PLATFORM_RECEIVABLE.code,
        accountName: ACCOUNTS.PLATFORM_RECEIVABLE.name,
        debit: num(totalAmount), credit: 0,
        description: `إجمالي مستحق منصة ${platformName || ''} ${invoiceNo} (GROSS)`,
        partyType: 'PLATFORM', partyId: platformId || '', partyName: platformName || '',
        costCenter,
      });
    }
  } else if (Array.isArray(payments) && payments.length > 0) {
    // بيع نقدي بطرق دفع واحدة أو أكثر: سطر مدين لكل طريقة دفع.
    // ندمج نفس الطريقة (مثلاً دفعتين نقداً) في سطر واحد لتجنب تكرار السطور.
    // ملاحظة حرجة: المدين يجب أن يساوي الإجمالي (totalAmount)، وليس المبلغ المستلم.
    // إن دفع الزبون أكثر من الإجمالي (cashReceived > total)، الباقي للزبون لا يُسجّل
    // كذمة بل يُعطى نقداً للزبون — لذلك نقصر المدين على totalAmount مع توزيع النسبة.
    const merged = {};
    let totalPaidRaw = 0;
    for (const p of payments) {
      const m = p.method || p.type || 'CASH';
      merged[m] = (merged[m] || 0) + num(p.amount);
      totalPaidRaw += num(p.amount);
    }
    // إن كان المستلم > الإجمالي، اضبط النسب لتتطابق مع totalAmount
    const adjustmentFactor = totalPaidRaw > num(totalAmount) ? num(totalAmount) / totalPaidRaw : 1;
    for (const [method, amount] of Object.entries(merged)) {
      const acc = PAYMENT_METHOD_ACCOUNTS[method] || ACCOUNTS.CASH;
      const adjustedAmount = +(amount * adjustmentFactor).toFixed(2);
      debitLines.push({
        accountCode: acc.code, accountName: acc.name,
        debit: adjustedAmount, credit: 0,
        description: `تحصيل ${invoiceNo} — ${acc.name}`,
        costCenter,
      });
    }
  } else {
    // بيع آجل بدون دفع: ذمم العملاء
    debitLines.push({
      accountCode: ACCOUNTS.RECEIVABLES.code, accountName: ACCOUNTS.RECEIVABLES.name,
      debit: num(totalAmount), credit: 0,
      description: `فاتورة آجلة ${invoiceNo}`,
      partyType: 'CLIENT', partyId: clientId || '', partyName: clientName || '',
      costCenter,
    });
  }

  const creditLines = [
    { accountCode: rev.code, accountName: rev.name, debit: 0, credit: num(subtotal), description: 'إيرادات المبيعات', costCenter },
    ...(vat > 0 ? [{ accountCode: ACCOUNTS.VAT_PAYABLE.code, accountName: ACCOUNTS.VAT_PAYABLE.name, debit: 0, credit: vat, description: 'ضريبة القيمة المضافة 15%', costCenter }] : []),
  ];

  const lines = [...debitLines, ...creditLines];
  // تحقق التوازن (المدين يجب أن يساوي الدائن).
  const totalDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  const diff = totalDebit - totalCredit;
  if (Math.abs(diff) > 0.01) {
    throw new Error(`اختلال توازن القيد لفاتورة ${invoiceNo}: المدين ${totalDebit.toFixed(2)} مقابل الدائن ${totalCredit.toFixed(2)} (الفرق ${diff.toFixed(2)})`);
  }

  return {
    entryNo: `JE-SINV-${invoiceNo}`, date,
    description: `فاتورة مبيعات ${invoiceNo} — ${clientName}${projectName ? ` — ${projectName}` : ''}${isPlatformSale ? ` — منصة ${platformName || ''}` : ''}`,
    sourceType: 'SalesInvoice', isPosted: true,
    totalDebit: +totalDebit.toFixed(2), totalCredit: +totalCredit.toFixed(2),
    lines,
  };
}

function buildPurchaseOrderJE({ orderNo, date, supplierId, supplierName, baseAmount, vatAmount, grandTotal }) {
  return {
    entryNo: `JE-PO-${orderNo}`, date, description: `أمر شراء ${orderNo} — ${supplierName}`, sourceType: 'PurchaseOrder', isPosted: true,
    totalDebit: grandTotal, totalCredit: grandTotal,
    lines: [
      { accountCode: ACCOUNTS.EXPENSE_PURCHASE.code, accountName: ACCOUNTS.EXPENSE_PURCHASE.name, debit: baseAmount, credit: 0, description: 'مواد وبضاعة' },
      ...(vatAmount > 0 ? [{ accountCode: ACCOUNTS.VAT_RECEIVABLE.code, accountName: ACCOUNTS.VAT_RECEIVABLE.name, debit: vatAmount, credit: 0, description: 'ضريبة مدفوعة' }] : []),
      { accountCode: ACCOUNTS.PAYABLES.code, accountName: ACCOUNTS.PAYABLES.name, debit: 0, credit: grandTotal, description: `مستحقات ${supplierName}`, partyType: 'SUPPLIER', partyId: supplierId, partyName: supplierName },
    ],
  };
}

function buildExpenseJE({ date, description, amount, vatAmount, totalAmount, reference, accountRole, expenseAccount, paymentAccount, projectName }) {
  // أولوية الحساب الذي اختاره المستخدم من الدليل، ثم الحساب الافتراضي حسب النوع.
  const debitAccount = expenseAccount || EXPENSE_TYPE_ACCOUNTS[accountRole] || ACCOUNTS.EXPENSE_GENERAL;
  // طرف السداد: الحساب النقدي المختار (صندوق/بنك/عهد)، وإلا البنك افتراضياً.
  const creditAccount = paymentAccount || ACCOUNTS.BANK;
  // مركز التكلفة: اسم المشروع إن وُجد، ليظهر في تحليل مراكز التكلفة
  const costCenter = projectName || '';
  return {
    entryNo: `JE-EXP-${reference || Date.now()}`, date, description: `مصروف: ${description}`, sourceType: 'Expense', isPosted: true,
    totalDebit: totalAmount, totalCredit: totalAmount,
    lines: [
      { accountCode: debitAccount.code, accountName: debitAccount.name, debit: amount, credit: 0, description, costCenter },
      ...(vatAmount > 0 ? [{ accountCode: ACCOUNTS.VAT_RECEIVABLE.code, accountName: ACCOUNTS.VAT_RECEIVABLE.name, debit: vatAmount, credit: 0, description: 'ضريبة مدفوعة', costCenter }] : []),
      { accountCode: creditAccount.code, accountName: creditAccount.name, debit: 0, credit: totalAmount, description: 'سداد المصروف', costCenter },
    ],
  };
}

const AR_MONTHS = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر'];

// قيد الاستحقاق: يثبت إجمالي تكلفة الرواتب، ويفصل الخصومات عن صافي المستحق.
//   من ح/ مصروف الرواتب (إجمالي الرواتب والبدلات)
//   إلى ح/ رواتب مستحقة الدفع (الصافي) + ح/ ذمم الموظفين/السلف (الخصومات)
function buildPayrollAccrualJE({ code, month, year, totalSalaries, totalAllowances, totalDeductions, netAmount }, accounts) {
  const monthName = AR_MONTHS[(month || 1) - 1];
  const date = `${year}-${String(month).padStart(2, '0')}-01`;
  const salaryExp = resolveAccount('EXPENSE_SALARIES', accounts);
  const accrued = resolveAccount('ACCRUED_SALARIES', accounts);
  const staffReceivable = resolveAccount('STAFF_RECEIVABLE', accounts);
  const gross = +(num(totalSalaries) + num(totalAllowances)).toFixed(2);
  const deductions = +num(totalDeductions).toFixed(2);
  const net = +num(netAmount || (gross - deductions)).toFixed(2);
  return {
    entryNo: `JE-PAY-${code}`, date, description: `استحقاق رواتب ${monthName} ${year}`, sourceType: 'PayrollRun', isPosted: true,
    totalDebit: gross, totalCredit: gross,
    lines: [
      { accountCode: salaryExp.code, accountName: salaryExp.name, debit: gross, credit: 0, description: `مصروف رواتب ${monthName}` },
      { accountCode: accrued.code, accountName: accrued.name, debit: 0, credit: net, description: 'صافي رواتب مستحقة الدفع' },
      ...(deductions > 0 ? [{ accountCode: staffReceivable.code, accountName: staffReceivable.name, debit: 0, credit: deductions, description: 'استقطاعات وسلف موظفين' }] : []),
    ],
  };
}

// قيد السداد: يُنشأ فقط عند الدفع — يُنقص الالتزام والنقدية.
//   من ح/ رواتب مستحقة الدفع (مدين)  إلى ح/ النقدية المختارة (دائن)
function buildPayrollPaymentJE({ code, month, year, netAmount, paymentDate, paymentAccountCode, paymentAccountName }, accounts) {
  const monthName = AR_MONTHS[(month || 1) - 1];
  const accrued = resolveAccount('ACCRUED_SALARIES', accounts);
  const cash = { code: paymentAccountCode, name: paymentAccountName || 'النقدية' };
  return {
    entryNo: `JE-PAYPAID-${code}`, date: paymentDate, description: `سداد رواتب ${monthName} ${year}`, sourceType: 'PayrollRun', isPosted: true,
    totalDebit: netAmount, totalCredit: netAmount,
    lines: [
      { accountCode: accrued.code, accountName: accrued.name, debit: netAmount, credit: 0, description: 'سداد رواتب مستحقة' },
      { accountCode: cash.code, accountName: cash.name, debit: 0, credit: netAmount, description: `دفع من ${cash.name}` },
    ],
  };
}

function buildRentalJE({ contractNo, date, clientId, clientName, base, vatAmount, totalAmount }) {
  return {
    entryNo: `JE-RC-${contractNo}`, date: date || new Date().toISOString().slice(0, 10), description: `عقد تأجير ${contractNo} — ${clientName}`, sourceType: 'RentalContract', isPosted: true,
    totalDebit: totalAmount, totalCredit: totalAmount,
    lines: [
      { accountCode: ACCOUNTS.RECEIVABLES.code, accountName: ACCOUNTS.RECEIVABLES.name, debit: totalAmount, credit: 0, description: `عقد ${contractNo}`, partyType: 'CLIENT', partyId: clientId, partyName: clientName },
      { accountCode: ACCOUNTS.REVENUE_RENTAL.code, accountName: ACCOUNTS.REVENUE_RENTAL.name, debit: 0, credit: base, description: 'إيراد التأجير' },
      ...(vatAmount > 0 ? [{ accountCode: ACCOUNTS.VAT_PAYABLE.code, accountName: ACCOUNTS.VAT_PAYABLE.name, debit: 0, credit: vatAmount, description: 'ضريبة القيمة المضافة 15%' }] : []),
    ],
  };
}

// تحصيل من عميل: من ح/ النقدية المختارة (مدين) إلى ح/ ذمم العملاء (دائن)
function buildClientPaymentJE({ paymentNo, date, clientId, clientName, amount, cashAccountCode, cashAccountName, projectName }, accounts) {
  const receivables = resolveAccount('RECEIVABLES', accounts);
  const cash = { code: cashAccountCode, name: cashAccountName || 'النقدية' };
  const ref = paymentNo || `${date}-${clientName || ''}`;
  const costCenter = projectName || '';
  return {
    entryNo: `JE-RCPT-${ref}`, date, description: `تحصيل من ${clientName || 'عميل'}${projectName ? ` — ${projectName}` : ''}`, sourceType: 'ClientPayment', isPosted: true,
    totalDebit: amount, totalCredit: amount,
    lines: [
      { accountCode: cash.code, accountName: cash.name, debit: amount, credit: 0, description: `تحصيل في ${cash.name}`, costCenter },
      { accountCode: receivables.code, accountName: receivables.name, debit: 0, credit: amount, description: `سداد ذمة ${clientName || ''}`, partyType: 'CLIENT', partyId: clientId, partyName: clientName, costCenter },
    ],
  };
}

// سداد لمورد: من ح/ ذمم الموردين (مدين) إلى ح/ النقدية المختارة (دائن)
function buildSupplierPaymentJE({ paymentNo, date, supplierId, supplierName, amount, cashAccountCode, cashAccountName, projectName }, accounts) {
  const payables = resolveAccount('PAYABLES', accounts);
  const cash = { code: cashAccountCode, name: cashAccountName || 'النقدية' };
  const ref = paymentNo || `${date}-${supplierName || ''}`;
  const costCenter = projectName || '';
  return {
    entryNo: `JE-PMT-${ref}`, date, description: `سداد إلى ${supplierName || 'مورد'}${projectName ? ` — ${projectName}` : ''}`, sourceType: 'SupplierPayment', isPosted: true,
    totalDebit: amount, totalCredit: amount,
    lines: [
      { accountCode: payables.code, accountName: payables.name, debit: amount, credit: 0, description: `سداد ذمة ${supplierName || ''}`, partyType: 'SUPPLIER', partyId: supplierId, partyName: supplierName, costCenter },
      { accountCode: cash.code, accountName: cash.name, debit: 0, credit: amount, description: `دفع من ${cash.name}`, costCenter },
    ],
  };
}

// فاتورة مورد (التزام): من ح/ مشتريات + ضريبة مدفوعة (مدين) إلى ح/ ذمم الموردين (دائن)
// مركز التكلفة = المشروع (فتقع التكلفة على المشروع) وإلا المخزن.
function buildSupplierInvoiceJE({ invoiceNo, date, supplierId, supplierName, baseAmount, vatAmount, totalAmount, projectName, warehouseName }, accounts) {
  const purchase = resolveAccount('EXPENSE_PURCHASE', accounts);
  const vatRec = resolveAccount('VAT_RECEIVABLE', accounts);
  const payables = resolveAccount('PAYABLES', accounts);
  const costCenter = projectName || warehouseName || '';
  return {
    entryNo: `JE-SUPINV-${invoiceNo}`, date, description: `فاتورة مورد ${invoiceNo} — ${supplierName || ''}`, sourceType: 'SupplierInvoice', isPosted: true,
    totalDebit: totalAmount, totalCredit: totalAmount,
    lines: [
      { accountCode: purchase.code, accountName: purchase.name, debit: baseAmount, credit: 0, description: `مشتريات ومواد${projectName ? ` — ${projectName}` : ''}`, costCenter },
      ...(vatAmount > 0 ? [{ accountCode: vatRec.code, accountName: vatRec.name, debit: vatAmount, credit: 0, description: 'ضريبة مدفوعة' }] : []),
      { accountCode: payables.code, accountName: payables.name, debit: 0, credit: totalAmount, description: `مستحقات ${supplierName || ''}`, partyType: 'SUPPLIER', partyId: supplierId, partyName: supplierName },
    ],
  };
}

// مستخلص مقاول باطن (التزام): من ح/ مصروفات المشاريع + ضريبة مدفوعة (مدين)
//   إلى ح/ ذمم مقاولي الباطن (بالصافي بعد المحتجز) + ح/ محتجزات مقاولي الباطن (دائن).
function buildSubcontractorInvoiceJE({ invoiceNo, subcontractorId, subcontractorName, date, baseAmount, retentionAmount, vatAmount, totalAmount }, accounts) {
  const expense = resolveAccount('EXPENSE_PROJECT', accounts);
  const vatRec = resolveAccount('VAT_RECEIVABLE', accounts);
  const subPay = resolveAccount('SUB_PAYABLES', accounts);
  const retention = resolveAccount('RETENTION_PAYABLE', accounts);
  const net = +(num(baseAmount) - num(retentionAmount)).toFixed(2);
  const payable = +(net + num(vatAmount)).toFixed(2);
  return {
    entryNo: `JE-SUBINV-${invoiceNo}`, date: date || new Date().toISOString().slice(0, 10), description: `مستخلص مقاول باطن ${invoiceNo} — ${subcontractorName || ''}`, sourceType: 'SubcontractorInvoice', isPosted: true,
    totalDebit: +(num(baseAmount) + num(vatAmount)).toFixed(2), totalCredit: +(num(baseAmount) + num(vatAmount)).toFixed(2),
    lines: [
      { accountCode: expense.code, accountName: expense.name, debit: num(baseAmount), credit: 0, description: 'أعمال مقاول باطن' },
      ...(num(vatAmount) > 0 ? [{ accountCode: vatRec.code, accountName: vatRec.name, debit: num(vatAmount), credit: 0, description: 'ضريبة مدفوعة' }] : []),
      { accountCode: subPay.code, accountName: subPay.name, debit: 0, credit: payable, description: `مستحقات ${subcontractorName || ''}`, partyType: 'SUBCONTRACTOR', partyId: subcontractorId, partyName: subcontractorName },
      ...(num(retentionAmount) > 0 ? [{ accountCode: retention.code, accountName: retention.name, debit: 0, credit: num(retentionAmount), description: `محتجز ${subcontractorName || ''}`, partyType: 'SUBCONTRACTOR', partyId: subcontractorId, partyName: subcontractorName }] : []),
    ],
  };
}

// فاتورة تأجير (إيراد): من ح/ ذمم العملاء (مدين) إلى ح/ إيراد التأجير + ضريبة محصلة (دائن)
function buildSubcontractorPaymentJE({ paymentNo, date, subcontractorId, subcontractorName, amount, cashAccountCode, cashAccountName }, accounts) {
  const subPay = resolveAccount('SUB_PAYABLES', accounts);
  const cash = { code: cashAccountCode, name: cashAccountName || 'النقدية' };
  const ref = paymentNo || `${date}-${subcontractorName || ''}`;
  return {
    entryNo: `JE-SUBPAY-${ref}`, date, description: `سداد مقاول باطن ${subcontractorName || ''}`, sourceType: 'SubcontractorPayment', isPosted: true,
    totalDebit: amount, totalCredit: amount,
    lines: [
      { accountCode: subPay.code, accountName: subPay.name, debit: amount, credit: 0, description: `سداد ذمة ${subcontractorName || ''}`, partyType: 'SUBCONTRACTOR', partyId: subcontractorId, partyName: subcontractorName },
      { accountCode: cash.code, accountName: cash.name, debit: 0, credit: amount, description: `دفع من ${cash.name}` },
    ],
  };
}

function buildRentalInvoiceJE({ invoiceNo, date, clientId, clientName, baseAmount, vatAmount, totalAmount }, accounts) {
  const receivables = resolveAccount('RECEIVABLES', accounts);
  const revenue = resolveAccount('REVENUE_RENTAL', accounts);
  const vatPay = resolveAccount('VAT_PAYABLE', accounts);
  return {
    entryNo: `JE-RINV-${invoiceNo}`, date, description: `فاتورة تأجير ${invoiceNo} — ${clientName || ''}`, sourceType: 'RentalInvoice', isPosted: true,
    totalDebit: totalAmount, totalCredit: totalAmount,
    lines: [
      { accountCode: receivables.code, accountName: receivables.name, debit: totalAmount, credit: 0, description: `فاتورة ${invoiceNo}`, partyType: 'CLIENT', partyId: clientId, partyName: clientName },
      { accountCode: revenue.code, accountName: revenue.name, debit: 0, credit: baseAmount, description: 'إيراد التأجير' },
      ...(vatAmount > 0 ? [{ accountCode: vatPay.code, accountName: vatPay.name, debit: 0, credit: vatAmount, description: 'ضريبة القيمة المضافة 15%' }] : []),
    ],
  };
}

// ─── الحركات المخزنية ─────────────────────────────────────────────────────────
// استلام: من ح/ المخزون (مدين) إلى ح/ (ذمم المورد | النقدية | رصيد افتتاحي) دائن.
// صرف على مشروع: من ح/ مصروفات المشاريع (مدين) إلى ح/ المخزون (دائن) — نقل القيمة إلى تكلفة المشروع.
// تحويل بين مخازن: قيد تذكيري بنفس حساب المخزون مع وسم مركز التكلفة لكل طرف.
function buildStockMovementJE(m, accounts) {
  const inventory = resolveAccount('INVENTORY_MATERIALS', accounts);
  const total = +num(m.totalCost).toFixed(2);
  const itemDesc = `${m.itemName || ''}${m.quantity ? ` × ${m.quantity}` : ''}`;

  if (m.type === 'RECEIVE') {
    let creditAcc, creditParty = null, creditDesc;
    if (m.sourceType === 'SUPPLIER') {
      creditAcc = resolveAccount('PAYABLES', accounts);
      creditParty = { type: 'SUPPLIER', id: m.supplierId, name: m.supplierName };
      creditDesc = `مستحقات ${m.supplierName || 'مورد'}`;
    } else if (m.sourceType === 'CASH') {
      creditAcc = { code: m.cashAccountCode, name: m.cashAccountName || 'النقدية' };
      creditDesc = `شراء نقدي من ${creditAcc.name}`;
    } else {
      creditAcc = resolveAccount('OPENING_BALANCE_EQUITY', accounts);
      creditDesc = 'رصيد افتتاحي مخزون';
    }
    const creditLine = { accountCode: creditAcc.code, accountName: creditAcc.name, debit: 0, credit: total, description: creditDesc };
    if (creditParty && creditParty.id) { creditLine.partyType = creditParty.type; creditLine.partyId = creditParty.id; creditLine.partyName = creditParty.name; }
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `استلام مخزون ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        { accountCode: inventory.code, accountName: inventory.name, debit: total, credit: 0, description: `إدخال ${itemDesc} — ${m.toWarehouseName || ''}`, costCenter: m.toWarehouseName || '' },
        creditLine,
      ],
    };
  }

  if (m.type === 'ISSUE') {
    const expense = resolveAccount('EXPENSE_PROJECT', accounts);
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `صرف مخزون ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        { accountCode: expense.code, accountName: expense.name, debit: total, credit: 0, description: `استهلاك ${itemDesc}${m.projectName ? ` — ${m.projectName}` : ''}`, costCenter: m.projectName || '' },
        { accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: total, description: `صرف من ${m.fromWarehouseName || ''}`, costCenter: m.fromWarehouseName || '' },
      ],
    };
  }

  // DAMAGE_NORMAL — تلف طبيعي: خسارة تشغيلية. من ح/ خسائر تلف المخزون (مدين) إلى ح/ المخزون (دائن).
  if (m.type === 'DAMAGE_NORMAL') {
    const loss = resolveAccount('INVENTORY_LOSS', accounts);
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `تلف طبيعي ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        { accountCode: loss.code, accountName: loss.name, debit: total, credit: 0, description: `تلف طبيعي ${itemDesc}${m.reason ? ` — ${m.reason}` : ''}`, costCenter: m.fromWarehouseName || '' },
        { accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: total, description: `إخراج تالف من ${m.fromWarehouseName || ''}`, costCenter: m.fromWarehouseName || '' },
      ],
    };
  }

  // DAMAGE_ABNORMAL — تلف غير طبيعي محمّل على مسؤول المخزن: من ح/ ذمم مدينة على الموظفين (مدين) إلى ح/ المخزون (دائن).
  if (m.type === 'DAMAGE_ABNORMAL') {
    const staff = resolveAccount('STAFF_RECEIVABLE', accounts);
    const staffLine = { accountCode: staff.code, accountName: staff.name, debit: total, credit: 0, description: `تحميل تلف على ${m.responsibleName || 'المسؤول'}${m.reason ? ` — ${m.reason}` : ''}`, costCenter: m.fromWarehouseName || '' };
    if (m.responsibleId) { staffLine.partyType = 'EMPLOYEE'; staffLine.partyId = m.responsibleId; staffLine.partyName = m.responsibleName; }
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `تلف غير طبيعي ${m.movementNo} — ${itemDesc} — تحميل على ${m.responsibleName || ''}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        staffLine,
        { accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: total, description: `إخراج تالف من ${m.fromWarehouseName || ''}`, costCenter: m.fromWarehouseName || '' },
      ],
    };
  }

  // ADJUST_INCREASE — تسوية جرد بالزيادة: من ح/ المخزون (مدين) إلى ح/ فروقات جرد (دائن).
  if (m.type === 'ADJUST_INCREASE') {
    const gain = resolveAccount('INVENTORY_GAIN', accounts);
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `تسوية جرد بالزيادة ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        { accountCode: inventory.code, accountName: inventory.name, debit: total, credit: 0, description: `زيادة جرد في ${m.toWarehouseName || ''}${m.reason ? ` — ${m.reason}` : ''}`, costCenter: m.toWarehouseName || '' },
        { accountCode: gain.code, accountName: gain.name, debit: 0, credit: total, description: 'فروقات جرد بالزيادة' },
      ],
    };
  }

  // ADJUST_DECREASE — تسوية جرد بالعجز: من ح/ خسائر تلف/هدر المخزون (مدين) إلى ح/ المخزون (دائن).
  if (m.type === 'ADJUST_DECREASE') {
    const loss = resolveAccount('INVENTORY_LOSS', accounts);
    return {
      entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `تسوية جرد بالعجز ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
      totalDebit: total, totalCredit: total,
      lines: [
        { accountCode: loss.code, accountName: loss.name, debit: total, credit: 0, description: `عجز جرد في ${m.fromWarehouseName || ''}${m.reason ? ` — ${m.reason}` : ''}`, costCenter: m.fromWarehouseName || '' },
        { accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: total, description: `إنقاص عجز من ${m.fromWarehouseName || ''}`, costCenter: m.fromWarehouseName || '' },
      ],
    };
  }

  // TRANSFER — نفس حساب المخزون على الطرفين، مع وسم مركز التكلفة لكل مخزن.
  return {
    entryNo: `JE-STK-${m.movementNo}`, date: m.date, description: `تحويل مخزون ${m.movementNo} — ${itemDesc}`, sourceType: 'StockMovement', isPosted: true,
    totalDebit: total, totalCredit: total,
    lines: [
      { accountCode: inventory.code, accountName: inventory.name, debit: total, credit: 0, description: `تحويل وارد إلى ${m.toWarehouseName || ''}`, costCenter: m.toWarehouseName || '' },
      { accountCode: inventory.code, accountName: inventory.name, debit: 0, credit: total, description: `تحويل صادر من ${m.fromWarehouseName || ''}`, costCenter: m.fromWarehouseName || '' },
    ],
  };
}

// يعدّل رصيد صنف في مخزن محدّد وفق المتوسط المرجّح للتكلفة (IAS 2).
//   • عند الإدخال (deltaQty > 0): التكلفة الجديدة = (قيمة الرصيد + قيمة الوارد) ÷ (الكمية الكلية).
//   • عند الإخراج (deltaQty < 0): الكمية تنقص والتكلفة المرجّحة تبقى كما هي.
// يُرجع { avgCost } وهو متوسط تكلفة الوحدة بعد الحركة — يُستخدم لتسعير قيد الإخراج بدقة.
async function adjustStock(base44, itemId, warehouseId, warehouseName, deltaQty, unitCost) {
  if (!warehouseId) return { avgCost: num(unitCost) };
  const item = await base44.asServiceRole.entities.InventoryItem.get(itemId);
  if (!item) return { avgCost: num(unitCost) };
  // السجل الذي يمثّل رصيد الصنف في هذا المخزن: نفس الكود + نفس المخزن.
  const inWarehouse = (await base44.asServiceRole.entities.InventoryItem.filter({ code: item.code, warehouseId })) || [];
  if (inWarehouse.length > 0) {
    const rec = inWarehouse[0];
    const oldQty = num(rec.quantity);
    const oldCost = num(rec.unitCost);
    const newQty = +(oldQty + deltaQty).toFixed(3);
    let avgCost = oldCost;
    if (deltaQty > 0) {
      // متوسط مرجّح: (قيمة القديم + قيمة الوارد) ÷ (الكمية الكلية).
      const totalValue = oldQty * oldCost + deltaQty * num(unitCost);
      avgCost = newQty > 0 ? +(totalValue / newQty).toFixed(4) : num(unitCost);
      await base44.asServiceRole.entities.InventoryItem.update(rec.id, { quantity: newQty, unitCost: avgCost });
    } else {
      // الإخراج بالتكلفة المرجّحة القائمة؛ الكمية فقط تتغيّر.
      await base44.asServiceRole.entities.InventoryItem.update(rec.id, { quantity: newQty });
    }
    return { avgCost };
  }
  if (deltaQty > 0) {
    const avgCost = num(unitCost) || num(item.unitCost);
    await base44.asServiceRole.entities.InventoryItem.create({
      code: item.code, name: item.name, nameEn: item.nameEn, category: item.category, unit: item.unit,
      quantity: +deltaQty.toFixed(3), reorderLevel: item.reorderLevel, unitCost: avgCost,
      warehouseId, warehouseName, isActive: true,
    });
    return { avgCost };
  }
  return { avgCost: num(unitCost) };
}

// يقرأ متوسط تكلفة الوحدة المرجّح لصنف في مخزن محدّد (قبل الإخراج) — لتسعير قيد الصرف/التلف.
async function weightedCostFor(base44, itemId, warehouseId, fallbackUnitCost) {
  if (!itemId || !warehouseId) return num(fallbackUnitCost);
  const item = await base44.asServiceRole.entities.InventoryItem.get(itemId);
  if (!item) return num(fallbackUnitCost);
  const rec = (await base44.asServiceRole.entities.InventoryItem.filter({ code: item.code, warehouseId }))?.[0];
  const cost = num(rec?.unitCost);
  return cost > 0 ? cost : num(fallbackUnitCost);
}

// حركات الإخراج تُسعَّر بالمتوسط المرجّح لتكلفة الصنف في المخزن المصدر (IAS 2)،
// لا بالتكلفة المُدخلة يدوياً — فيعكس القيد والقيمة التكلفة الفعلية للمخزون.
const OUTBOUND_TYPES = ['ISSUE', 'DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_DECREASE'];

async function createStockMovement(base44, data) {
  assertValid('STOCK_MOVEMENT', data);
  const quantity = num(data.quantity);
  let unitCost = num(data.unitCost);

  // للإخراج والتحويل: اعتمد المتوسط المرجّح المخزّن للصنف بدل التكلفة المُدخلة.
  if (data.itemId && (OUTBOUND_TYPES.includes(data.type) || data.type === 'TRANSFER')) {
    unitCost = await weightedCostFor(base44, data.itemId, data.fromWarehouseId, unitCost);
  }
  const totalCost = +(quantity * unitCost).toFixed(2);
  const payload = { ...data, quantity, unitCost, totalCost, journalEntryNo: `JE-STK-${data.movementNo}` };
  const rec = await base44.asServiceRole.entities.StockMovement.create(payload);
  try {
    // القيد يُرحّل فقط عند وجود قيمة (تكلفة > 0)؛ الحركات صفرية القيمة تحدّث الكمية فقط.
    if (totalCost > 0) {
      const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
      await autoPostJE(base44, buildStockMovementJE(payload, accounts));
    }
    // تحديث أرصدة المخازن حسب نوع الحركة (الاستلام يعيد حساب المتوسط المرجّح).
    if (payload.type === 'RECEIVE' || payload.type === 'ADJUST_INCREASE') {
      await adjustStock(base44, payload.itemId, payload.toWarehouseId, payload.toWarehouseName, quantity, unitCost);
    } else if (OUTBOUND_TYPES.includes(payload.type)) {
      await adjustStock(base44, payload.itemId, payload.fromWarehouseId, payload.fromWarehouseName, -quantity, unitCost);
    } else {
      // تحويل: الإخراج بالتكلفة المرجّحة، والإدخال بنفس التكلفة (نقل قيمة بلا ربح/خسارة).
      await adjustStock(base44, payload.itemId, payload.fromWarehouseId, payload.fromWarehouseName, -quantity, unitCost);
      await adjustStock(base44, payload.itemId, payload.toWarehouseId, payload.toWarehouseName, quantity, unitCost);
    }
  } catch (e) {
    await rollback(base44, 'StockMovement', rec.id);
    throw e;
  }
  return rec;
}

// ─── سندات الاستلام (السلسلة: أمر شراء ← استلام جزئي على دفعات ← مخزون) ────────
// المستخدم يؤكد فقط الكمية المستلمة من كل بند من أمر الشراء. خلف الكواليس:
//   • لكل بند بكمية مستلمة > 0 → حركة استلام مخزنية تزيد رصيد المخزون وترحّل قيدها.
//   • تتراكم الكمية المستلمة على بنود الأمر، وتُحدَّث حالة الاستلام (جزئي/مكتمل).
//   • كل ذلك في ترانسكشن واحد مع تراجع كامل عند أي فشل.

// يزيد رصيد صنف في مخزن بالمطابقة على الاسم (بنود أمر الشراء ليست بالضرورة أصناف مخزون معرّفة مسبقاً).
async function receiveStockByName(base44, { name, unit, warehouseId, warehouseName, quantity, unitCost }) {
  if (!warehouseId || !(quantity > 0)) return;
  const existing = (await base44.asServiceRole.entities.InventoryItem.filter({ name, warehouseId })) || [];
  if (existing.length > 0) {
    const rec = existing[0];
    const newQty = +(num(rec.quantity) + quantity).toFixed(3);
    await base44.asServiceRole.entities.InventoryItem.update(rec.id, { quantity: newQty, unitCost: num(unitCost) || rec.unitCost });
  } else {
    await base44.asServiceRole.entities.InventoryItem.create({
      code: `AUTO-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name, unit: unit || '', category: 'MATERIAL',
      quantity: +quantity.toFixed(3), unitCost: num(unitCost),
      warehouseId, warehouseName, isActive: true,
    });
  }
}

// يقارن كميتين بتسامح كسري صغير لتفادي أخطاء العشرية.
function qtyReached(received, ordered) {
  return num(received) >= num(ordered) - 0.001;
}

async function createGoodsReceipt(base44, data) {
  if (isBlank(data.receiptNo)) throw new Error('رقم السند مطلوب');
  if (isBlank(data.date)) throw new Error('تاريخ السند مطلوب');
  if (isBlank(data.purchaseOrderId)) throw new Error('اختر أمر الشراء أولاً');

  const po = await base44.asServiceRole.entities.PurchaseOrder.get(data.purchaseOrderId);
  if (!po) throw new Error('أمر الشراء غير موجود');
  // مخزن الوجهة: إن لم يوجد warehouseId، استخدم projectId (الفرع) كمخزن افتراضي.
  const effectiveWarehouseId = po.warehouseId || po.projectId || '';
  const effectiveWarehouseName = po.warehouseName || po.projectName || '';
  if (isBlank(effectiveWarehouseId)) throw new Error('أمر الشراء بلا مخزن وجهة أو فرع — لا يمكن إدخال المخزون');

  // البنود المستلمة في هذه الدفعة: [{ boqItemId | description, receivingQty }]
  const incoming = Array.isArray(data.lines) ? data.lines : [];
  const orderLines = Array.isArray(po.items) ? po.items.map((l) => ({ ...l })) : [];
  const matched = [];
  for (const inc of incoming) {
    const recvQty = num(inc.receivingQty);
    if (recvQty <= 0) continue;
    const idx = orderLines.findIndex((ol) => (inc.boqItemId && ol.boqItemId === inc.boqItemId) || (!inc.boqItemId && ol.description === inc.description));
    if (idx < 0) continue;
    const ol = orderLines[idx];
    const remaining = +(num(ol.orderedQty) - num(ol.receivedQty)).toFixed(3);
    if (recvQty > remaining + 0.001) throw new Error(`الكمية المستلمة من "${ol.description}" تتجاوز المتبقي (${remaining})`);
    matched.push({ idx, recvQty, line: ol });
  }
  if (matched.length === 0) throw new Error('لم تُدخل أي كمية مستلمة');

  const receivedAmount = +matched.reduce((s, m) => s + m.recvQty * num(m.line.unitPrice), 0).toFixed(2);
  const receiptItems = matched.map((m) => ({
    boqItemId: m.line.boqItemId || '', description: m.line.description, unit: m.line.unit || '',
    receivedQty: m.recvQty, unitPrice: num(m.line.unitPrice),
  }));

  const payload = {
    receiptNo: data.receiptNo, date: data.date,
    purchaseOrderId: po.id, orderNo: po.orderNo,
    supplierId: po.supplierId, supplierName: po.supplierName,
    projectId: po.projectId, projectName: po.projectName,
    warehouseId: po.warehouseId, warehouseName: po.warehouseName,
    receivedAmount, items: receiptItems, status: 'RECEIVED', invoicedStatus: 'PENDING',
    description: data.notes || '', notes: data.notes || '',
  };
  const receipt = await base44.asServiceRole.entities.GoodsReceipt.create(payload);

  try {
    const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
    let seq = 0;
    for (const m of matched) {
      seq += 1;
      const quantity = m.recvQty;
      const unitCost = num(m.line.unitPrice);
      const totalCost = +(quantity * unitCost).toFixed(2);
      const movementNo = `GRN-${payload.receiptNo}-${seq}`;
      // 1) سجل الحركة المخزنية.
      const mv = await base44.asServiceRole.entities.StockMovement.create({
        movementNo, date: payload.date, type: 'RECEIVE', sourceType: 'SUPPLIER',
        itemName: m.line.description, itemCode: m.line.itemNo || '', unit: m.line.unit || '',
        quantity, unitCost, totalCost,
        toWarehouseId: effectiveWarehouseId, toWarehouseName: effectiveWarehouseName,
        supplierId: po.supplierId, supplierName: po.supplierName,
        reference: payload.receiptNo, journalEntryNo: `JE-STK-${movementNo}`,
      });
      // 2) القيد المحاسبي (المخزون مدين / ذمم المورد دائن).
      if (totalCost > 0) {
        await autoPostJE(base44, buildStockMovementJE(mv, accounts));
      }
      // 3) زيادة رصيد المخزون بالمطابقة على الاسم.
      await receiveStockByName(base44, {
        name: m.line.description, unit: m.line.unit, warehouseId: effectiveWarehouseId, warehouseName: effectiveWarehouseName,
        quantity, unitCost,
      });
      // 4) تراكم الكمية المستلمة على بند الأمر.
      orderLines[m.idx].receivedQty = +(num(orderLines[m.idx].receivedQty) + quantity).toFixed(3);
    }
    const allDone = orderLines.every((ol) => qtyReached(ol.receivedQty, ol.orderedQty));
    const anyReceived = orderLines.some((ol) => num(ol.receivedQty) > 0);
    const receiptStatus = allDone ? 'RECEIVED' : anyReceived ? 'PARTIAL' : 'PENDING';
    await base44.asServiceRole.entities.PurchaseOrder.update(po.id, {
      items: orderLines, receiptStatus, status: allDone ? 'RECEIVED' : po.status,
    });
  } catch (e) {
    await rollback(base44, 'GoodsReceipt', receipt.id);
    throw e;
  }
  return receipt;
}

// ─── إنشاء حساب مع رصيد افتتاحي ──────────────────────────────────────────────
function openingBalanceDate(fiscalYears) {
  const openCurrent = (fiscalYears || []).find((y) => y.isCurrent && y.status === 'OPEN' && y.startDate);
  if (openCurrent) return openCurrent.startDate;
  const openAny = (fiscalYears || []).find((y) => y.status === 'OPEN' && y.startDate);
  return openAny?.startDate || new Date().toISOString().slice(0, 10);
}

function buildOpeningBalanceJE(account, amount, accounts, date) {
  const equity = (accounts || []).find((a) => a.semanticRole === 'OPENING_BALANCE_EQUITY' && a.isActive !== false)
    || (accounts || []).find((a) => a.accountType === 'EQUITY' && a.isPostable && a.isActive !== false)
    || ACCOUNTS.OPENING_BALANCE_EQUITY;
  const value = +Math.abs(num(amount)).toFixed(2);
  const onDebit = account.nature === 'DEBIT';
  const desc = `رصيد افتتاحي — ${account.name}`;
  return {
    entryNo: `OB-${account.code}`,
    date,
    description: desc,
    sourceType: 'OPENING_BALANCE',
    isPosted: true,
    totalDebit: value,
    totalCredit: value,
    lines: [
      { accountCode: account.code, accountName: account.name, debit: onDebit ? value : 0, credit: onDebit ? 0 : value, description: desc },
      { accountCode: equity.code, accountName: equity.name, debit: onDebit ? 0 : value, credit: onDebit ? value : 0, description: desc },
    ],
  };
}

async function createChartAccount(base44, data, openingBalance) {
  const account = await base44.asServiceRole.entities.ChartAccount.create(data);
  try {
    if (Math.abs(num(openingBalance)) > 0.001) {
      const [accounts, fiscalYears] = await Promise.all([
        base44.asServiceRole.entities.ChartAccount.list('code', 1000),
        base44.asServiceRole.entities.FiscalYear.filter({}),
      ]);
      await autoPostJE(base44, buildOpeningBalanceJE(account, openingBalance, accounts, openingBalanceDate(fiscalYears)));
    }
  } catch (e) {
    await rollback(base44, 'ChartAccount', account.id);
    throw e;
  }
  return account;
}

// ─── حارس سلامة القيد ─────────────────────────────────────────────────────────
function assertJEIntegrity(je) {
  if (!je) throw new Error('قيد فارغ — لا يوجد قيد لترحيله');
  if (!Array.isArray(je.lines) || je.lines.length < 2) throw new Error(`القيد ${je.entryNo || ''} يجب أن يحتوي سطرين على الأقل (مدين ودائن)`);
  if (je.lines.find((l) => !l.accountCode || l.accountCode === '????')) throw new Error(`القيد ${je.entryNo || ''} يحتوي سطراً بحساب غير معرّف`);
  const sumDebit = +je.lines.reduce((s, l) => s + (+l.debit || 0), 0).toFixed(2);
  const sumCredit = +je.lines.reduce((s, l) => s + (+l.credit || 0), 0).toFixed(2);
  if (Math.abs(sumDebit - sumCredit) >= 0.01) throw new Error(`القيد ${je.entryNo || ''} غير متوازن: مدين ${sumDebit} ≠ دائن ${sumCredit}`);
  if (Math.abs((je.totalDebit || 0) - sumDebit) >= 0.01 || Math.abs((je.totalCredit || 0) - sumCredit) >= 0.01) throw new Error(`القيد ${je.entryNo || ''} إجمالياته لا تطابق سطوره`);
}

// يرفض ترحيل أي قيد ما لم يقع تاريخه داخل سنة مالية مفتوحة.
async function assertPeriodOpen(base44, date) {
  if (!date) return;
  const years = await base44.asServiceRole.entities.FiscalYear.filter({});
  const openYears = (years || []).filter((y) => y.status === 'OPEN');
  if (openYears.length === 0) throw new Error('لا توجد سنة مالية مفتوحة — افتح سنة مالية قبل ترحيل القيود');
  const openMatch = openYears.find((y) => y.startDate && y.endDate && date >= y.startDate && date <= y.endDate);
  if (openMatch) return;
  const locking = (years || []).find((y) =>
    (y.status === 'CLOSED' || y.status === 'LOCKED') &&
    y.startDate && y.endDate && date >= y.startDate && date <= y.endDate
  );
  if (locking) {
    throw new Error(`لا يمكن الترحيل في فترة مقفلة — السنة المالية "${locking.name}" (${locking.status}) تشمل التاريخ ${date}`);
  }
  throw new Error(`تاريخ القيد ${date} لا يقع ضمن سنة مالية مفتوحة`);
}

// يرحّل القيد ذرّياً بصلاحية الخدمة، ويمنع التكرار بنفس رقم القيد، ويرفض الفترة المقفلة.
async function autoPostJE(base44, jeData) {
  assertJEIntegrity(jeData);
  await assertPeriodOpen(base44, jeData.date);
  const existing = await base44.asServiceRole.entities.JournalEntry.filter({ entryNo: jeData.entryNo });
  if (existing && existing.length > 0) return existing[0];
  return await base44.asServiceRole.entities.JournalEntry.create(jeData);
}

// ─── منفّذو العمليات (كل واحد يُنشئ السجل ثم يرحّل القيد ذرّياً مع rollback) ───

// الإنشاء يحفظ الفاتورة كمسودة فقط بلا قيد — القيد يُرحّل عند الاعتماد.
async function createSalesInvoice(base44, data) {
  assertValid('SALES_INVOICE', data);
  // فرض تفرّد رقم الفاتورة — لا يسمح بفواتير بنفس الرقم.
  if (!isBlank(data.invoiceNo)) {
    const existing = await base44.asServiceRole.entities.SalesInvoice.filter({ invoiceNo: data.invoiceNo });
    if (existing && existing.length > 0) {
      throw new Error(`رقم الفاتورة "${data.invoiceNo}" مستخدم بالفعل — استخدم رقماً آخر`);
    }
  }
  const { base: subtotal, vat: vatAmount, total: totalAmount } = calcVAT(data.subtotal, num(data.vatRate) || VAT_RATE);
  const payload = { ...data, subtotal, vatRate: num(data.vatRate) || VAT_RATE, vatAmount, totalAmount, paidAmount: num(data.paidAmount), status: 'DRAFT' };
  return await base44.asServiceRole.entities.SalesInvoice.create(payload);
}

// التعديل مسموح فقط ما دامت الفاتورة مسودة (DRAFT). بعد الاعتماد يُثبت القيد،
// فلا يُعدَّل الماضي: التصحيح يكون بإلغاء/عكس ثم فاتورة جديدة.
// الانتقال من DRAFT لأي حالة أعلى لا يتم عبر التعديل بل عبر مسار الاعتماد (approve)
// الذي يرحّل قيد الإيراد أولاً — بذلك لا توجد فاتورة معترف بها بلا قيد.
async function updateSalesInvoice(base44, id, data, prevStatus) {
  assertValid('SALES_INVOICE', data);
  if (prevStatus && prevStatus !== 'DRAFT') {
    throw new Error('لا يمكن تعديل فاتورة معتمدة — استخدم الإلغاء/العكس ثم أنشئ فاتورة جديدة');
  }
  if (data.status && data.status !== 'DRAFT') {
    throw new Error('لا يمكن تغيير حالة الفاتورة من التعديل — استخدم زر الاعتماد لترحيل القيد أولاً');
  }
  const { base: subtotal, vat: vatAmount, total: totalAmount } = calcVAT(data.subtotal, num(data.vatRate) || VAT_RATE);
  const payload = { ...data, status: 'DRAFT', subtotal, vatRate: num(data.vatRate) || VAT_RATE, vatAmount, totalAmount, paidAmount: num(data.paidAmount) };
  return await base44.asServiceRole.entities.SalesInvoice.update(id, payload);
}

// اعتماد فاتورة مبيعات: يرحّل قيد الإيراد ويحوّل الحالة إلى معتمدة.
// السياسة المحاسبية:
//   - البيع النقدي (payments موجودة): مدين = الصندوق/البنك/البطاقة حسب طريقة الدفع.
//   - بيع المنصات (notes.isPlatformSale): مدين = ذمم المنصات (آجل).
//   - البيع الآجل بدون دفع: مدين = ذمم العملاء.
async function approveSalesInvoice(base44, id) {
  const inv = await base44.asServiceRole.entities.SalesInvoice.get(id);
  if (!inv) throw new Error('الفاتورة غير موجودة');
  if (inv.status !== 'DRAFT') throw new Error('لا يمكن اعتماد إلا الفواتير التي في حالة مسودة');

  // استخراج payments و isPlatformSale من notes (JSON string) إن وُجدت.
  let notesObj = {};
  try {
    notesObj = typeof inv.notes === 'string' && inv.notes.trim().startsWith('{')
      ? JSON.parse(inv.notes)
      : (typeof inv.notes === 'object' && inv.notes ? inv.notes : {});
  } catch { notesObj = {}; }

  const payments = Array.isArray(notesObj.payments) ? notesObj.payments : (Array.isArray(inv.payments) ? inv.payments : []);
  const isPlatformSale = notesObj.isPlatformSale === true || inv.isPlatformSale === true;
  const platformId = notesObj?.platform?.platformId || inv.platformId || '';
  const platformName = notesObj?.platform?.platformName || inv.platformName || '';
  const platformCommission = num(notesObj?.platform?.platformCommission || inv.platformCommission || 0);
  const platformCommissionVat = num(notesObj?.platform?.platformCommissionVat || inv.platformCommissionVat || 0);

  // حمّل طريقة تسوية المنصة (NET/GROSS) من سجل المنصة إن وُجدت.
  let settlementMethod = 'NET';
  if (isPlatformSale && platformId) {
    try {
      const platform = await base44.asServiceRole.entities.DeliveryPlatform.get(platformId);
      if (platform && platform.settlementMethod) settlementMethod = platform.settlementMethod;
    } catch { /* افتراضي NET */ }
  }

  const je = await buildJE(base44, 'SALES_INVOICE',
    { entryNo: `JE-SINV-${inv.invoiceNo}`, date: inv.date, description: `فاتورة مبيعات ${inv.invoiceNo} — ${inv.clientName}`, sourceType: 'SalesInvoice' },
    { base: num(inv.subtotal), vat: num(inv.vatAmount), total: num(inv.totalAmount) },
    () => buildSalesInvoiceJE({
      invoiceNo: inv.invoiceNo, date: inv.date,
      clientId: inv.clientId, clientName: inv.clientName,
      subtotal: inv.subtotal, vatAmount: inv.vatAmount, totalAmount: inv.totalAmount,
      invoiceType: inv.invoiceType, projectName: inv.projectName,
      payments, isPlatformSale, platformId, platformName,
      platformCommission, platformCommissionVat, settlementMethod,
    }),
    { type: 'CLIENT', id: inv.clientId, name: inv.clientName });
  await autoPostJE(base44, je);

  // تحديد الحالة النهائية حسب نوع البيع:
  //   - بيع نقدي (payments موجودة وتغطي الإجمالي): PAID + paidAmount = الإجمالي
  //   - بيع منصة (isPlatformSale): APPROVED (ذمة منصة، paidAmount=0)
  //   - بيع آجل (عميل مسجل بدون دفع): APPROVED (ذمة عميل، paidAmount=0)
  // هذا يمنع التناقض بين الحالة والمدفوع، ويضمن أن البيع النقدي = مدفوع فوراً.
  let finalStatus = 'APPROVED';
  let finalPaidAmount = 0;
  if (!isPlatformSale && Array.isArray(payments) && payments.length > 0) {
    const totalPaid = payments.reduce((s, p) => s + num(p.amount), 0);
    if (totalPaid >= num(inv.totalAmount) - 0.01) {
      finalStatus = 'PAID';
      finalPaidAmount = num(inv.totalAmount);
    } else if (totalPaid > 0) {
      finalStatus = 'PARTIALLY_PAID';
      finalPaidAmount = totalPaid;
    }
  }
  // استخدام update مع خيار internal لتجاوز قيد منع تغيير الحالة المباشر
  // (هذا المسار الوحيد المشروع لتغيير الحالة لأنه يُرحّل القيد أولاً).
  return await base44.asServiceRole.entities.SalesInvoice.update(id, { status: finalStatus, paidAmount: finalPaidAmount });
}

// ─── تسوية المنصة ────────────────────────────────────────────────────────────
// تسوية منصة: تحويل بنكي/استلام نقدي لفواتير منصة في فترة معينة.
// يُخفّض ذمة المنصة (1115) ويُسجّل التحصيل في البنك/الصندوق.
// القيد:
//   مدين: البنك/الصندوق (settledAmount)
//   دائن: ذمم المنصة (settledAmount) — مع partyType=PLATFORM
// لا يُعاد احتساب العمولة هنا (سُجّلت عند اعتماد الفاتورة).
// التسوية تُربط بقائمة الفواتير المُسوّاة (invoiceIds) للمتابعة.
async function createPlatformSettlement(base44, data) {
  assertValid('PLATFORM_SETTLEMENT', data);
  if (!data.platformId) throw new Error('معرّف المنصة مطلوب');
  if (!data.settledAmount || num(data.settledAmount) <= 0) throw new Error('مبلغ التسوية يجب أن يكون موجباً');

  const platform = await base44.asServiceRole.entities.DeliveryPlatform.get(data.platformId);
  if (!platform) throw new Error('المنصة غير موجودة');

  const settlementNo = data.settlementNo || `SET-PL-${Date.now().toString().slice(-8)}`;
  const date = data.date || new Date().toISOString().slice(0, 10);
  const cashAmount = num(data.settledAmount);
  const method = platform.settlementMethod === 'GROSS' ? 'GROSS' : 'NET';

  // الحساب النقدي المستلم عليه (بنك افتراضياً)
  const cashCode = data.settlementAccountCode || platform.settlementAccountCode || ACCOUNTS.BANK.code;
  const cashName = cashCode === ACCOUNTS.CASH.code ? ACCOUNTS.CASH.name
    : cashCode === ACCOUNTS.BANK.code ? ACCOUNTS.BANK.name
    : 'الحساب المختار';

  // بناء سطور القيد حسب طريقة التسوية.
  // NET: المنصة خصمت العمولة عند البيع، التسوية = تحصيل نقدي فقط.
  //   مدين: بنك/صندوق (cashAmount)
  //   دائن: ذمم المنصة (cashAmount)
  // GROSS: المنصة حوّلت بالإجمالي، التسوية = تحصيل نقدي + إثبات مصروف العمولة وضريبتها.
  //   مدين: بنك/صندوق (cashAmount — الصافي المُحول)
  //   مدين: مصروف العمولة (commission)
  //   مدين: ضريبة العمولة المدفوعة (commissionVat)
  //   دائن: ذمم المنصة (cashAmount + commission + commissionVat = الإجمالي المُسوّى)
  const commission = num(data.totalCommission);
  const commissionVat = num(data.commissionVat);
  let lines = [];
  let totalSettlement = cashAmount;

  lines.push({
    accountCode: cashCode, accountName: cashName,
    debit: +cashAmount.toFixed(2), credit: 0,
    description: `تحصيل من منصة ${platform.name} — ${settlementNo}`,
  });

  if (method === 'GROSS' && (commission > 0 || commissionVat > 0)) {
    if (commission > 0) {
      lines.push({
        accountCode: ACCOUNTS.COMMISSION_EXPENSE.code,
        accountName: ACCOUNTS.COMMISSION_EXPENSE.name,
        debit: +commission.toFixed(2), credit: 0,
        description: `إثبات عمولة منصة ${platform.name} — ${settlementNo}`,
      });
    }
    if (commissionVat > 0) {
      lines.push({
        accountCode: ACCOUNTS.COMMISSION_VAT_INPUT.code,
        accountName: ACCOUNTS.COMMISSION_VAT_INPUT.name,
        debit: +commissionVat.toFixed(2), credit: 0,
        description: `ضريبة عمولة منصة ${platform.name} — ${settlementNo}`,
      });
    }
    totalSettlement = cashAmount + commission + commissionVat;
  }

  lines.push({
    accountCode: ACCOUNTS.PLATFORM_RECEIVABLE.code,
    accountName: ACCOUNTS.PLATFORM_RECEIVABLE.name,
    debit: 0, credit: +totalSettlement.toFixed(2),
    description: `إخفاض ذمة منصة ${platform.name} — ${settlementNo}`,
    partyType: 'PLATFORM', partyId: platform.id, partyName: platform.name,
  });

  const totalDebit = lines.reduce((s, l) => s + num(l.debit), 0);
  const totalCredit = lines.reduce((s, l) => s + num(l.credit), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`اختلال توازن قيد التسوية ${settlementNo}: مدين ${totalDebit} دائن ${totalCredit}`);
  }

  const je = await buildJE(base44, 'PLATFORM_SETTLEMENT',
    { entryNo: `JE-PSET-${settlementNo}`, date, description: `تسوية منصة ${platform.name} — ${settlementNo} (${method})`, sourceType: 'PlatformSettlement' },
    { base: totalSettlement, vat: 0, total: totalSettlement },
    () => ({
      entryNo: `JE-PSET-${settlementNo}`, date,
      description: `تسوية منصة ${platform.name} — ${settlementNo} (${method})`,
      sourceType: 'PlatformSettlement', isPosted: true,
      totalDebit: +totalDebit.toFixed(2), totalCredit: +totalCredit.toFixed(2),
      lines,
    }),
    { type: 'PLATFORM', id: platform.id, name: platform.name });
  await autoPostJE(base44, je);

  const payload = {
    ...data,
    settlementNo,
    platformName: platform.name,
    settlementMethod: method,
    status: 'POSTED',
    netPayable: num(data.netPayable) || 0,
    totalSales: num(data.totalSales) || 0,
    totalCommission: commission,
    commissionVat,
    invoiceCount: Array.isArray(data.invoiceIds) ? data.invoiceIds.length : 0,
  };
  return await base44.asServiceRole.entities.PlatformSettlement.create(payload);
}

// يبني بنود الأمر من الحمولة ويحسب الإجمالي منها (البنود هي الأساس).
function buildOrderLines(data) {
  const lines = (Array.isArray(data.items) ? data.items : []).map((l) => ({
    boqItemId: l.boqItemId || '', itemNo: l.itemNo || '', description: l.description || '',
    unit: l.unit || '', orderedQty: num(l.orderedQty), unitPrice: num(l.unitPrice),
    receivedQty: num(l.receivedQty),
  }));
  const linesTotal = +lines.reduce((s, l) => s + l.orderedQty * l.unitPrice, 0).toFixed(2);
  // إن وُجدت بنود يُحسب الإجمالي منها، وإلا يُستخدم المبلغ المُدخل مباشرةً (توافق للخلف).
  const baseInput = lines.length > 0 ? linesTotal : num(data.totalAmount);
  return { lines, baseInput };
}

// أمر الشراء مستند التزام مرجعي فقط ولا يُرحّل أي قيد محاسبي بذاته.
// نقطة الاعتراف المحاسبي الوحيدة للمشتريات هي *سند الاستلام* (مخزون أصل مدين / ذمم المورد دائن)،
// ثم صرف المخزون على المشروع يحوّل الأصل إلى مصروف. هذا يمنع ازدواج الاعتراف بين
// أمر الشراء وحركة المخزون وفاتورة المورد.
async function createPurchaseOrder(base44, data) {
  assertValid('PURCHASE_ORDER', data);
  const { lines, baseInput } = buildOrderLines(data);
  const { base: baseAmount, vat: vatAmount } = calcVAT(baseInput);
  const payload = { ...data, items: lines, totalAmount: baseAmount, vatAmount, receiptStatus: data.receiptStatus || 'PENDING' };
  return await base44.asServiceRole.entities.PurchaseOrder.create(payload);
}

async function updatePurchaseOrder(base44, id, data, prevStatus) {
  assertValid('PURCHASE_ORDER', data);
  assertTransition('PURCHASE_ORDER', prevStatus, data.status);
  const { lines, baseInput } = buildOrderLines(data);
  const { base: baseAmount, vat: vatAmount } = calcVAT(baseInput);
  const payload = { ...data, items: lines, totalAmount: baseAmount, vatAmount };
  // لا قيد هنا — الاعتراف يتم حصراً عند سند الاستلام.
  return await base44.asServiceRole.entities.PurchaseOrder.update(id, payload);
}

function expenseAccountRole(expenseType) {
  const map = { PROJECT: 'EXPENSE_PROJECT', EQUIPMENT: 'EXPENSE_EQUIPMENT', EMPLOYEE: 'EXPENSE_EMPLOYEE', GOVERNMENT: 'EXPENSE_GOVERNMENT', ADMIN: 'EXPENSE_ADMIN', COMPANY: 'EXPENSE_GENERAL' };
  return map[expenseType] || 'EXPENSE_GENERAL';
}

function buildExpensePayload(data) {
  const amt = num(data.amount);
  const vatAmount = data._vatEnabled ? +(amt * VAT_RATE).toFixed(2) : 0;
  const totalAmount = +(amt + vatAmount).toFixed(2);
  const payload = { ...data, amount: amt, vatAmount, totalAmount };
  delete payload._vatEnabled;
  return { payload, amt, vatAmount, totalAmount };
}

async function createExpense(base44, data) {
  assertValid('EXPENSE', data);
  const { payload, amt, vatAmount, totalAmount } = buildExpensePayload(data);
  const accountRole = expenseAccountRole(payload.expenseType);
  // الحسابات التي اختارها المستخدم صراحةً من الدليل (إن وُجدت)
  const expenseAccount = payload.expenseAccountCode
    ? { code: payload.expenseAccountCode, name: payload.expenseAccountName || payload.description }
    : null;
  const paymentAccount = payload.paymentAccountCode
    ? { code: payload.paymentAccountCode, name: payload.paymentAccountName || 'سداد المصروف' }
    : null;
  const expense = await base44.asServiceRole.entities.Expense.create(payload);
  const ref = `EXP-${Date.now()}`;
  try {
    // بناء القيد مباشرةً من الحسابات المختارة حين يحدد المستخدم حساباً — اختياره الصريح
    // يتجاوز القالب. وإلا نرجع للقالب ثم للبناء الافتراضي حسب نوع المصروف.
    const je = (expenseAccount || paymentAccount)
      ? buildExpenseJE({ date: payload.date, description: payload.description, amount: amt, vatAmount, totalAmount, reference: ref, accountRole, expenseAccount, paymentAccount, projectName: payload.projectName })
      : await buildJE(base44, 'EXPENSE',
          { entryNo: `JE-EXP-${ref}`, date: payload.date, description: `مصروف: ${payload.description}`, sourceType: 'Expense' },
          { base: amt, vat: vatAmount, total: totalAmount },
          () => buildExpenseJE({ date: payload.date, description: payload.description, amount: amt, vatAmount, totalAmount, reference: ref, accountRole, projectName: payload.projectName }));
    await autoPostJE(base44, je);
  } catch (e) {
    await rollback(base44, 'Expense', expense.id);
    throw e;
  }
  return expense;
}

async function updateExpense(base44, id, data) {
  assertValid('EXPENSE', data);
  const { payload } = buildExpensePayload(data);
  return await base44.asServiceRole.entities.Expense.update(id, payload);
}

async function createRentalContract(base44, data) {
  assertValid('RENTAL_CONTRACT', data);
  const rate = num(data.rate);
  const delivery = num(data.deliveryFees);
  const base = rate + delivery;
  const { vat: vatAmount, total: totalAmount } = calcVAT(base);
  const payload = { ...data, rate, deliveryFees: delivery, totalAmount, vatAmount };
  // العقد مرجعي فقط ولا ينشئ أي قيد محاسبي — الإيراد والذمة ينشآن من فاتورة التأجير.
  const contract = await base44.asServiceRole.entities.RentalContract.create(payload);
  // حجز المعدة عند تفعيل العقد.
  if (data.equipmentId && payload.status === 'ACTIVE') {
    try { await base44.asServiceRole.entities.Equipment.update(data.equipmentId, { status: 'RENTED' }); } catch { /* المعدة قد لا تكون موجودة */ }
  }
  return contract;
}

async function updateRentalContract(base44, id, data, prevStatus, prevEquipmentStatus) {
  assertValid('RENTAL_CONTRACT', data);
  assertTransition('RENTAL_CONTRACT', prevStatus, data.status);
  const rate = num(data.rate);
  const delivery = num(data.deliveryFees);
  const base = rate + delivery;
  const { vat: vatAmount, total: totalAmount } = calcVAT(base);
  const payload = { ...data, rate, deliveryFees: delivery, totalAmount, vatAmount };
  const contract = await base44.asServiceRole.entities.RentalContract.update(id, payload);
  if (data.equipmentId) {
    const newStatus = payload.status === 'ACTIVE' ? 'RENTED' : (payload.status === 'COMPLETED' || payload.status === 'CANCELLED') ? 'AVAILABLE' : prevEquipmentStatus;
    if (newStatus && newStatus !== prevEquipmentStatus) {
      try { await base44.asServiceRole.entities.Equipment.update(data.equipmentId, { status: newStatus }); } catch { /* المعدة قد لا تكون موجودة */ }
    }
  }
  return contract;
}

// يرحّل قيدي المسير: الاستحقاق دائماً، والسداد عند الدفع فقط. يُعيد قائمة القيود المُنشأة.
async function postPayrollEntries(base44, data) {
  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
  const posted = [];
  // 1) قيد الاستحقاق — يُنشأ لكل مسير مهما كانت حالته
  const accrualJE = buildPayrollAccrualJE(data, accounts);
  posted.push(await autoPostJE(base44, accrualJE));
  // 2) قيد السداد — عند الدفع فقط (طريقة الدفع والتاريخ مضمونان بالتحقق)
  if (data.status === 'PAID') {
    const paymentJE = buildPayrollPaymentJE(data, accounts);
    posted.push(await autoPostJE(base44, paymentJE));
  }
  return posted;
}

async function createPayrollRun(base44, data) {
  assertValid('PAYROLL', { ...data, status: 'DRAFT' });
  const payload = { ...data, status: 'DRAFT' };
  return await base44.asServiceRole.entities.PayrollRun.create(payload);
}

async function updatePayrollRun(base44, id, data) {
  const existing = await base44.asServiceRole.entities.PayrollRun.get(id);
  if (!existing) throw new Error('مسير الرواتب غير موجود');
  if (existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل مسير معتمد أو مدفوع — أنشئ إجراء اعتماد/سداد بدلاً من تعديل الماضي');
  const payload = { ...data, status: 'DRAFT' };
  assertValid('PAYROLL', payload);
  return await base44.asServiceRole.entities.PayrollRun.update(id, payload);
}

async function approvePayrollRun(base44, id) {
  const run = await base44.asServiceRole.entities.PayrollRun.get(id);
  if (!run) throw new Error('مسير الرواتب غير موجود');
  if (run.status !== 'DRAFT') throw new Error('لا يمكن اعتماد إلا مسير في حالة مسودة');
  assertValid('PAYROLL', { ...run, status: 'APPROVED' });
  await postPayrollEntries(base44, { ...run, status: 'APPROVED' });
  return await base44.asServiceRole.entities.PayrollRun.update(id, { status: 'APPROVED' });
}

async function payPayrollRun(base44, id, data) {
  const run = await base44.asServiceRole.entities.PayrollRun.get(id);
  if (!run) throw new Error('مسير الرواتب غير موجود');
  if (run.status !== 'APPROVED') throw new Error('لا يمكن سداد إلا مسير معتمد');
  const payload = { ...run, paymentAccountCode: data.paymentAccountCode, paymentAccountName: data.paymentAccountName, paymentDate: data.paymentDate, status: 'PAID' };
  assertValid('PAYROLL', payload);
  try {
    const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
    await autoPostJE(base44, buildPayrollPaymentJE(payload, accounts));
  } catch (e) {
    throw e;
  }
  return await base44.asServiceRole.entities.PayrollRun.update(id, { paymentAccountCode: payload.paymentAccountCode, paymentAccountName: payload.paymentAccountName, paymentDate: payload.paymentDate, status: 'PAID' });
}

// ─── تحصيلات العملاء ──────────────────────────────────────────────────────────
async function createClientPayment(base44, data) {
  assertValid('CLIENT_PAYMENT', data);
  const payload = { ...data, amount: num(data.amount) };
  const rec = await base44.asServiceRole.entities.ClientPayment.create(payload);
  try {
    const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
    await autoPostJE(base44, buildClientPaymentJE({ ...payload, id: rec.id }, accounts));
  } catch (e) {
    await rollback(base44, 'ClientPayment', rec.id);
    throw e;
  }
  return rec;
}

async function updateClientPayment(base44, id, data) {
  throw new Error('لا يمكن تعديل سند قبض مُرحّل — استخدم قيداً عكسياً للتصحيح');
}

// ─── سداد الموردين ────────────────────────────────────────────────────────────
async function createSupplierPayment(base44, data) {
  assertValid('SUPPLIER_PAYMENT', data);
  const payload = { ...data, amount: num(data.amount) };
  const rec = await base44.asServiceRole.entities.SupplierPayment.create(payload);
  try {
    const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
    await autoPostJE(base44, buildSupplierPaymentJE({ ...payload, id: rec.id }, accounts));
  } catch (e) {
    await rollback(base44, 'SupplierPayment', rec.id);
    throw e;
  }
  return rec;
}

async function updateSupplierPayment(base44, id, data) {
  throw new Error('لا يمكن تعديل سند صرف مُرحّل — استخدم قيداً عكسياً للتصحيح');
}

// ─── فواتير الموردين ──────────────────────────────────────────────────────────
function buildSupplierInvoicePayload(data) {
  const baseAmount = num(data.baseAmount);
  const vatAmount = num(data.vatAmount);
  const totalAmount = +(baseAmount + vatAmount).toFixed(2);
  return { ...data, baseAmount, vatAmount, totalAmount, paidAmount: num(data.paidAmount) };
}

// الإنشاء يحفظ الفاتورة كمسودة فقط بلا قيد — القيد يُرحّل عند الاعتماد.
// السلسلة الإلزامية: لا فاتورة مورد بدون سند استلام معتمد ومُستلَم.
// إن أُنشئت الفاتورة من سند استلام، يُوسم السند "تمت الفوترة" تلقائياً.
async function createSupplierInvoice(base44, data) {
  assertValid('SUPPLIER_INVOICE', data);
  // التحقق من وجود سند الاستلام وحالته
  if (isBlank(data.goodsReceiptId)) throw new Error('يجب ربط الفاتورة بسند استلام — لا يمكن إنشاء فاتورة مورد بدون سند استلام معتمد');
  const receipt = await base44.asServiceRole.entities.GoodsReceipt.get(data.goodsReceiptId);
  if (!receipt) throw new Error('سند الاستلام المحدد غير موجود');
  if (receipt.status !== 'RECEIVED') throw new Error('سند الاستلام غير معتمد — يجب اعتماد سند الاستلام أولاً قبل إنشاء فاتورة المورد');
  if (receipt.invoicedStatus === 'INVOICED') throw new Error('سند الاستلام هذا سبق أن فُوتر — لا يمكن إنشاء فاتورتين لنفس السند');
  const payload = { ...buildSupplierInvoicePayload(data), status: 'DRAFT' };
  const inv = await base44.asServiceRole.entities.SupplierInvoice.create(payload);
  // وسم سند الاستلام بأنه تمت فوترته لإغلاق حلقة السلسلة
  try { await base44.asServiceRole.entities.GoodsReceipt.update(payload.goodsReceiptId, { invoicedStatus: 'INVOICED' }); } catch { /* السند قد لا يكون موجوداً */ }
  return inv;
}

async function updateSupplierInvoice(base44, id, data) {
  const existing = await base44.asServiceRole.entities.SupplierInvoice.get(id);
  if (!existing) throw new Error('الفاتورة غير موجودة');
  if (existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل فاتورة معتمدة — استخدم العكس/الإلغاء المحاسبي بدلاً من تعديل الماضي');
  const payload = { ...buildSupplierInvoicePayload(data), status: 'DRAFT' };
  assertValid('SUPPLIER_INVOICE', payload);
  return await base44.asServiceRole.entities.SupplierInvoice.update(id, payload);
}

// اعتماد فاتورة مورد:
//   • فاتورة مرتبطة بسند استلام: الذمة والمخزون أُثبتا سلفاً عند الاستلام —
//     لا يُرحّل قيد ذمة جديد (منعاً للازدواج)، ويُثبت فرق الضريبة فقط إن وُجد.
//   • فاتورة مباشرة (خدمات/بلا استلام): يُرحّل قيد الالتزام الكامل.
async function approveSupplierInvoice(base44, id) {
  const inv = await base44.asServiceRole.entities.SupplierInvoice.get(id);
  if (!inv) throw new Error('الفاتورة غير موجودة');
  if (inv.status !== 'DRAFT') throw new Error('لا يمكن اعتماد إلا الفواتير التي في حالة مسودة');
  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);

  if (inv.goodsReceiptId) {
    // الذمة والمخزون مُثبتان من سند الاستلام. نُثبت فقط ضريبة المدخلات المسترجعة
    // (ضريبة مدفوعة مدين / ذمم المورد دائن) لأنها لم تُثبت في قيد الاستلام.
    if (num(inv.vatAmount) > 0) {
      const vatRec = resolveAccount('VAT_RECEIVABLE', accounts);
      const payables = resolveAccount('PAYABLES', accounts);
      await autoPostJE(base44, {
        entryNo: `JE-SUPINV-VAT-${inv.invoiceNo}`, date: inv.date,
        description: `ضريبة مدخلات فاتورة مورد ${inv.invoiceNo} — ${inv.supplierName || ''}`,
        sourceType: 'SupplierInvoice', isPosted: true,
        totalDebit: num(inv.vatAmount), totalCredit: num(inv.vatAmount),
        lines: [
          { accountCode: vatRec.code, accountName: vatRec.name, debit: num(inv.vatAmount), credit: 0, description: 'ضريبة قيمة مضافة مدفوعة' },
          { accountCode: payables.code, accountName: payables.name, debit: 0, credit: num(inv.vatAmount), description: `مستحقات ${inv.supplierName || ''}`, partyType: 'SUPPLIER', partyId: inv.supplierId, partyName: inv.supplierName },
        ],
      });
    }
  } else {
    await autoPostJE(base44, buildSupplierInvoiceJE(inv, accounts));
  }
  return await base44.asServiceRole.entities.SupplierInvoice.update(id, { status: 'APPROVED' });
}

// ─── مستخلصات مقاولي الباطن ──────────────────────────────────────────────────
async function createSubcontractorInvoice(base44, data) {
  assertValid('SUBCONTRACTOR_INVOICE', data);
  const payload = { ...data, status: 'DRAFT' };
  return await base44.asServiceRole.entities.SubcontractorInvoice.create(payload);
}

async function updateSubcontractorInvoice(base44, id, data) {
  const existing = await base44.asServiceRole.entities.SubcontractorInvoice.get(id);
  if (!existing) throw new Error('المستخلص غير موجود');
  if (existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل مستخلص معتمد — استخدم العكس/الإلغاء المحاسبي بدلاً من تعديل الماضي');
  const payload = { ...data, status: 'DRAFT' };
  assertValid('SUBCONTRACTOR_INVOICE', payload);
  return await base44.asServiceRole.entities.SubcontractorInvoice.update(id, payload);
}

// اعتماد مستخلص مقاول باطن: يرحّل قيد الالتزام (بالصافي + محتجز) ويحوّل الحالة إلى معتمد.
async function approveSubcontractorInvoice(base44, id) {
  const inv = await base44.asServiceRole.entities.SubcontractorInvoice.get(id);
  if (!inv) throw new Error('المستخلص غير موجود');
  if (inv.status !== 'DRAFT') throw new Error('لا يمكن اعتماد إلا المستخلصات التي في حالة مسودة');
  let subName = inv.subcontractorName;
  if (!subName && inv.subcontractorId) {
    try { subName = (await base44.asServiceRole.entities.Subcontractor.get(inv.subcontractorId))?.name; } catch { /* قد لا يوجد */ }
  }
  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
  await autoPostJE(base44, buildSubcontractorInvoiceJE({ ...inv, subcontractorName: subName }, accounts));
  return await base44.asServiceRole.entities.SubcontractorInvoice.update(id, { status: 'APPROVED' });
}

async function createSubcontractorPayment(base44, data) {
  assertValid('SUBCONTRACTOR_PAYMENT', data);
  const payload = { ...data, amount: num(data.amount) };
  let subName = payload.subcontractorName;
  if (!subName && payload.subcontractorId) {
    try { subName = (await base44.asServiceRole.entities.Subcontractor.get(payload.subcontractorId))?.name; } catch { /* قد لا يوجد */ }
  }
  payload.subcontractorName = subName || '';
  let linkedInvoice = null;
  if (payload.subcontractorInvoiceId) {
    linkedInvoice = await base44.asServiceRole.entities.SubcontractorInvoice.get(payload.subcontractorInvoiceId);
    if (!linkedInvoice) throw new Error('المستخلص المرتبط غير موجود');
    if (!['APPROVED', 'PARTIALLY_PAID'].includes(linkedInvoice.status)) throw new Error('لا يمكن السداد إلا على مستخلص معتمد وغير مدفوع بالكامل');
    const outstanding = +(num(linkedInvoice.totalAmount) - num(linkedInvoice.paidAmount)).toFixed(2);
    if (payload.amount > outstanding + 0.01) throw new Error(`مبلغ السداد يتجاوز المتبقي على المستخلص (${outstanding})`);
  }
  const rec = await base44.asServiceRole.entities.SubcontractorPayment.create(payload);
  try {
    const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
    await autoPostJE(base44, buildSubcontractorPaymentJE({ ...payload, subcontractorName: subName }, accounts));
    if (linkedInvoice) {
      const paidAmount = +(num(linkedInvoice.paidAmount) + payload.amount).toFixed(2);
      const status = paidAmount >= num(linkedInvoice.totalAmount) - 0.01 ? 'PAID' : 'PARTIALLY_PAID';
      await base44.asServiceRole.entities.SubcontractorInvoice.update(linkedInvoice.id, { paidAmount, status });
    }
  } catch (e) {
    await rollback(base44, 'SubcontractorPayment', rec.id);
    throw e;
  }
  return rec;
}

// ─── فواتير التأجير ───────────────────────────────────────────────────────────
function buildRentalInvoicePayload(data) {
  const baseAmount = num(data.baseAmount);
  const extraCharges = num(data.extraCharges);
  const deliveryAmount = num(data.deliveryAmount);
  const deliveryVatable = data.deliveryVatable !== false;
  const net = +(baseAmount + extraCharges + deliveryAmount).toFixed(2);
  // الوعاء الخاضع للضريبة يستثني الشحن غير الخاضع.
  const vatableBase = baseAmount + extraCharges + (deliveryVatable ? deliveryAmount : 0);
  const vatAmount = +(vatableBase * VAT_RATE).toFixed(2);
  const totalAmount = +(net + vatAmount).toFixed(2);
  return { ...data, baseAmount, extraCharges, deliveryAmount, deliveryVatable, net, vatAmount, totalAmount, paidAmount: num(data.paidAmount) };
}

// الإنشاء يحفظ فاتورة التأجير كمسودة فقط بلا قيد — القيد يُرحّل عند الاعتماد.
async function createRentalInvoice(base44, data) {
  assertValid('RENTAL_INVOICE', data);
  const p = buildRentalInvoicePayload(data);
  const payload = { ...p, status: 'DRAFT' }; delete payload.net;
  return await base44.asServiceRole.entities.RentalInvoice.create(payload);
}

async function updateRentalInvoice(base44, id, data) {
  const existing = await base44.asServiceRole.entities.RentalInvoice.get(id);
  if (!existing) throw new Error('الفاتورة غير موجودة');
  if (existing.status !== 'DRAFT') throw new Error('لا يمكن تعديل فاتورة معتمدة — استخدم العكس/الإلغاء المحاسبي بدلاً من تعديل الماضي');
  const p = buildRentalInvoicePayload(data);
  const payload = { ...p, status: 'DRAFT' }; delete payload.net;
  assertValid('RENTAL_INVOICE', payload);
  return await base44.asServiceRole.entities.RentalInvoice.update(id, payload);
}

// اعتماد فاتورة تأجير: يرحّل قيد الإيراد ويحوّل الحالة إلى معتمدة.
async function approveRentalInvoice(base44, id) {
  const inv = await base44.asServiceRole.entities.RentalInvoice.get(id);
  if (!inv) throw new Error('الفاتورة غير موجودة');
  if (inv.status !== 'DRAFT') throw new Error('لا يمكن اعتماد إلا الفواتير التي في حالة مسودة');
  // الوعاء الأساسي للإيراد = الأساسي + الرسوم الإضافية + الشحن (net).
  const net = +(num(inv.baseAmount) + num(inv.extraCharges) + num(inv.deliveryAmount)).toFixed(2);
  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
  await autoPostJE(base44, buildRentalInvoiceJE({ ...inv, baseAmount: net }, accounts));
  return await base44.asServiceRole.entities.RentalInvoice.update(id, { status: 'APPROVED' });
}

// ─── الإقفال السنوي ───────────────────────────────────────────────────────────
// يقفل السنة المالية: يولّد قيد إقفال ينقل صافي نتيجة حسابات الإيراد/المصروف
// إلى الأرباح المحتجزة (حقوق الملكية)، ثم يحوّل حالة السنة إلى CLOSED.
//   إيرادات (مدين لتصفيرها) / مصروفات (دائن لتصفيرها) / الأرباح المحتجزة (الفرق).
async function closeFiscalYear(base44, id) {
  const fy = await base44.asServiceRole.entities.FiscalYear.get(id);
  if (!fy) throw new Error('السنة المالية غير موجودة');
  if (fy.status === 'LOCKED') throw new Error('السنة مقفلة نهائياً');
  if (fy.status === 'CLOSED') throw new Error('السنة مغلقة بالفعل');
  if (!fy.startDate || !fy.endDate) throw new Error('حدود السنة المالية غير معرّفة');

  const [accounts, entries] = await Promise.all([
    base44.asServiceRole.entities.ChartAccount.list('code', 2000),
    base44.asServiceRole.entities.JournalEntry.filter({ isPosted: true }),
  ]);
  const typeByCode = Object.fromEntries((accounts || []).map((a) => [a.code, a.accountType]));

  // تجميع صافي كل حساب إيراد/مصروف ضمن حدود السنة.
  const netByAccount = {};
  for (const je of entries || []) {
    if (!je.date || je.date < fy.startDate || je.date > fy.endDate) continue;
    for (const l of je.lines || []) {
      const type = typeByCode[l.accountCode];
      if (type !== 'REVENUE' && type !== 'EXPENSE') continue;
      if (!netByAccount[l.accountCode]) netByAccount[l.accountCode] = { name: l.accountName, type, debit: 0, credit: 0 };
      netByAccount[l.accountCode].debit += num(l.debit);
      netByAccount[l.accountCode].credit += num(l.credit);
    }
  }

  const lines = [];
  let revenueTotal = 0;
  let expenseTotal = 0;
  for (const [code, a] of Object.entries(netByAccount)) {
    const net = +(a.credit - a.debit).toFixed(2); // موجب = رصيد دائن (إيراد)
    if (Math.abs(net) < 0.01) continue;
    if (a.type === 'REVENUE') {
      revenueTotal += net;
      lines.push({ accountCode: code, accountName: a.name, debit: +Math.abs(net).toFixed(2), credit: 0, description: 'إقفال إيراد' });
    } else {
      const cost = +(a.debit - a.credit).toFixed(2); // موجب = رصيد مدين (مصروف)
      expenseTotal += cost;
      lines.push({ accountCode: code, accountName: a.name, debit: 0, credit: +Math.abs(cost).toFixed(2), description: 'إقفال مصروف' });
    }
  }

  if (lines.length > 0) {
    const retained = resolveAccount('RETAINED_EARNINGS', accounts);
    const netIncome = +(revenueTotal - expenseTotal).toFixed(2); // موجب = ربح
    // الربح يُرحّل دائناً للأرباح المحتجزة، والخسارة مديناً.
    lines.push({
      accountCode: retained.code, accountName: retained.name,
      debit: netIncome < 0 ? +Math.abs(netIncome).toFixed(2) : 0,
      credit: netIncome > 0 ? netIncome : 0,
      description: netIncome >= 0 ? 'ترحيل صافي الربح للأرباح المحتجزة' : 'ترحيل صافي الخسارة',
    });
    const totalDebit = +lines.reduce((s, l) => s + num(l.debit), 0).toFixed(2);
    const totalCredit = +lines.reduce((s, l) => s + num(l.credit), 0).toFixed(2);
    // نُرحّل قيد الإقفال بتاريخ آخر السنة قبل قفلها (assertPeriodOpen يمر لأنها ما تزال OPEN).
    await autoPostJE(base44, {
      entryNo: `JE-CLOSE-${fy.year}`, date: fy.endDate,
      description: `قيد إقفال السنة المالية ${fy.name}`, sourceType: 'FiscalClose', isPosted: true,
      totalDebit, totalCredit, lines,
    });
  }

  await base44.asServiceRole.entities.FiscalYear.update(id, { status: 'CLOSED' });

  // بعد الإقفال: افتح السنة التالية فوراً ورحّل لها قيد الرصيد الافتتاحي
  // بأرصدة حسابات الميزانية (أصول/خصوم/حقوق ملكية) — الحسابات المؤقتة صُفّرت بالإقفال.
  const nextYear = await openNextFiscalYear(base44, fy, accounts);
  return { closed: fy.id, nextYear };
}

// يحسب حدود السنة المالية التالية من السنة المُقفلة (نفس الطول، تبدأ في اليوم التالي).
function nextYearBounds(fy) {
  const start = new Date(`${fy.endDate}T00:00:00Z`);
  start.setUTCDate(start.getUTCDate() + 1);
  const end = new Date(start);
  end.setUTCFullYear(end.getUTCFullYear() + 1);
  end.setUTCDate(end.getUTCDate() - 1);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { startDate: iso(start), endDate: iso(end), year: start.getUTCFullYear() };
}

// ينشئ السنة المالية الجديدة (إن لم تكن موجودة) ويرحّل لها قيد الرصيد الافتتاحي.
async function openNextFiscalYear(base44, closedFy, accounts) {
  const b = nextYearBounds(closedFy);

  // لا تُنشئ سنة مكررة إن كانت موجودة مسبقاً.
  const existing = (await base44.asServiceRole.entities.FiscalYear.filter({ year: b.year }))?.[0];
  const newFy = existing || await base44.asServiceRole.entities.FiscalYear.create({
    name: `السنة المالية ${b.year}`, year: b.year,
    startDate: b.startDate, endDate: b.endDate, status: 'OPEN', isCurrent: true,
  });

  // اجعلها السنة الجارية وأزِل العلم عن الباقي.
  const allYears = await base44.asServiceRole.entities.FiscalYear.filter({ isCurrent: true });
  for (const y of allYears || []) {
    if (y.id !== newFy.id && y.isCurrent) await base44.asServiceRole.entities.FiscalYear.update(y.id, { isCurrent: false });
  }
  if (!newFy.isCurrent) await base44.asServiceRole.entities.FiscalYear.update(newFy.id, { isCurrent: true });

  // احسب أرصدة حسابات الميزانية حتى نهاية السنة المُقفلة (شاملة قيد الإقفال).
  // نُجمّع بمفتاح "الحساب + الطرف" حتى يُرحّل رصيد كل عميل/مورد/باطن مستقلاً،
  // فتبقى كشوف الحسابات في السنة الجديدة سليمة ومطابقة لأرصدة نهاية السنة السابقة.
  const entries = await base44.asServiceRole.entities.JournalEntry.filter({ isPosted: true });
  const typeByCode = Object.fromEntries((accounts || []).map((a) => [a.code, a.accountType]));
  const nameByCode = Object.fromEntries((accounts || []).map((a) => [a.code, a.name]));
  const bal = {};
  for (const je of entries || []) {
    if (!je.date || je.date > closedFy.endDate) continue;
    for (const l of je.lines || []) {
      const type = typeByCode[l.accountCode];
      if (type !== 'ASSET' && type !== 'LIABILITY' && type !== 'EQUITY') continue;
      const key = `${l.accountCode}|${l.partyId || ''}`;
      if (!bal[key]) bal[key] = { accountCode: l.accountCode, debit: 0, credit: 0, partyType: l.partyType, partyId: l.partyId, partyName: l.partyName };
      bal[key].debit += num(l.debit);
      bal[key].credit += num(l.credit);
    }
  }

  const lines = [];
  for (const a of Object.values(bal)) {
    const net = +(a.debit - a.credit).toFixed(2); // موجب = رصيد مدين
    if (Math.abs(net) < 0.01) continue;
    const line = {
      accountCode: a.accountCode, accountName: nameByCode[a.accountCode] || a.accountCode,
      debit: net > 0 ? net : 0, credit: net < 0 ? +Math.abs(net).toFixed(2) : 0,
      description: a.partyName ? `رصيد افتتاحي مرحّل — ${a.partyName}` : 'رصيد افتتاحي مرحّل',
    };
    if (a.partyId) { line.partyType = a.partyType; line.partyId = a.partyId; line.partyName = a.partyName; }
    lines.push(line);
  }

  if (lines.length > 0) {
    const totalDebit = +lines.reduce((s, l) => s + num(l.debit), 0).toFixed(2);
    const totalCredit = +lines.reduce((s, l) => s + num(l.credit), 0).toFixed(2);
    await autoPostJE(base44, {
      entryNo: `JE-OPEN-${b.year}`, date: b.startDate,
      description: `قيد الأرصدة الافتتاحية للسنة المالية ${b.year}`, sourceType: 'OpeningBalance', isPosted: true,
      totalDebit, totalCredit, lines,
    });
  }

  return newFy;
}

// تراجع (إنشاء): احذف السجل المصدر حين يفشل ترحيل القيد
async function rollback(base44, entityName, id) {
  try { await base44.asServiceRole.entities[entityName].delete(id); } catch { /* السجل قد يكون حُذف */ }
}

// تراجع (تحديث): أعِد السجل لحالته السابقة حين يفشل ترحيل القيد بعد تغيير الحالة
async function restoreStatus(base44, entityName, id, prevStatus) {
  if (!prevStatus) return;
  try { await base44.asServiceRole.entities[entityName].update(id, { status: prevStatus }); } catch { /* السجل قد يكون حُذف */ }
}

// ─── التوجيه ──────────────────────────────────────────────────────────────────
function operationDate(data = {}) {
  if (data.date) return data.date;
  if (data.paymentDate) return data.paymentDate;
  if (data.acquisitionDate) return data.acquisitionDate;
  if (data.startDate) return data.startDate;
  if (data.year && data.month) return `${data.year}-${String(data.month).padStart(2, '0')}-01`;
  return null;
}

async function requireOpenFiscalYearForPayload(base44, payload) {
  if (!['create', 'update'].includes(payload?.mode)) return;
  const date = operationDate(payload?.data || {});
  if (date) await assertPeriodOpen(base44, date);
}

async function guarded(base44, payload, handler) {
  await requireOpenFiscalYearForPayload(base44, payload);
  return await handler(base44, payload);
}

// ─── التوجيه ──────────────────────────────────────────────────────────────────
const HANDLERS = {
  CHART_ACCOUNT:   { create: (b, p) => createChartAccount(b, p.data, p.openingBalance) },
  SALES_INVOICE:   { create: (b, p) => createSalesInvoice(b, p.data), update: (b, p) => updateSalesInvoice(b, p.id, p.data, p.prevStatus), approve: (b, p) => approveSalesInvoice(b, p.id) },
  PURCHASE_ORDER:  { create: (b, p) => createPurchaseOrder(b, p.data), update: (b, p) => updatePurchaseOrder(b, p.id, p.data, p.prevStatus) },
  EXPENSE:         { create: (b, p) => createExpense(b, p.data), update: (b, p) => updateExpense(b, p.id, p.data) },
  RENTAL_CONTRACT: { create: (b, p) => createRentalContract(b, p.data), update: (b, p) => updateRentalContract(b, p.id, p.data, p.prevStatus, p.prevEquipmentStatus) },
  PAYROLL:         { create: (b, p) => createPayrollRun(b, p.data), update: (b, p) => updatePayrollRun(b, p.id, p.data), approve: (b, p) => approvePayrollRun(b, p.id), pay: (b, p) => payPayrollRun(b, p.id, p.data || {}) },
  CLIENT_PAYMENT:  { create: (b, p) => createClientPayment(b, p.data), update: (b, p) => updateClientPayment(b, p.id, p.data) },
  SUPPLIER_PAYMENT:{ create: (b, p) => createSupplierPayment(b, p.data), update: (b, p) => updateSupplierPayment(b, p.id, p.data) },
  SUPPLIER_INVOICE:{ create: (b, p) => createSupplierInvoice(b, p.data), update: (b, p) => updateSupplierInvoice(b, p.id, p.data), approve: (b, p) => approveSupplierInvoice(b, p.id) },
  SUBCONTRACTOR_INVOICE: { create: (b, p) => createSubcontractorInvoice(b, p.data), update: (b, p) => updateSubcontractorInvoice(b, p.id, p.data), approve: (b, p) => approveSubcontractorInvoice(b, p.id) },
  SUBCONTRACTOR_PAYMENT: { create: (b, p) => createSubcontractorPayment(b, p.data) },
  RENTAL_INVOICE:  { create: (b, p) => createRentalInvoice(b, p.data), update: (b, p) => updateRentalInvoice(b, p.id, p.data), approve: (b, p) => approveRentalInvoice(b, p.id) },
  STOCK_MOVEMENT:  { create: (b, p) => createStockMovement(b, p.data) },
  GOODS_RECEIPT:   { create: (b, p) => createGoodsReceipt(b, p.data) },
  FISCAL_YEAR:     { close: (b, p) => closeFiscalYear(b, p.id) },
  PLATFORM_SETTLEMENT: { create: (b, p) => createPlatformSettlement(b, p.data) },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'غير مصرّح' }, { status: 401 });

    const body = await req.json();
    const { operation, mode } = body || {};
    const group = HANDLERS[operation];
    if (!group) return Response.json({ error: `عملية غير معروفة: ${operation}` }, { status: 400 });
    const handler = group[mode];
    if (!handler) return Response.json({ error: `وضع غير معروف: ${mode}` }, { status: 400 });

    const result = await guarded(base44, body, handler);
    return Response.json({ success: true, record: result });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'فشل تنفيذ العملية' }, { status: 400 });
  }
});