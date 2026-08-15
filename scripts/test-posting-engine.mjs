// حاضنة اختبار لمحرك ترحيل القيود (entry.ts) — تتحقق أن كل عملية تُرحّل على
// الحسابات الصحيحة من الدليل الجديد. تُحمّل نفس الكود المنشور حرفياً عبر Function().
//
// التشغيل: node scripts/test-posting-engine.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildStandardAccounts } from '../src/lib/standardChart.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── تحميل entry.ts بنفس آلية functionRunner.js ──────────────────────────────
function loadScope() {
  const filePath = path.join(__dirname, '..', 'base44', 'functions', 'postOperation', 'entry.ts');
  let source = fs.readFileSync(filePath, 'utf8');
  source = source.replace(/^import\s+\{\s*createClientFromRequest\s*\}\s+from\s+['"]npm:@base44\/sdk@[^'"]+['"];?\s*/m, '');
  const serveIndex = source.indexOf('Deno.serve');
  if (serveIndex >= 0) source = source.slice(0, serveIndex);
  const factory = new Function(`${source}\nreturn { HANDLERS, guarded };`);
  return factory();
}
const { HANDLERS, guarded } = loadScope();

// ─── متجر كيانات في الذاكرة + التقاط القيود ───────────────────────────────────
const store = {}; // entityName -> Map(id -> record)
const journalCalls = [];
const uuid = () => 'id-' + Math.random().toString(36).slice(2, 10);

function entityStore(name) { if (!store[name]) store[name] = new Map(); return store[name]; }
function makeApi(name) {
  const s = () => entityStore(name);
  return {
    create: async (data) => {
      const id = data.id || uuid();
      const rec = { ...data, id, created_date: new Date().toISOString(), updated_date: new Date().toISOString() };
      s().set(id, rec);
      if (name === 'JournalEntry') journalCalls.push(rec);
      return rec;
    },
    get: async (id) => s().get(id) || null,
    update: async (id, data) => { const cur = s().get(id) || {}; const next = { ...cur, ...data, updated_date: new Date().toISOString() }; s().set(id, next); return next; },
    updateMany: async (q, upd) => { for (const r of s().values()) { if (matchQ(r, q)) Object.assign(r, upd); } return { updated: true }; },
    list: async () => [...s().values()],
    filter: async (q) => { let arr = [...s().values()]; if (q && typeof q === 'object') arr = arr.filter((r) => matchQ(r, q)); return arr; },
    delete: async (id) => { s().delete(id); return { success: true }; },
  };
}
function matchQ(rec, q) { for (const k of Object.keys(q)) { if (rec[k] !== q[k]) return false; } return true; }

const base44 = { asServiceRole: { entities: new Proxy({}, { get: (_, n) => makeApi(String(n)) }) } };

// ─── تهيئة البيانات الأساسية ──────────────────────────────────────────────────
function seed() {
  const ca = entityStore('ChartAccount');
  for (const a of buildStandardAccounts()) ca.set(a.code, { ...a, id: a.code });
  const fy = entityStore('FiscalYear');
  fy.set('fy1', { id: 'fy1', status: 'OPEN', isCurrent: true, startDate: '2026-01-01', endDate: '2026-12-31' });
  entityStore('Client').set('cl1', { id: 'cl1', name: 'عميل نقدي', isCash: true });
  entityStore('Client').set('cl2', { id: 'cl2', name: 'فندق السلام', isCash: false, discountPercentage: 0 });
  entityStore('Supplier').set('sp1', { id: 'sp1', name: 'مورد اللحوم' });
  entityStore('Employee').set('em1', { id: 'em1', name: 'فيصل', salary: 5000, allowances: 500, deductions: 0, status: 'ACTIVE' });
  entityStore('InventoryItem').set('it1', { id: 'it1', name: 'وجبة دجاج', salePrice: 30, unit: 'وجبة' });
  entityStore('DeliveryPlatform').set('pf1', { id: 'pf1', name: 'هنقرستيشن', settlementMethod: 'NET', commissionRate: 0.15, vatRate: 0.15, settlementAccountCode: '1112' });
  entityStore('Project').set('pr1', { id: 'pr1', name: 'PALACE INDIA' });
}
seed();

