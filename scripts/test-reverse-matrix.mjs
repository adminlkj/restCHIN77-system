// ═══ المطابقة العكسية الكاملة: وظيفة → قيد → حسابات → Required؟ ═══
// المبدأ: كل عملية فعلية في النظام تُنفَّذ، ويُتحقق من:
//   1) القيد متوازن
//   2) الأسطر (مدين/دائن) على الحسابات الصحيحة
//   3) كل حساب استخدمه المحرك موجود في الدليل
//   4) كل حساب استخدمه المحرك بدون اختيار المستخدم = Required
//      (وإلا فحذفه يكسر الوظيفة — فجوة تصميم)
// التشغيل: node scripts/test-reverse-matrix.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStandardAccounts } from '../src/lib/standardChart.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

function loadFile(rel, exportsSrc) {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  src = src.replace(/^import\s+\{\s*createClientFromRequest\s*\}\s+from\s+['"]npm:@base44\/sdk@[^'"]+['"];?\s*/m, '');
  const i = src.indexOf('Deno.serve'); if (i >= 0) src = src.slice(0, i);
  return new Function(`${src}\nreturn ${exportsSrc};`)();
}
const { HANDLERS, guarded } = loadFile('base44/functions/postOperation/entry.ts', '{ HANDLERS, guarded }');
const DEP = loadFile('base44/functions/assetDepreciation/entry.ts', '{ capitalizeAsset, depreciateAsset }');

// ─── متجر في الذاكرة ───
const store = {}; const journalCalls = [];
const uuid = () => 'id-' + Math.random().toString(36).slice(2, 10);
const st = (n) => (store[n] = store[n] || new Map());
function mk(n) {
  return {
    create: async (d) => { const id = d.id || uuid(); const r = { ...d, id, created_date: new Date().toISOString(), updated_date: new Date().toISOString() }; st(n).set(id, r); if (n === 'JournalEntry') journalCalls.push(r); return r; },
    get: async (id) => st(n).get(id) || null,
    update: async (id, d) => { const c = st(n).get(id) || {}; const x = { ...c, ...d, updated_date: new Date().toISOString() }; st(n).set(id, x); return x; },
    updateMany: async (q, u) => { for (const r of st(n).values()) { if (Object.keys(q).every((k) => r[k] === q[k])) Object.assign(r, u); } return { updated: true }; },
    list: async () => [...st(n).values()],
    filter: async (q) => { let a = [...st(n).values()]; if (q && typeof q === 'object') a = a.filter((r) => Object.keys(q).every((k) => r[k] === q[k])); return a; },
    delete: async (id) => { st(n).delete(id); return { success: true }; },
  };
}
const base44 = { asServiceRole: { entities: new Proxy({}, { get: (_, n) => mk(String(n)) }) } };

// الدليل + خريطة التصنيف
const chartMap = new Map(); // code → {isRequired, isSystem, semanticRole}
for (const a of buildStandardAccounts()) { st('ChartAccount').set(a.code, { ...a, id: a.code }); chartMap.set(a.code, { isRequired: !!a.isRequired, isSystem: !!a.isSystem, role: a.semanticRole || '' }); }

// بيانات أساسية
st('FiscalYear').set('fy1', { id: 'fy1', name: '2026', status: 'OPEN', isCurrent: true, startDate: '2026-01-01', endDate: '2026-12-31' });
st('Client').set('cl1', { id: 'cl1', name: 'عميل نقدي', isCash: true });
st('Client').set('cl2', { id: 'cl2', name: 'فندق السلام', isCash: false, discountPercentage: 0 });
st('Supplier').set('sp1', { id: 'sp1', name: 'مورد اللحوم' });
st('Employee').set('em1', { id: 'em1', name: 'فيصل', salary: 5000, allowances: 500, deductions: 0, status: 'ACTIVE' });
st('InventoryItem').set('it1', { id: 'it1', code: 'IT1', name: 'دجاج', salePrice: 30, unit: 'كجم' });
st('DeliveryPlatform').set('pfN', { id: 'pfN', name: 'هنقر NET', settlementMethod: 'NET', settlementAccountCode: '1112' });
st('DeliveryPlatform').set('pfG', { id: 'pfG', name: 'هنقر GROSS', settlementMethod: 'GROSS', settlementAccountCode: '1112' });
st('Project').set('pr1', { id: 'pr1', name: 'PALACE' });

