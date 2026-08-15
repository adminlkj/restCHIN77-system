// ═══ اختبارات الفشل والحالات الحرفية (Negative/Hardening Tests) ═══
// الفلسفة: النظام الصحيح يرفض العمليات غير الصالحة برسائل واضحة — ولا يفسد المحاسبة
// بصمت. كل اختبار هنا يتوقع REJECT (رسالة) أو سلوكاً آمناً موثقاً.
// التشغيل: node scripts/test-failure-modes.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStandardAccounts } from '../src/lib/standardChart.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
function loadFile(rel) {
  let src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  src = src.replace(/^import\s+\{\s*createClientFromRequest\s*\}\s+from\s+['"]npm:@base44\/sdk@[^'"]+['"];?\s*/m, '');
  const i = src.indexOf('Deno.serve'); if (i >= 0) src = src.slice(0, i);
  return new Function(`${src}\nreturn { HANDLERS, guarded };`)();
}
const { HANDLERS, guarded } = loadFile('base44/functions/postOperation/entry.ts');

const store = {}; const journalCalls = [];
const uuid = () => 'id-' + Math.random().toString(36).slice(2, 10);
const st = (n) => (store[n] = store[n] || new Map());
function mk(n) {
  return {
    create: async (d) => { const id = d.id || uuid(); const r = { ...d, id, created_date: new Date().toISOString() }; st(n).set(id, r); if (n === 'JournalEntry') journalCalls.push(r); return r; },
    get: async (id) => st(n).get(id) || null,
    update: async (id, d) => { const c = st(n).get(id) || {}; const x = { ...c, ...d }; st(n).set(id, x); return x; },
    updateMany: async (q, u) => { for (const r of st(n).values()) if (Object.keys(q).every((k) => r[k] === q[k])) Object.assign(r, u); return { updated: true }; },
    list: async () => [...st(n).values()],
    filter: async (q) => { let a = [...st(n).values()]; if (q && typeof q === 'object') a = a.filter((r) => Object.keys(q).every((k) => r[k] === q[k])); return a; },
    delete: async (id) => { st(n).delete(id); return { success: true }; },
  };
}
const base44 = { asServiceRole: { entities: new Proxy({}, { get: (_, n) => mk(String(n)) }) } };

// seed
for (const a of buildStandardAccounts()) st('ChartAccount').set(a.code, { ...a, id: a.code });
st('FiscalYear').set('fy1', { id: 'fy1', name: '2026', status: 'OPEN', isCurrent: true, startDate: '2026-01-01', endDate: '2026-12-31' });
st('FiscalYear').set('fy0', { id: 'fy0', name: '2025', status: 'LOCKED', startDate: '2025-01-01', endDate: '2025-12-31' });
st('Client').set('cl1', { id: 'cl1', name: 'عميل', isCash: true });
st('Supplier').set('sp1', { id: 'sp1', name: 'مورد' });
st('Employee').set('em1', { id: 'em1', name: 'موظف', salary: 1000, allowances: 0, deductions: 0, status: 'ACTIVE' });
st('InventoryItem').set('it1', { id: 'it1', code: 'IT1', name: 'دجاج', salePrice: 30 });
st('DeliveryPlatform').set('pfN', { id: 'pfN', name: 'منصة', settlementMethod: 'NET', settlementAccountCode: '1112' });
st('Project').set('pr1', { id: 'pr1', name: 'PALACE' });

async function run(op, mode, payload) {
  journalCalls.length = 0;
  const h = HANDLERS[op]?.[mode];
  if (!h) throw new Error('لا يوجد معالج');
  return { rec: await guarded(base44, { operation: op, mode, ...payload }, h), jes: [...journalCalls] };
}