async function run(operation, mode, payload) {
  journalCalls.length = 0;
  const handler = HANDLERS[operation]?.[mode];
  if (!handler) throw new Error(`لا يوجد معالج ${operation}.${mode}`);
  const rec = await guarded(base44, { operation, mode, ...payload }, handler);
  return { record: rec, jes: [...journalCalls] };
}

// ─── أدوات التحقق ─────────────────────────────────────────────────────────────
const linesOf = (je) => je.lines.map((l) => `${l.accountCode}:${l.debit}/${l.credit}`);
let pass = 0, fail = 0;
const summary = [];
function check(label, cond, detail) {
  if (cond) { pass++; summary.push(`  ✓ ${label}`); }
  else { fail++; summary.push(`  ✗ ${label}${detail ? ' — ' + detail : ''}`); }
}
function assertBalanced(je, label) {
  const d = je.lines.reduce((s, l) => s + (l.debit || 0), 0);
  const c = je.lines.reduce((s, l) => s + (l.credit || 0), 0);
  check(`${label}: قيد متوازن`, Math.abs(d - c) < 0.01, `مدين=${d} دائن=${c}`);
}
const lineWith = (je, code) => je.lines.find((l) => l.accountCode === code);

// ═════════════════════════ الاختبارات (مستقلة) ═══════════════════════════════
const tests = [
  ['1. مبيعات صالة (نقدي)', async () => {
    const { record } = await run('SALES_INVOICE', 'create', { data: { invoiceNo: 'D1', date: '2026-08-10', invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, projectId: 'pr1', projectName: 'PALACE INDIA', notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }] }, status: 'DRAFT' } });
    const { jes } = await run('SALES_INVOICE', 'approve', { id: record.id });
    const je = jes[0]; if (!je) return check('مبيعات صالة: قيد', false);
    assertBalanced(je, 'صالة');
    check('صالة: 1111 مدين 115', lineWith(je, '1111')?.debit === 115);
    check('صالة: 4100 دائن 100', lineWith(je, '4100')?.credit === 100);
    check('صالة: 2160 دائن 15', lineWith(je, '2160')?.credit === 15);
    return linesOf(je).join('  ');
  }],
  ['2. مبيعات توصيل مباشر (نقدي)', async () => {
    const { record } = await run('SALES_INVOICE', 'create', { data: { invoiceNo: 'D2', date: '2026-08-10', invoiceType: 'DELIVERY', subtotal: 80, vatRate: 0.15, vatAmount: 12, totalAmount: 92, paidAmount: 92, projectId: 'pr1', projectName: 'PALACE INDIA', notes: { payments: [{ method: 'CASH', amount: 92, received: 92 }] }, status: 'DRAFT' } });
    const { jes } = await run('SALES_INVOICE', 'approve', { id: record.id });
    const je = jes[0]; if (!je) return check('توصيل: قيد', false);
    assertBalanced(je, 'توصيل');
    check('توصيل: 4200 دائن 80', lineWith(je, '4200')?.credit === 80);
    check('توصيل: 1111 مدين 92', lineWith(je, '1111')?.debit === 92);
    return linesOf(je).join('  ');
  }],
  ['3. مبيعات مناسبات (نقدي)', async () => {
    const { record } = await run('SALES_INVOICE', 'create', { data: { invoiceNo: 'D3', date: '2026-08-10', invoiceType: 'EVENTS', subtotal: 200, vatRate: 0.15, vatAmount: 30, totalAmount: 230, paidAmount: 230, projectId: 'pr1', projectName: 'PALACE INDIA', notes: { payments: [{ method: 'CASH', amount: 230, received: 230 }] }, status: 'DRAFT' } });
    const { jes } = await run('SALES_INVOICE', 'approve', { id: record.id });
    const je = jes[0]; if (!je) return check('مناسبات: قيد', false);
    assertBalanced(je, 'مناسبات');
    check('مناسبات: 4300 دائن 200', lineWith(je, '4300')?.credit === 200);
    return linesOf(je).join('  ');
  }],
  ['4. مبيعات منصة (NET)', async () => {
    const { record } = await run('SALES_INVOICE', 'create', { data: { invoiceNo: 'P1', date: '2026-08-10', invoiceType: 'DELIVERY', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 0, projectId: 'pr1', projectName: 'PALACE INDIA', isPlatformSale: true, platformId: 'pf1', platformName: 'هنقرستيشن', platformCommission: 15, platformCommissionVat: 2.25, settlementMethod: 'NET', notes: { payments: [] }, status: 'DRAFT' } });
    const { jes } = await run('SALES_INVOICE', 'approve', { id: record.id });
    const je = jes[0]; if (!je) return check('منصة: قيد', false);
    assertBalanced(je, 'منصة');
    check('منصة: 1115 مدين', !!lineWith(je, '1115'));
    check('منصة: 5231 مدين 15', lineWith(je, '5231')?.debit === 15);
    check('منصة: 1140 مدين 2.25', lineWith(je, '1140')?.debit === 2.25);
    check('منصة: 4200 دائن 100', lineWith(je, '4200')?.credit === 100);
    return linesOf(je).join('  ');
  }],
  ['5. تحصيل عميل آجل', async () => {
    const { jes } = await run('CLIENT_PAYMENT', 'create', { data: { receiptNo: 'CP1', date: '2026-08-10', clientId: 'cl2', clientName: 'فندق السلام', amount: 50, cashAccountCode: '1111', cashAccountName: 'صندوق الكاشير', status: 'POSTED' } });
    const je = jes[0]; if (!je) return check('تحصيل: قيد', false);
    assertBalanced(je, 'تحصيل');
    check('تحصيل: 1111 مدين 50', lineWith(je, '1111')?.debit === 50);
    check('تحصيل: 1121 دائن 50', lineWith(je, '1121')?.credit === 50);
    return linesOf(je).join('  ');
  }],
  ['6. استلام بضاعة (مع مورد)', async () => {
    const { jes } = await run('GOODS_RECEIPT', 'create', { data: { receiptNo: 'GR1', date: '2026-08-10', supplierId: 'sp1', supplierName: 'مورد اللحوم', warehouseId: 'pr1', warehouseName: 'PALACE INDIA', lines: [{ description: 'دجاج', unit: 'كجم', receivingQty: 10, unitPrice: 20 }] } });
    const je = jes[0]; if (!je) return check('استلام: قيد', false);
    assertBalanced(je, 'استلام');
    check('استلام: 1131 مدين 200', lineWith(je, '1131')?.debit === 200);
    check('استلام: 2110 دائن 200 (ذمم الموردين — لا 3900)', lineWith(je, '2110')?.credit === 200 && !lineWith(je, '3900'));
    return linesOf(je).join('  ');
  }],
  ['7. فاتورة مورد (مباشرة)', async () => {
    const { record } = await run('SUPPLIER_INVOICE', 'create', { data: { invoiceNo: 'SI1', date: '2026-08-10', supplierId: 'sp1', supplierName: 'مورد اللحوم', baseAmount: 300, vatRate: 0.15, vatAmount: 45, totalAmount: 345, paidAmount: 0, status: 'DRAFT' } });
    const { jes } = await run('SUPPLIER_INVOICE', 'approve', { id: record.id });
    const je = jes[0]; if (!je) return check('فاتورة مورد: قيد', false);
    assertBalanced(je, 'فاتورة مورد');
    check('فاتورة مورد: 5110 مدين 300', lineWith(je, '5110')?.debit === 300);
    check('فاتورة مورد: 1140 مدين 45', lineWith(je, '1140')?.debit === 45);
    check('فاتورة مورد: 2110 دائن 345', lineWith(je, '2110')?.credit === 345);
    return linesOf(je).join('  ');
  }],
  ['8. سداد مورد', async () => {
    const { jes } = await run('SUPPLIER_PAYMENT', 'create', { data: { voucherNo: 'SP1', date: '2026-08-10', supplierId: 'sp1', supplierName: 'مورد اللحوم', amount: 100, cashAccountCode: '1112', cashAccountName: 'البنك', status: 'POSTED' } });
    const je = jes[0]; if (!je) return check('سداد مورد: قيد', false);
    assertBalanced(je, 'سداد مورد');
    check('سداد مورد: 2110 مدين 100', lineWith(je, '2110')?.debit === 100);
    check('سداد مورد: 1112 دائن 100', lineWith(je, '1112')?.credit === 100);
    return linesOf(je).join('  ');
  }],
  ['9. مصروف تشغيلي', async () => {
    const { jes } = await run('EXPENSE', 'create', { data: { voucherNo: 'EX1', date: '2026-08-10', category: 'OPERATING', expenseType: 'COMPANY', description: 'كهرباء', amount: 60, paymentAccountCode: '1111', paymentAccountName: 'صندوق الكاشير', baseAmount: 60, vatRate: 0, vatAmount: 0, totalAmount: 60, status: 'POSTED' } });
    const je = jes[0]; if (!je) return check('مصروف: قيد', false);
    assertBalanced(je, 'مصروف');
    check('مصروف: 5220 مدين 60', lineWith(je, '5220')?.debit === 60);
    check('مصروف: 1111 دائن 60', lineWith(je, '1111')?.credit === 60);
    return linesOf(je).join('  ');
  }],
  ['10. مسير رواتب (استحقاق + سداد)', async () => {
    const { record } = await run('PAYROLL', 'create', { data: { code: 'PAY1', month: 8, year: 2026, totalSalaries: 5000, totalAllowances: 500, totalDeductions: 0, netAmount: 5500, employeeIds: ['em1'], employeeLines: [{ employeeId: 'em1', name: 'فيصل', salary: 5000, allowances: 500, deductions: 0, net: 5500 }], status: 'DRAFT' } });
    const appr = await run('PAYROLL', 'approve', { id: record.id });
    const acc = appr.jes[0];
    let out = '';
    if (acc) {
      assertBalanced(acc, 'استحقاق');
      check('استحقاق: 5210 مدين 5500', lineWith(acc, '5210')?.debit === 5500);
      check('استحقاق: 2140 دائن 5500', lineWith(acc, '2140')?.credit === 5500);
      out += 'استحقاق: ' + linesOf(acc).join(' ');
    }
    const pay = await run('PAYROLL', 'pay', { id: record.id, data: { paymentAccountCode: '1112', paymentAccountName: 'البنك', paymentDate: '2026-08-15' } });
    const pj = pay.jes[0];
    if (pj) {
      assertBalanced(pj, 'سداد');
      check('سداد رواتب: 2140 مدين 5500', lineWith(pj, '2140')?.debit === 5500);
      check('سداد رواتب: 1112 دائن 5500', lineWith(pj, '1112')?.credit === 5500);
      out += ' | سداد: ' + linesOf(pj).join(' ');
    }
    return out;
  }],
  ['11. تلف مخزون (طبيعي)', async () => {
    const { jes } = await run('STOCK_MOVEMENT', 'create', { data: { date: '2026-08-10', type: 'DAMAGE_NORMAL', reason: 'تلف', itemId: 'it1', itemName: 'وجبة دجاج', unit: 'كجم', quantity: 2, unitCost: 20, fromWarehouseId: 'pr1', fromWarehouseName: 'PALACE INDIA' } });
    const je = jes[0]; if (!je) return check('تلف: قيد', false);
    assertBalanced(je, 'تلف');
    check('تلف: 5170 مدين 40', lineWith(je, '5170')?.debit === 40);
    check('تلف: 1131 دائن 40', lineWith(je, '1131')?.credit === 40);
    return linesOf(je).join('  ');
  }],
  ['12. تسوية جرد بالزيادة', async () => {
    const { jes } = await run('STOCK_MOVEMENT', 'create', { data: { date: '2026-08-10', type: 'ADJUST_INCREASE', reason: 'جرد', itemId: 'it1', itemName: 'وجبة دجاج', unit: 'كجم', quantity: 1, unitCost: 10, toWarehouseId: 'pr1', toWarehouseName: 'PALACE INDIA' } });
    const je = jes[0]; if (!je) return check('تسوية: قيد', false);
    assertBalanced(je, 'تسوية زيادة');
    check('تسوية: 1131 مدين 10', lineWith(je, '1131')?.debit === 10);
    check('تسوية: 4430 دائن 10', lineWith(je, '4430')?.credit === 10);
    return linesOf(je).join('  ');
  }],
  ['13. مرتجع مبيعات', async () => {
    const inv = await run('SALES_INVOICE', 'create', { data: { invoiceNo: 'R1', date: '2026-08-10', invoiceType: 'DINE_IN', subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: 115, projectId: 'pr1', projectName: 'PALACE INDIA', notes: { payments: [{ method: 'CASH', amount: 115, received: 115 }], items: [{ itemId: 'it1', itemName: 'وجبة دجاج', qty: 1, unitPrice: 100, total: 100 }] }, status: 'DRAFT' } });
    await run('SALES_INVOICE', 'approve', { id: inv.record.id });
    const { jes } = await run('SALES_RETURN', 'create', { data: { returnNo: 'SR1', date: '2026-08-11', originalInvoiceId: inv.record.id, lines: [{ itemId: 'it1', itemName: 'وجبة دجاج', qty: 1, unitPrice: 100 }], subtotal: 100, vatRate: 0.15, vatAmount: 15, totalAmount: 115, isFullReturn: true } });
    const je = jes[0]; if (!je) return check('مرتجع: قيد', false);
    assertBalanced(je, 'مرتجع');
    check('مرتجع: 4100 مدين 100 (عكسي)', lineWith(je, '4100')?.debit === 100);
    check('مرتجع: 2160 مدين 15 (عكسي)', lineWith(je, '2160')?.debit === 15);
    check('مرتجع: 1111 دائن 115 (رد النقد)', lineWith(je, '1111')?.credit === 115);
    return linesOf(je).join('  ');
  }],
];

// ─── تشغيل ────────────────────────────────────────────────────────────────────
console.log('════ اختبار محرك ترحيل القيود (entry.ts) مع الدليل الجديد ════\n');
for (const [label, fn] of tests) {
  const before = summary.length;
  let out = '';
  try { out = (await fn()) || ''; }
  catch (e) { fail++; summary.push(`  ✗ ${label}: استثناء — ${e.message}`); }
  const myChecks = summary.splice(before).join('\n');
  console.log(`▶ ${label}`);
  if (myChecks) console.log(myChecks);
  if (out) console.log(`   القيد: ${out}\n`);
  else console.log('');
}

console.log('════════════════════════════════════════════════════');
console.log(`  ناجح: ${pass}  |  فاشل: ${fail}`);
console.log('════════════════════════════════════════════════════');
if (fail > 0) { console.log('\n⚠ توجد فحوص فاشلة (انظر ✗ أعلاه)'); process.exit(1); }
else console.log('✓ جميع العمليات تُرحّل على الحسابات الصحيحة');