// ─── منطق المصفوفة ───
const MATRIX = []; // صفوف للعرض النهائي
const ALL_JES = []; // كل القيود تراكمياً (لحساب الإقفال)
const engineUsed = new Map(); // code → Set(العمليات التي استخدمته) — للفحص العكسي
let pass = 0, fail = 0; const fails = [];
const ok = (c, m, d) => { if (c) { pass++; } else { fail++; fails.push(`${m}${d ? ' — ' + d : ''}`); } };

async function run(op, mode, payload, { label, expect, captureAll = false } = {}) {
  journalCalls.length = 0;
  const handler = op === 'DEP' ? null : HANDLERS[op]?.[mode];
  try {
    let rec;
    if (op === 'DEP') rec = await payload(); // دالة مخصصة (إهلاك)
    else rec = await guarded(base44, { operation: op, mode, ...payload }, handler);
    const jes = captureAll ? [...journalCalls] : journalCalls.slice(-1 * (expect?.jeCount || 1));
    ALL_JES.push(...jes);
    // تحقق كل قيد
    for (const je of jes) {
      const d = je.lines.reduce((s, l) => s + (+l.debit || 0), 0);
      const c = je.lines.reduce((s, l) => s + (+l.credit || 0), 0);
      ok(Math.abs(d - c) < 0.02, `[${label}] متوازن`, `${je.entryNo}: ${d}/${c}`);
      for (const l of je.lines) {
        if (!chartMap.has(l.accountCode)) { const live = [...st('ChartAccount').values()].find((a) => a.code === l.accountCode); if (live) chartMap.set(l.accountCode, { isRequired: !!live.isRequired, isSystem: !!live.isSystem, role: live.semanticRole || '' }); }
        const info = chartMap.get(l.accountCode);
        ok(!!info, `[${label}] الحساب ${l.accountCode} موجود بالدليل`, je.entryNo);
        if (info) {
          if (!engineUsed.has(l.accountCode)) engineUsed.set(l.accountCode, new Set());
          engineUsed.get(l.accountCode).add(label);
        }
      }
    }
    // تحقق الأسطر المتوقعة
    if (expect?.lines) {
      const all = jes.flatMap((j) => j.lines);
      for (const [code, side, amount] of expect.lines) {
        const l = all.find((x) => x.accountCode === code && (side === 'dr' ? x.debit > 0 : x.credit > 0));
        ok(!!l, `[${label}] ${code} ${side === 'dr' ? 'مدين' : 'دائن'}`, jes.map((j) => j.entryNo).join(','));
        if (l && amount != null) ok(Math.abs((side === 'dr' ? l.debit : l.credit) - amount) < 0.02, `[${label}] ${code} ${side}=${amount}`, `فعلي=${side === 'dr' ? l.debit : l.credit}`);
      }
    }
    if (expect?.custom) await expect.custom(jes);
    MATRIX.push({ fn: label, dr: expect?.dr ?? '', cr: expect?.cr ?? '', jes: jes.map((j) => j.lines.map((l) => `${l.accountCode}:${l.debit}/${l.credit}`).join(' ')) });
    return { rec, jes };
  } catch (e) {
    fail++; fails.push(`[${label}] استثناء: ${e.message}`);
    MATRIX.push({ fn: label, err: e.message });
    return { rec: null, jes: [] };
  }
}

// ═══════════════ الدورات ═══════════════
const D = '2026-08-15';
const inv = (o) => ({ projectId: 'pr1', projectName: 'PALACE', status: 'DRAFT', ...o });

// 1) بيع صالة نقدي
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M1', date: D, invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }] } }) },
  { label: 'بيع صالة نقدي', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id }, { label: '— اعتماد M1', expect: { lines: [['1111', 'dr'], ['4100', 'cr'], ['2160', 'cr']] } });

// 2) بيع صالة بطاقة POS (مدى)
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M2', date: D, invoiceType: 'DINE_IN', subtotal: 200, vatRate: 0.15, vatAmount: 30, totalAmount: 230, paidAmount: 230, notes: { payments: [{ method: 'CARD_MADA', amount: 230, received: 230 }] } }) },
  { label: 'بيع صالة بطاقة POS', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id },
  { label: '— اعتماد M2', expect: { lines: [['1114', 'dr', 230], ['4100', 'cr', 200], ['2160', 'cr', 30]], dr: '1114', cr: '4100+2160' } });