// إطار النتائج: PASS/FAIL/BLOCKED
let P = 0, F = 0; const rows = []; const fixes = [];
function expectReject(label, fn, mustContain = '') {
  return (async () => {
    try {
      const before = journalCalls.length;
      await fn();
      // لم يُرفض — هل رحّل قيداً؟
      const posted = journalCalls.length - before;
      rows.push({ label, res: 'FAIL', note: `قُبلت بلا رفض (ورحّلت ${posted} قيد)` });
      F++;
    } catch (e) {
      const okMsg = !mustContain || (e.message || '').includes(mustContain);
      rows.push({ label, res: okMsg ? 'PASS' : 'FAIL', note: okMsg ? `رُفضت: ${e.message.slice(0, 70)}` : `رسالة غير متوقعة: ${e.message.slice(0, 70)} (المتوقع يتضمن: ${mustContain})` });
      okMsg ? P++ : F++;
    }
  })();
}
function expectAccept(label, fn, note = 'قُبلت كما هو متوقع') {
  return (async () => {
    try { await fn(); rows.push({ label, res: 'PASS', note }); P++; }
    catch (e) { rows.push({ label, res: 'FAIL', note: `رُفضت: ${e.message.slice(0, 70)}` }); F++; }
  })();
}

const D = '2026-08-15';
const inv = (o) => ({ projectId: 'pr1', projectName: 'PALACE', status: 'DRAFT', ...o });

// ═══ 1. المبيعات — مدخلات غير صالحة ═══
await expectReject('بيع: تاريخ فارغ', () => run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'X1', date: '', invoiceType: 'DINE_IN', subtotal: 100, vatAmount: 15, totalAmount: 115, notes: { payments: [] } }) }), 'تاريخ');
await expectReject('بيع: مبلغ أساسي صفر', () => run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'X2', date: D, invoiceType: 'DINE_IN', subtotal: 0, vatAmount: 0, totalAmount: 0, notes: { payments: [] } }) }), 'أكبر من صفر');
await expectReject('بيع: مدفوع يتجاوز الإجمالي', () => run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'X3', date: D, invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 500, notes: { payments: [{ method: 'CASH', amount: 500, received: 500 }] } }) }), 'يتجاوز');

// فاتورة صالحة لاختبارات الحالة
const base = await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'OK1', date: D, invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }], items: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100, total: 100 }] } }) });
await run('SALES_INVOICE', 'approve', { id: base.rec.id });
await expectReject('اعتماد فاتورة مرتين', () => run('SALES_INVOICE', 'approve', { id: base.rec.id }), 'مسودة');
await expectReject('تعديل فاتورة معتمدة', () => run('SALES_INVOICE', 'update', { id: base.rec.id, data: { subtotal: 999 }, prevStatus: 'APPROVED' }), '');