// 3) بيع توصيل مباشر نقدي (ليس منصة → نقد مباشرة، إيراد توصيل)
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M3', date: D, invoiceType: 'DELIVERY', subtotal: 80, vatRate: 0.15, vatAmount: 12, totalAmount: 92, paidAmount: 92, notes: { payments: [{ method: 'CASH', amount: 92, received: 92 }] } }) }, { label: 'بيع توصيل مباشر', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id },
  { label: '— اعتماد M3', expect: { lines: [['1111', 'dr', 92], ['4200', 'cr', 80], ['2160', 'cr', 12]], dr: '1111 (نقد)', cr: '4200+2160' } });

// 4) بيع آجل لعميل (بلا مدفوعات، ليس منصة)
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M4', date: D, invoiceType: 'EVENTS', clientId: 'cl2', clientName: 'فندق السلام', subtotal: 300, vatRate: 0.15, vatAmount: 45, totalAmount: 345, paidAmount: 0, notes: { payments: [] } }) }, { label: 'بيع آجل (مناسبات)', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id },
  { label: '— اعتماد M4', expect: { lines: [['1121', 'dr', 345], ['4300', 'cr', 300], ['2160', 'cr', 45]], dr: '1121', cr: '4300+2160' } });

// 5) بيع منصة NET
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M5', date: D, invoiceType: 'DELIVERY', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, isPlatformSale: true, platformId: 'pfN', platformName: 'هنقر NET', platformCommission: 15, platformCommissionVat: 2.25, settlementMethod: 'NET', notes: { payments: [] } }) }, { label: 'بيع منصة NET', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id },
  { label: '— اعتماد M5 (NET)', expect: { lines: [['1115', 'dr', 97.75], ['5430', 'dr', 15], ['1140', 'dr', 2.25], ['4200', 'cr', 100], ['2160', 'cr', 15]], dr: '1115+5430+1140', cr: '4200+2160' } });

// 6) تسوية منصة NET
await run('PLATFORM_SETTLEMENT', 'create', { data: { platformId: 'pfN', date: D, settledAmount: 97.75, settlementNo: 'ST1' } },
  { label: 'تسوية منصة NET', expect: { lines: [['1112', 'dr', 97.75], ['1115', 'cr', 97.75]], dr: '1112', cr: '1115' } });

// 7) بيع منصة GROSS + تسويتها
await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M6', date: D, invoiceType: 'DELIVERY', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, isPlatformSale: true, platformId: 'pfG', platformName: 'هنقر GROSS', platformCommission: 15, platformCommissionVat: 2.25, settlementMethod: 'GROSS', notes: { payments: [] } }) }, { label: 'بيع منصة GROSS', expect: {} });
await run('SALES_INVOICE', 'approve', { id: st('SalesInvoice').get([...st('SalesInvoice').keys()].pop()).id },
  { label: '— اعتماد M6 (GROSS)', expect: { lines: [['1115', 'dr', 115], ['4200', 'cr', 100], ['2160', 'cr', 15]], dr: '1115 (كامل)', cr: '4200+2160' } });
await run('PLATFORM_SETTLEMENT', 'create', { data: { platformId: 'pfG', date: D, settledAmount: 97.75, totalCommission: 15, commissionVat: 2.25, settlementNo: 'ST2' } },
  { label: 'تسوية منصة GROSS', expect: { lines: [['1112', 'dr', 97.75], ['5430', 'dr', 15], ['1140', 'dr', 2.25], ['1115', 'cr', 115]], dr: '1112+5430+1140', cr: '1115' } });

// 8) مرتجع مبيعات (من M1 الصالة النقدي)
{
  const m1 = [...st('SalesInvoice').values()].find((x) => x.invoiceNo === 'M1');
m1.notes = { ...(m1.notes||{}), items: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100, total: 100 }] };
await base44.asServiceRole.entities.SalesInvoice.update(m1.id, m1);
  await run('SALES_RETURN', 'create', { data: { returnNo: 'SR1', date: D, originalInvoiceId: m1.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, isFullReturn: true } },
    { label: 'مرتجع مبيعات (نقدي)', expect: { lines: [['4100', 'dr', 100], ['2160', 'dr', 15], ['1111', 'cr', 115]], dr: '4100+2160', cr: '1111' } });
}

// 8-ب) بيع منصة NET جديد + مرتجعه الكامل — يثبّت بنية العكس الصحيحة:
// رد الصافي المُحمّل على 1115 فقط + عكس مصروف العمولة (5430 دائن) وضريبتها
// (1140 دائن). (قبل الإصلاح كان يرد كامل 115 على 1115 فتصير ذمة المنصة سالبة
// بمقدار العمولة — اكتشافه بالانحدار الحي: ذمة −17.25.)
{
  await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'M5B', date: D, invoiceType: 'DELIVERY', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, isPlatformSale: true, platformId: 'pfN', platformName: 'هنقر NET', platformCommission: 15, platformCommissionVat: 2.25, settlementMethod: 'NET', notes: { payments: [], items: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100, total: 100 }] } }) }, { label: 'بيع منصة NET (للمرتجع)', expect: {} });
  const m5b = [...st('SalesInvoice').values()].find((x) => x.invoiceNo === 'M5B');
  await run('SALES_INVOICE', 'approve', { id: m5b.id },
    { label: '— اعتماد M5B (NET)', expect: { lines: [['1115', 'dr', 97.75], ['5430', 'dr', 15], ['1140', 'dr', 2.25], ['4200', 'cr', 100], ['2160', 'cr', 15]], dr: '1115+5430+1140', cr: '4200+2160' } });
  await run('SALES_RETURN', 'create', { data: { returnNo: 'SR-PLAT', date: D, originalInvoiceId: m5b.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatAmount: 15, totalAmount: 115, isFullReturn: true } },
    { label: 'مرتجع منصة NET كامل', expect: { lines: [['4200', 'dr', 100], ['2160', 'dr', 15], ['5430', 'cr', 15], ['1140', 'cr', 2.25], ['1115', 'cr', 97.75]], dr: '4200+2160', cr: '5430+1140+1115(الصافي)' } });
}

// 9) تحصيل عميل آجل
await run('CLIENT_PAYMENT', 'create', { data: { receiptNo: 'CP1', date: D, clientId: 'cl2', clientName: 'فندق السلام', amount: 145, cashAccountCode: '1112', cashAccountName: 'البنك', status: 'POSTED' } },
  { label: 'تحصيل عميل آجل', expect: { lines: [['1112', 'dr', 145], ['1121', 'cr', 145]], dr: '1112', cr: '1121' } });

// 10) استلام من مورد + فاتورة مرتبطة (عكس + كامل)
let grRec;
await run('GOODS_RECEIPT', 'create', { data: { receiptNo: 'GR1', date: D, supplierId: 'sp1', supplierName: 'مورد اللحوم', warehouseId: 'pr1', warehouseName: 'PALACE', lines: [{ description: 'دجاج', unit: 'كجم', receivingQty: 10, unitPrice: 20 }] } },
  { label: 'استلام من مورد', expect: { lines: [['1131', 'dr', 200], ['2110', 'cr', 200]], dr: '1131', cr: '2110' } });
grRec = [...st('GoodsReceipt').values()].pop();
await run('SUPPLIER_INVOICE', 'create', { data: { invoiceNo: 'SI1', date: D, supplierId: 'sp1', supplierName: 'مورد اللحوم', baseAmount: 200, vatRate: 0.15, vatAmount: 30, totalAmount: 230, paidAmount: 0, goodsReceiptId: grRec.id, status: 'DRAFT' } }, { label: '— SI1 مسودة', expect: {} });
await run('SUPPLIER_INVOICE', 'approve', { id: [...st('SupplierInvoice').values()].pop().id },
  { label: '— اعتماد SI1 (مرتبطة GR: عكس+كامل)', expect: { jeCount: 2, lines: [['2110', 'dr', 200], ['1131', 'cr', 200], ['5110', 'dr', 200], ['1140', 'dr', 30], ['2110', 'cr', 230]], dr: 'عكس:2110 ثم 5110+1140', cr: 'عكس:1131 ثم 2110' } });