// ═══ 2. المرتجعات — التكرار والتجاوز ═══
await expectAccept('مرتجع كامل أول (مقبول)', () => run('SALES_RETURN', 'create', { data: { returnNo: 'R1', date: D, originalInvoiceId: base.rec.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, isFullReturn: true } }));
// فاتورة ثانية مع بنود بكمية 1 لاختبار الجزئي والتجاوز
const b2 = await run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'OK2', date: D, invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }], items: [{ itemId: 'it1', itemName: 'دجاج', qty: 2, unitPrice: 50, total: 100 }] } }) });
await run('SALES_INVOICE', 'approve', { id: b2.rec.id });
await expectAccept('مرتجع جزئي (1 من 2)', () => run('SALES_RETURN', 'create', { data: { returnNo: 'R2', date: D, originalInvoiceId: b2.rec.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 50 }], subtotal: 50, vatRate: 0.15, vatAmount: 7.5, totalAmount: 57.5 } }));
await expectReject('مرتجع يتجاوز الكمية المباعة (2 من متبقي 1)', () => run('SALES_RETURN', 'create', { data: { returnNo: 'R3', date: D, originalInvoiceId: b2.rec.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 2, unitPrice: 50 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115 } }), '');
await expectReject('مرتجع كامل لفاتورة مرتجعة كلياً (R1 على OK1 مجدداً)', () => run('SALES_RETURN', 'create', { data: { returnNo: 'R4', date: D, originalInvoiceId: base.rec.id, lines: [{ itemId: 'it1', itemName: 'دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, isFullReturn: true } }), '');

// ═══ 3. المخزون — الرقم المكرر (الحالة الحرجة) ═══
await expectAccept('حركة مخزون برقم UNIQ-1 (أول مرة)', () => run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'UNIQ-1', date: D, type: 'DAMAGE_NORMAL', reason: 'تلف', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 10, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } }));
{
  const before = journalCalls.length;
  let duplicated = false; let posted = 0;
  try {
    await run('STOCK_MOVEMENT', 'create', { data: { movementNo: 'UNIQ-1', date: D, type: 'DAMAGE_NORMAL', reason: 'تلف ثانٍ', itemId: 'it1', itemName: 'دجاج', unit: 'كجم', quantity: 1, unitCost: 10, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE' } });
    duplicated = true; posted = journalCalls.length;
  } catch (e) { duplicated = false; }
  if (duplicated) {
    // قُبلت — هل رحّلت قيداً جديداً؟ (dedup في autoPostJE قد يمنع القيد → حركة كمية بلا قيد = فجوة)
    const newJE = posted > 0;
    rows.push({ label: 'رقم حركة مخزون مكرر (UNIQ-1)', res: newJE ? 'FAIL' : 'FAIL', note: newJE ? 'قُبلت ورحّلت قيداً — التكرار غير مرفوض' : 'قُبلت لكن بلا قيد جديد — حركة كمية بلا محاسبة (فجوة)' });
    F++;
    fixes.push('رفض movementNo المكرر في createStockMovement (فحص صريح قبل الإنشاء)');
  } else {
    rows.push({ label: 'رقم حركة مخزون مكرر (UNIQ-1)', res: 'PASS', note: 'رُفض الرقم المكرر' }); P++;
  }
}

// ═══ 4. الرواتب — ترتيب الحالة والتكرار ═══
const pr = await run('PAYROLL', 'create', { data: { code: 'P1', month: 5, year: 2026, totalSalaries: 1000, totalAllowances: 0, totalDeductions: 0, netAmount: 1000, employeeIds: ['em1'], employeeLines: [{ employeeId: 'em1', name: 'موظف', salary: 1000, allowances: 0, deductions: 0, net: 1000 }], status: 'DRAFT' } });
await expectReject('سداد مسير قبل الاعتماد', () => run('PAYROLL', 'pay', { id: pr.rec.id, data: { paymentAccountCode: '1112', paymentAccountName: 'بنك', paymentDate: D } }), 'معتمد');
await run('PAYROLL', 'approve', { id: pr.rec.id });
await run('PAYROLL', 'pay', { id: pr.rec.id, data: { paymentAccountCode: '1112', paymentAccountName: 'بنك', paymentDate: D } });
await expectReject('سداد المسير مرتين', () => run('PAYROLL', 'pay', { id: pr.rec.id, data: { paymentAccountCode: '1112', paymentAccountName: 'بنك', paymentDate: D } }), 'معتمد');
await expectReject('اعتماد مسير مدفوع', () => run('PAYROLL', 'approve', { id: pr.rec.id }), 'مسودة');
await expectReject('مسير بصافٍ سالب', () => run('PAYROLL', 'create', { data: { code: 'P2', month: 6, year: 2026, totalSalaries: 0, totalAllowances: 0, totalDeductions: 500, netAmount: -500, status: 'DRAFT' } }), 'أكبر من صفر');

// ═══ 5. المصروفات والسدادات ═══
await expectReject('مصروف بلا حساب سداد', () => run('EXPENSE', 'create', { data: { voucherNo: 'E1', date: D, category: 'X', description: 'بلا سداد', amount: 50, baseAmount: 50, vatRate: 0, vatAmount: 0, totalAmount: 50, status: 'POSTED' } }), 'حساب السداد');
await expectReject('مصروف بمبلغ صفر', () => run('EXPENSE', 'create', { data: { voucherNo: 'E2', date: D, category: 'X', description: 'صفر', amount: 0, paymentAccountCode: '1111', paymentAccountName: 'صندوق', baseAmount: 0, vatRate: 0, vatAmount: 0, totalAmount: 0, status: 'POSTED' } }), 'أكبر من صفر');
await expectReject('تحصيل عميل بمبلغ صفر', () => run('CLIENT_PAYMENT', 'create', { data: { receiptNo: 'C0', date: D, clientId: 'cl1', clientName: 'عميل', amount: 0, cashAccountCode: '1111', cashAccountName: 'صندوق', status: 'POSTED' } }), 'أكبر من صفر');
await expectReject('سداد مورد بلا حساب نقدي', () => run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'S0', date: D, supplierId: 'sp1', supplierName: 'مورد', amount: 50, status: 'POSTED' } }), 'الحساب النقدي');

// ═══ 6. سداد مورد لفاتورة: تجاوز المتقي والتكرار ═══
{
  const si = await run('SUPPLIER_INVOICE', 'create', { data: { invoiceNo: 'S1', date: D, supplierId: 'sp1', supplierName: 'مورد', baseAmount: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, status: 'DRAFT' } });
  await run('SUPPLIER_INVOICE', 'approve', { id: si.rec.id });
  await expectReject('سداد يتجاوز متبقي الفاتورة', () => run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'S2', date: D, supplierId: 'sp1', supplierName: 'مورد', amount: 200, supplierInvoiceId: si.rec.id, cashAccountCode: '1112', cashAccountName: 'بنك', status: 'POSTED' } }), 'يتجاوز');
  await expectAccept('سداد جزئي 60', () => run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'S3', date: D, supplierId: 'sp1', supplierName: 'مورد', amount: 60, supplierInvoiceId: si.rec.id, cashAccountCode: '1112', cashAccountName: 'بنك', status: 'POSTED' } }));
  await expectReject('سداد ثانٍ يتجاوز المتبقي (60+60>115)', () => run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'S4', date: D, supplierId: 'sp1', supplierName: 'مورد', amount: 60, supplierInvoiceId: si.rec.id, cashAccountCode: '1112', cashAccountName: 'بنك', status: 'POSTED' } }), 'يتجاوز');
}

// ═══ 7. المشتريات: اعتماد مرتين وحذف المعتمد ═══
{
  const si = await run('SUPPLIER_INVOICE', 'create', { data: { invoiceNo: 'S9', date: D, supplierId: 'sp1', supplierName: 'مورد', baseAmount: 50, vatRate: 0.15, vatAmount: 7.5, totalAmount: 57.5, paidAmount: 0, status: 'DRAFT' } });
  await run('SUPPLIER_INVOICE', 'approve', { id: si.rec.id });
  await expectReject('اعتماد فاتورة مورد مرتين', () => run('SUPPLIER_INVOICE', 'approve', { id: si.rec.id }), 'مسودة');
}

// ═══ 8. التسويات والمنصات ═══
await expectReject('تسوية منصة بمبلغ صفر', () => run('PLATFORM_SETTLEMENT', 'create', { data: { platformId: 'pfN', date: D, settledAmount: 0 } }), 'أكبر من صفر');
await expectReject('تسوية منصة غير موجودة', () => run('PLATFORM_SETTLEMENT', 'create', { data: { platformId: 'zzz', date: D, settledAmount: 50 } }), 'غير موجودة');

// ═══ 9. الفترة المقفلة ═══
await expectReject('بيع بتاريخ داخل سنة مقفلة (2025)', () => run('SALES_INVOICE', 'create', { data: inv({ invoiceNo: 'OLD', date: '2025-06-01', invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }] } }) }), 'مقفلة');

// ═══ التقرير ═══
console.log('════════ اختبارات الفشل والحالات الحرفية — المحرك ══════\n');
for (const r of rows) console.log(`${r.res === 'PASS' ? '✓ PASS' : r.res === 'FAIL' ? '✗ FAIL' : '⛔ BLCK'} | ${r.label}\n        ${r.note}`);
console.log('\n──────────────────────────────');
console.log(`PASS: ${P} | FAIL: ${F}`);
if (fixes.length) { console.log('\nإصلاحات مطلوبة مكتشفة بالاختبار:'); fixes.forEach((x) => console.log('  ⚠ ' + x)); }
console.log(F === 0 ? '\n✓ كل الحالات غير الصالحة تُرفض بشكل صحيح' : '\n⚠ توجد حالات تمر بلا رفض — انظر FAIL');
process.exit(F === 0 ? 0 : 1);