// 11) فاتورة مورد مباشرة
await run('SUPPLIER_INVOICE', 'create', { data: { invoiceNo: 'SI2', date: D, supplierId: 'sp1', supplierName: 'مورد اللحوم', baseAmount: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, status: 'DRAFT' } }, { label: '— SI2 مسودة', expect: {} });
await run('SUPPLIER_INVOICE', 'approve', { id: [...st('SupplierInvoice').values()].pop().id },
  { label: 'اعتماد فاتورة مباشرة', expect: { lines: [['5110', 'dr', 100], ['1140', 'dr', 15], ['2110', 'cr', 115]], dr: '5110+1140', cr: '2110' } });

// 12) مرتجع مشتريات (من SI2)
await run('PURCHASE_RETURN', 'create', { data: { returnNo: 'PR1', date: D, originalInvoiceId: [...st('SupplierInvoice').values()].find((x) => x.invoiceNo === 'SI2').id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, isFullReturn: true } },
  { label: 'مرتجع مشتريات', expect: { lines: [['2110', 'dr', 115], ['1131', 'cr', 100], ['1140', 'cr', 15]], dr: '2110', cr: '1131+1140' } });

// 13) سداد مورد
await run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'SP1', date: D, supplierId: 'sp1', supplierName: 'مورد اللحوم', amount: 100, cashAccountCode: '1112', cashAccountName: 'البنك', status: 'POSTED' } },
  { label: 'سداد مورد', expect: { lines: [['2110', 'dr', 100], ['1112', 'cr', 100]], dr: '2110', cr: '1112' } });

// 14) مصاريف بأنواعها (defaults الجديدة) + اختيار يدوي لحساب Default
for (const [type, acc, name] of [['COMPANY', '5290', 'مستلزمات'], ['ADMIN', '5380', 'إدارية'], ['GOVERNMENT', '5610', 'حكومية'], ['EMPLOYEE', '5320', 'بدلات'], ['EQUIPMENT', '5260', 'صيانة']]) {
  await new Promise((r) => setTimeout(r, 5));
  await run('EXPENSE', 'create', { data: { voucherNo: `EX-${type}`, date: D, category: 'X', expenseType: type, description: name, amount: 50, paymentAccountCode: '1111', paymentAccountName: 'صندوق', baseAmount: 50, vatRate: 0, vatAmount: 0, totalAmount: 50, status: 'POSTED' } },
    { label: `مصروف ${type} → ${acc}`, expect: { lines: [[acc, 'dr', 50], ['1111', 'cr', 50]], dr: acc, cr: '1111' } });
}
await new Promise((r) => setTimeout(r, 5));
await run('EXPENSE', 'create', { data: { voucherNo: 'EX-MAN', date: D, category: 'X', expenseType: 'COMPANY', description: 'إيجار', amount: 70, expenseAccountCode: '5210', expenseAccountName: 'إيجار', paymentAccountCode: '1112', paymentAccountName: 'البنك', baseAmount: 70, vatRate: 0, vatAmount: 0, totalAmount: 70, status: 'POSTED' } },
  { label: 'مصروف بحساب يدوي (5210 إيجار)', expect: { lines: [['5210', 'dr', 70], ['1112', 'cr', 70]], dr: '5210 (يدوي)', cr: '1112' } });

// 15) رواتب: استحقاق بخصومات + سداد
await run('PAYROLL', 'create', { data: { code: 'PM1', month: 8, year: 2026, totalSalaries: 5000, totalAllowances: 500, totalDeductions: 300, netAmount: 5200, employeeIds: ['em1'], employeeLines: [{ employeeId: 'em1', name: 'فيصل', salary: 5000, allowances: 500, deductions: 300, net: 5200 }], status: 'DRAFT' } }, { label: '— مسير مسودة', expect: {} });
await run('PAYROLL', 'approve', { id: [...st('PayrollRun').values()].pop().id },
  { label: 'استحقاق رواتب (بخصومات)', expect: { lines: [['5310', 'dr', 5500], ['2140', 'cr', 5200], ['1125', 'cr', 300]], dr: '5310', cr: '2140+1125' } });
await run('PAYROLL', 'pay', { id: [...st('PayrollRun').values()].pop().id, data: { paymentAccountCode: '1112', paymentAccountName: 'البنك', paymentDate: D } },
  { label: 'سداد رواتب', expect: { lines: [['2140', 'dr', 5200], ['1112', 'cr', 5200]], dr: '2140', cr: '1112' } });

// 16) حركات المخزون
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM1', date: D, type: 'RECEIVE', sourceType: 'CASH', cashAccountCode: '1111', cashAccountName: 'صندوق', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 4, unitCost: 25, toWarehouseId: 'pr1', toWarehouseName: 'PALACE' } },
  { label: 'شراء نقدي (RECEIVE/CASH)', expect: { lines: [['1131', 'dr', 100], ['1111', 'cr', 100]], dr: '1131', cr: '1111' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM2', date: D, type: 'ISSUE', reason: 'تجهيز طلبات', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 2, unitCost: 22, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } },
  { label: 'صرف تجهيز طلبات (ISSUE)', expect: { lines: [['5130', 'dr'], ['1131', 'cr']], dr: '5130', cr: '1131' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM3', date: D, type: 'DAMAGE_NORMAL', reason: 'تلف', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 22, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } },
  { label: 'تلف طبيعي', expect: { lines: [['5140', 'dr'], ['1131', 'cr']], dr: '5140', cr: '1131' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM4', date: D, type: 'DAMAGE_ABNORMAL', reason: 'إهمال', responsibleName: 'فيصل', responsibleId: 'em1', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 22, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } },
  { label: 'تلف غير طبيعي (تحميل موظف)', expect: { lines: [['1125', 'dr'], ['1131', 'cr']], dr: '1125', cr: '1131' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM5', date: D, type: 'ADJUST_INCREASE', reason: 'جرد', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 20, toWarehouseId: 'pr1', toWarehouseName: 'PALACE' } },
  { label: 'تسوية جرد بالزيادة', expect: { lines: [['1131', 'dr', 20], ['4430', 'cr', 20]], dr: '1131', cr: '4430' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM6', date: D, type: 'ADJUST_DECREASE', reason: 'عجز', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 21, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } },
  { label: 'تسوية جرد بالعجز', expect: { lines: [['5140', 'dr'], ['1131', 'cr']], dr: '5140', cr: '1131' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM7', date: D, type: 'TRANSFER', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 21, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE', toWarehouseId: 'pr2', toWarehouseName: 'فرع 2' } },
  { label: 'تحويل مخزن (تذكيري)', expect: { lines: [['1131', 'dr'], ['1131', 'cr']], dr: '1131', cr: '1131' } });
await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'SM8', date: D, type: 'RECEIVE', sourceType: 'OPENING', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 10, toWarehouseId: 'pr1', toWarehouseName: 'PALACE' } },
  { label: 'استلام افتتاحي (بلا مورد)', expect: { lines: [['1131', 'dr', 10], ['3900', 'cr', 10]], dr: '1131', cr: '3900' } });

// 17) رصيد افتتاحي لحساب جديد من الدليل
await run('CHART_ACCOUNT', 'create', { data: { code: '1126', name: 'ذمم مدينة أخرى', accountType: 'ASSET', nature: 'DEBIT', parentCode: '1120' }, openingBalance: 500 },
  { label: 'رصيد افتتاحي لحساب جديد', expect: { lines: [['1126', 'dr', 500], ['3900', 'cr', 500]], dr: 'الحساب الجديد', cr: '3900' } });

// 18) الإهلاك: رسملة + قسط
st('FixedAsset').set('fa1', { id: 'fa1', code: 'FA-001', name: 'فرن', category: 'EQUIPMENT', acquisitionCost: 12000, salvageValue: 0, usefulLifeMonths: 60, acquisitionDate: D, capitalized: false, status: 'DRAFT', accumulatedDepreciation: 0 });
await run('DEP', null, async () => DEP.capitalizeAsset(base44, 'fa1'),
  { label: 'رسملة أصل ثابت', expect: { lines: [['1210', 'dr', 12000], ['1112', 'cr', 12000]], dr: '1210', cr: '1112 (بنك)' } });
await run('DEP', null, async () => DEP.depreciateAsset(base44, 'fa1', '2026-08'),
  { label: 'قسط إهلاك شهري', expect: { lines: [['5810', 'dr', 200], ['1290', 'cr', 200]], dr: '5810', cr: '1290' } });

// 19) إقفال السنة المالية (تصفير الإيرادات/المصروفات → 3300)
{
  // احسب الصافي المتوقع: إيرادات - مصروفات عبر كل القيود المنفذة (تراكمياً)
  let rev = 0, exp = 0;
  for (const je of ALL_JES) for (const l of je.lines) {
    const info = chartMap.get(l.accountCode);
    if (info?.role) { /* by role below */ }
    const type = { '4100': 'R', '4200': 'R', '4300': 'R', '4430': 'R' }[l.accountCode] || (String(l.accountCode).startsWith('5') ? 'E' : null);
    if (type === 'R') rev += l.credit - l.debit;
    if (type === 'E') exp += l.debit - l.credit;
  }
  const netIncome = +(rev - exp).toFixed(2);
  await run('FISCAL_YEAR', 'close', { id: 'fy1' },
    { label: 'إقفال السنة المالية', expect: { jeCount: 2, custom: async (jes) => {
        const closeJE = jes.find((j) => (j.entryNo || '').indexOf('CLOSE') >= 0) || jes[0];
        ok(!!closeJE, '[إقفال] وُلّد قيد إقفال');
        if (closeJE) {
          const r = closeJE.lines.find((l) => l.accountCode === '3300');
          ok(!!r, '[إقفال] يحتوي 3300');
          if (r) { const side = netIncome >= 0 ? r.credit : r.debit; ok(Math.abs(side - Math.abs(netIncome)) < 0.5, '[إقفال] الصافي (ربح=دائن/خسارة=مدين) لـ3300', `متوقع=${netIncome} فعلي=${side} اتجاه=${r.credit > 0 ? 'دائن' : 'مدين'}`); }
        }
      }, dr: 'تصفير كل الإيرادات', cr: 'تصفير كل المصروفات + 3300 (الفرق)' } });
}

// ═══════════════ الفحص العكسي: Required ↔ استعمال المحرك ═══════════════
// كل حساب leaf استخدمه المحرك (بدون اختيار المستخدم) يجب أن يكون Required
const userPicked = new Set(['1126', '5210']); // اختارها المستخدم يدوياً في الاختبار
const gaps = [];
for (const [code, ops] of engineUsed) {
  const info = chartMap.get(code);
  if (!info?.isRequired && !userPicked.has(code)) gaps.push(`${code} (Default!) استُخدم في: ${[...ops].slice(0, 3).join('، ')}`);
}
// وكل leaf Required إما استُخدم أو دوره معروف (استخدمت كل شيء في المصفوفة إلا ما ندر)
const requiredLeaves = [...chartMap.entries()].filter(([c, i]) => i.isRequired && !['1000','1100','1110','1120','1130','1200','2000','2100','3000','4000','5000','5100','5200','5300','5400','5600','5800'].includes(c));
const neverUsed = requiredLeaves.filter(([c]) => !engineUsed.has(c)).map(([c]) => c);

// ═══════════════ التقرير ═══════════════
console.log('════════ مصفوفة الوظائف ← القيود ← الحسابات ════════\n');
for (const row of MATRIX) {
  if (row.fn.startsWith('—')) continue; // تخطي خطوات الاعتماد الفرعية في العرض
  const st = row.err ? `✗ ${row.err}` : row.jes.map((l) => l).join('  |  ');
  console.log(`${row.err ? '✗' : '✓'} ${row.fn}`);
  console.log(`   مدين: ${row.dr}  |  دائن: ${row.cr}`);
  console.log(`   القيد: ${st}\n`);
}
console.log('────────── الفحص العكسي ──────────');
console.log(`حسابات Default استخدمها المحرك (حذفها يكسر وظيفة — فجوة): ${gaps.length}`);
gaps.forEach((g) => console.log('  ⚠ ' + g));
console.log(`حسابات Required لم تُستخدم في المصفوفة: ${neverUsed.length ? neverUsed.join(', ') : 'لا شيء'}`);
console.log('\n────────── النتيجة ──────────');
console.log(`فحوص ناجحة: ${pass} | فاشلة: ${fail}`);
if (fails.length) { console.log('\nالفاشلات:'); fails.forEach((f) => console.log('  ✗ ' + f)); }
console.log(fail === 0 && gaps.length === 0 ? '\n✓✓ المطابقة العكسية كاملة: كل وظيفة لها حسابات صحيحة، وكل حساب محرّك Required' : '\n⚠ توجد ملاحظات أعلاه');
process.exit(fail === 0 && gaps.length === 0 ? 0 : 1);
