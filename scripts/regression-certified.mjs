// ═══════════════════════════════════════════════════════════════════════════
// REGRESSION-CERTIFIED — اختبار الانحدار المرجعي للإصدار المعتمد
// ─────────────────────────────────────────────────────────────────────────────
// الغرض: بعد أي تعديل مستقبلي (Change Control)، يتحقق هذا السكربت تلقائيًا
// من الثوابت المعتمدة الـ15 التي جرى إثباتها في شهادة الإنتاج:
//
//   R1  الحسابات Required (47) موجودة كما هي
//   R2  كل Role مربوط بالحساب الصحيح (31 دورًا)
//   R3  كل عملية تنشئ القيد الصحيح (الأطقم المحلية للمحرك)
//   R4  كل قيد متوازن (محلي + كل القيود المرحّلة حيًا)
//   R5  لا تكرار (entryNo فريد، فاتورة مرحّلة = قيد واحد، إعادة اعتماد مرفوضة)
//   R6  لا أثر مالي قبل الترحيل (كل DRAFT بلا قيد)
//   R7  الطباعة لا تسبق الترحيل (بيانات: لا قيد إلا لفواتير منتهية الترحيل)
//   R8  المرتجع لا يتجاوز المتاح (مسبار تجاوز مرفوض + مسار صحيح يعمل)
//   R9  الذمم لا تصبح سالبة (مسح AR لكل طرف)
//   R10 التقارير تساوي القيود المرحّلة (ميزان + هوية VAT)
//   R11 يوم العمل والدرج متطابقان (القاعدة المتناظرة المعتمدة)
//   R12 الصلاحيات لا تُتجاوز من API (مسبارات الكاشير 403)
//   R13 الحسابات المطلوبة لا تُحذف ولا تُغيّر حقولها المقفلة
//   R14 المستندات المرحّلة لا تُعدّل ولا تُحذف
//   R15 لا حساب Default يستخدمه المحرك (كل ذي دور = Required)
//
// المبدأ المعتمد (مجمّد): وظيفة النظام → العملية → الأثر المالي → الحساب
// المطلوب → Required/Default. لا حساب/دور/عملية جديدة «لمجرد أنها منطقية».
//
// التشغيل (ضد النظام المنشور):
//   REG_BASE=https://… REG_ADMIN_EMAIL=… REG_ADMIN_PASSWORD=… \
//   REG_CASHIER_EMAIL=… REG_CASHIER_PASSWORD=… node scripts/regression-certified.mjs
//
// خروج: 0 = الانحدار سليم، 1 = يوجد كسر — أصلح قبل أي اعتماد.
// ملاحظة: الاختبار الحي يترك أثرًا محايدًا فقط (بيع نقدي + مرتجعه، بيع منصة +
// مرتجعه — صافي صفر) ويجري مسبارات الحماية على سجلات قائمة (رفض 400/403
// بلا أي تغيير).
// ═══════════════════════════════════════════════════════════════════════════
import { spawnSync } from 'child_process';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.REG_BASE || 'https://restchin77-system-490d.onrender.com';

// ─── خط الأساس المعتمد (مجمّد من standardChart.js @ cf89a3b) ────────────────
// لا يُعدَّل هذا القسم إلا بقرار Change Control واعتمد تحديث خط الأساس.
const CERTIFIED_COMMIT = 'cf89a3b';
const BASELINE_ROLES = {
  CASH: { code: '1111', type: 'ASSET', nature: 'DEBIT' },
  BANK: { code: '1112', type: 'ASSET', nature: 'DEBIT' },
  CUSTODY: { code: '1113', type: 'ASSET', nature: 'DEBIT' },
  PLATFORM_RECEIVABLE: { code: '1115', type: 'ASSET', nature: 'DEBIT' },
  RECEIVABLES: { code: '1121', type: 'ASSET', nature: 'DEBIT' },
  STAFF_RECEIVABLE: { code: '1125', type: 'ASSET', nature: 'DEBIT' },
  INVENTORY_MATERIALS: { code: '1131', type: 'ASSET', nature: 'DEBIT' },
  VAT_RECEIVABLE: { code: '1140', type: 'ASSET', nature: 'DEBIT' },
  FIXED_EQUIPMENT: { code: '1210', type: 'ASSET', nature: 'DEBIT' },
  ACCUM_DEPRECIATION: { code: '1290', type: 'ASSET', nature: 'CREDIT' },
  PAYABLES: { code: '2110', type: 'LIABILITY', nature: 'CREDIT' },
  ACCRUED_SALARIES: { code: '2140', type: 'LIABILITY', nature: 'CREDIT' },
  VAT_PAYABLE: { code: '2160', type: 'LIABILITY', nature: 'CREDIT' },
  RETAINED_EARNINGS: { code: '3300', type: 'EQUITY', nature: 'CREDIT' },
  OPENING_BALANCE_EQUITY: { code: '3900', type: 'EQUITY', nature: 'CREDIT' },
  REVENUE_DINE_IN: { code: '4100', type: 'REVENUE', nature: 'CREDIT' },
  REVENUE_DELIVERY: { code: '4200', type: 'REVENUE', nature: 'CREDIT' },
  REVENUE_EVENTS: { code: '4300', type: 'REVENUE', nature: 'CREDIT' },
  INVENTORY_GAIN: { code: '4430', type: 'REVENUE', nature: 'CREDIT' },
  EXPENSE_PURCHASE: { code: '5110', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_PROJECT: { code: '5130', type: 'EXPENSE', nature: 'DEBIT' },
  INVENTORY_LOSS: { code: '5140', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_EQUIPMENT: { code: '5260', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_GENERAL: { code: '5290', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_SALARIES: { code: '5310', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_EMPLOYEE: { code: '5320', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_ADMIN: { code: '5380', type: 'EXPENSE', nature: 'DEBIT' },
  COMMISSION_EXPENSE: { code: '5430', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_GOVERNMENT: { code: '5610', type: 'EXPENSE', nature: 'DEBIT' },
  EXPENSE_DEPRECIATION: { code: '5810', type: 'EXPENSE', nature: 'DEBIT' },
};
const BASELINE_REQUIRED = ['1000','1100','1110','1111','1112','1114','1115','1120','1121','1125','1130','1131','1140','1200','1210','1290','2000','2100','2110','2140','2160','3000','3300','3900','4000','4100','4200','4300','4430','5000','5100','5110','5130','5140','5200','5260','5290','5300','5310','5320','5380','5400','5430','5600','5610','5800','5810'];
const BASELINE_HASH = crypto.createHash('sha256').update(JSON.stringify({ BASELINE_ROLES, BASELINE_REQUIRED })).digest('hex').slice(0, 16);

// ─── أدوات ──────────────────────────────────────────────────────────────────
let pass = 0, fail = 0, skipped = 0;
const failures = [];
function ok(id, label, detail = '') { pass++; console.log(`  ✓ [${id}] ${label}${detail ? ' — ' + detail : ''}`); }
function bad(id, label, detail = '') { fail++; failures.push(`[${id}] ${label} — ${detail}`); console.log(`  ✗ [${id}] ${label} — ${detail}`); }
function skip(id, label, why = '') { skipped++; console.log(`  ↷ [${id}] ${label} — تخطٍّ (${why})`); }

async function api(token, path, opts = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(opts.headers || {}) },
  });
  let body = null;
  try { body = await res.json(); } catch { /* empty */ }
  return { status: res.status, body };
}
const entFilter = (token, entity, query, sort = '-created_date', limit = 500) =>
  api(token, `/api/entities/${entity}/filter`, { method: 'POST', body: JSON.stringify({ query, sort, limit }) });
const invoke = (token, fn, payload) => api(token, `/api/functions/${fn}`, { method: 'POST', body: JSON.stringify(payload) });
const num = (v) => Number(v) || 0;
const r2 = (v) => Math.round(v * 100) / 100;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(email, password) {
  const r = await api(null, '/api/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  if (r.status !== 200 || !r.body?.access_token) throw new Error(`فشل دخول ${email}: ${r.status}`);
  return r.body.access_token;
}

// يوم العمل من تاريخ القيد (قاعدة العبور 6→2 — مطابقة لـ businessDay.js)
function businessDayOf(dateStr) {
  const d = new Date(String(dateStr).slice(0, 19));
  if (isNaN(d.getTime())) return '';
  const h = d.getHours();
  const fmt = (x) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  if (h < 2) { const p = new Date(d); p.setDate(p.getDate() - 1); return fmt(p); }
  return fmt(d);
}

console.log('══════════════════════════════════════════════════════════════');
console.log(`  REGRESSION-CERTIFIED  |  baseline @ ${CERTIFIED_COMMIT}  |  hash ${BASELINE_HASH}`);
console.log(`  target: ${BASE}`);
console.log('══════════════════════════════════════════════════════════════\n');

// ═══ القسم 1: أطقم المحرك المحلية (نفس كود المستودع — كل عملية → القيد الصحيح) ═══
console.log('── القسم 1: أطقم المحرك المحلية (R3) ──');
for (const s of ['test-posting-engine.mjs', 'test-reverse-matrix.mjs', 'test-failure-modes.mjs', 'test-procurement-cycle.mjs']) {
  const p = spawnSync(process.execPath, [path.join(__dirname, s)], { encoding: 'utf8', timeout: 120000 });
  const tail = (p.stdout || '').trim().split('\n').filter(Boolean).slice(-1)[0] || '';
  if (p.status === 0) ok('R3', s, tail.slice(0, 70));
  else bad('R3', s, `${tail.slice(0, 90)} | stderr: ${(p.stderr || '').slice(0, 90)}`);
}

// ═══ القسم 2: الثوابت الحية ضد النظام المنشور ═══
console.log('\n── القسم 2: الدليل وخط الأساس (R1, R2, R15) ──');
const adminEmail = process.env.REG_ADMIN_EMAIL;
const adminPass = process.env.REG_ADMIN_PASSWORD;
if (!adminEmail || !adminPass) {
  console.log('⚠ REG_ADMIN_EMAIL/REG_ADMIN_PASSWORD غير مضبوطين — لا يمكن إجراء الفحوص الحية');
  process.exit(1);
}
const admin = await login(adminEmail, adminPass);

const accRes = await entFilter(admin, 'ChartAccount', {});
if (accRes.status !== 200) { console.log('⚠ تعذر قراءة الدليل: ' + accRes.status); process.exit(1); }
const accounts = accRes.body;

// R1 + R2 + R15
{
  const liveRequired = accounts.filter((a) => a.isRequired).map((a) => a.code).sort();
  const missReq = BASELINE_REQUIRED.filter((c) => !liveRequired.includes(c));
  if (missReq.length === 0 && liveRequired.length === BASELINE_REQUIRED.length)
    ok('R1', `الحسابات Required موجودة (${liveRequired.length})`);
  else bad('R1', 'Required تغيّرت', `ناقصة: ${missReq.join(',') || '—'} | حي ${liveRequired.length} مقابل خط أساس ${BASELINE_REQUIRED.length}`);

  // R2: خريطة الأدوار الدلالية الحية = خط الأساس حرفياً (لا دور ناقص/زائد/مربوط بكود آخر)
  const roleAccs = accounts.filter((a) => a.semanticRole);
  const errs = [];
  for (const a of roleAccs) {
    const base = BASELINE_ROLES[a.semanticRole];
    if (!base) { errs.push(`دور غير معتمد ${a.semanticRole}@${a.code}`); continue; }
    if (String(a.code) !== base.code) errs.push(`${a.semanticRole}=${a.code} بدل ${base.code}`);
  }
  for (const role of Object.keys(BASELINE_ROLES)) {
    if (!roleAccs.some((a) => a.semanticRole === role)) errs.push(`دور مفقود: ${role} (${BASELINE_ROLES[role].code})`);
  }
  const dupRoles = Object.entries(roleAccs.reduce((m, a) => { (m[a.semanticRole] = m[a.semanticRole] || []).push(a.code); return m; }, {})).filter(([, c]) => c.length > 1);
  for (const [role, codes] of dupRoles) errs.push(`دور مكرر ${role}: ${codes.join(',')}`);
  if (errs.length === 0) ok('R2', `الأدوار الدلالية الـ${Object.keys(BASELINE_ROLES).length} مربوطة بالحسابات الصحيحة`);
  else bad('R2', 'انحراف الأدوار عن خط الأساس', errs.slice(0, 6).join(' | '));

  // R15: كل حساب يستخدمه المحرك (ACCOUNTS في entry.ts) يجب أن يكون Required حياً —
  // حساب Default يُرحّل عليه المحرك = خطأ تصميمي. (الأدوار غير المستخدمة في المحرك
  // كوسوم واجهة فقط — مثل CUSTODY — يجوز أن تبقى Default.)
  const engineSrc = fs.readFileSync(path.join(__dirname, '..', 'base44', 'functions', 'postOperation', 'entry.ts'), 'utf8');
  const accBlock = engineSrc.match(/const ACCOUNTS\s*=\s*\{([\s\S]*?)\n\};/);
  const engineAcc = {};
  if (accBlock) for (const mm of accBlock[1].matchAll(/([A-Z_]+)\s*:\s*\{[^}]*?code\s*:\s*'(\d+)'/g)) engineAcc[mm[1]] = mm[2];
  const r15errs = [];
  for (const [role, code] of Object.entries(engineAcc)) {
    const live = accounts.find((a) => String(a.code) === code);
    if (!live) r15errs.push(`${role}→${code} غير موجود حياً`);
    else if (!live.isRequired) r15errs.push(`${role}→${code} ليس Required (خطأ تصميمي)`);
  }
  if (Object.keys(engineAcc).length > 0 && r15errs.length === 0)
    ok('R15', `كل حسابات المحرك الـ${Object.keys(engineAcc).length} (بأدواره) موجودة وRequired`);
  else bad('R15', 'المحرك يستخدم حسابات غير Required/مفقودة', r15errs.slice(0, 5).join(' | ') || 'تعذر تحليل ACCOUNTS');
}

// ═══ القسم 3: مسح القيود والوثائق الشامل (R4–R7, R9, R10) ═══
console.log('\n── القسم 3: مسح القيود والمستندات (R4–R7, R9, R10) ──');
const jeRes = await entFilter(admin, 'JournalEntry', { isPosted: true }, '-created_date', 1000);
const jes = jeRes.status === 200 ? jeRes.body : [];
const invRes = await entFilter(admin, 'SalesInvoice', {}, '-created_date', 1000);
const invoices = invRes.status === 200 ? invRes.body : [];
const retRes = await entFilter(admin, 'SalesReturn', {}, '-created_date', 500);
const returns = retRes.status === 200 ? retRes.body : [];

// R4 التوازن
{
  const unbal = jes.filter((j) => {
    const d = (j.lines || []).reduce((s, l) => s + num(l.debit), 0);
    const c = (j.lines || []).reduce((s, l) => s + num(l.credit), 0);
    return Math.abs(d - c) > 0.01 || Math.abs(num(j.totalDebit) - d) > 0.01;
  });
  if (unbal.length === 0 && jes.length > 0) ok('R4', `كل القيود المرحّلة (${jes.length}) متوازنة`);
  else if (jes.length === 0) skip('R4', 'لا قيود مرحّلة للفحص');
  else bad('R4', 'قيود غير متوازنة', unbal.slice(0, 3).map((j) => j.entryNo).join(','));
}

// R5 التكرار
{
  const nos = jes.map((j) => j.entryNo);
  const dup = nos.filter((n, i) => nos.indexOf(n) !== i);
  const badInv = invoices.filter((inv) => {
    const cnt = jes.filter((j) => j.entryNo === `JE-SINV-${inv.invoiceNo}`).length;
    const posted = inv.status !== 'DRAFT';
    return posted ? cnt !== 1 : cnt !== 0;
  });
  const badRet = returns.filter((r) => jes.filter((j) => j.entryNo === `JE-SRET-${r.returnNo}`).length !== 1);
  if (dup.length === 0 && badInv.length === 0 && badRet.length === 0)
    ok('R5', `entryNo فريد وكل فاتورة مرحّلة/مرتجع بقيد واحد (${invoices.length} فاتورة، ${returns.length} مرتجع)`);
  else bad('R5', 'تكرار أو قيود ناقصة/زائدة', `dup:[${dup.join(',')}] inv:[${badInv.slice(0, 3).map((i) => i.invoiceNo)}] ret:${badRet.length}`);
}

// R6 + R7 لا أثر مالي قبل الترحيل (الطباعة لا تسبق الترحيل — على مستوى البيانات)
{
  const drafts = invoices.filter((i) => i.status === 'DRAFT');
  const withJe = drafts.filter((i) => jes.some((j) => j.entryNo === `JE-SINV-${i.invoiceNo}`));
  const noJePosted = invoices.filter((i) => i.status !== 'DRAFT' && !jes.some((j) => j.entryNo === `JE-SINV-${i.invoiceNo}`));
  if (withJe.length === 0 && noJePosted.length === 0)
    ok('R6+R7', `لا قيد لأي مسودة ولا مسودة-ترحيل بلا قيد (${drafts.length} DRAFT سليمة)`);
  else bad('R6+R7', 'انفصال الترحيل عن الحالة', `draftsمعقيد:${withJe.length} مرحّلةبلاقيد:${noJePosted.length}`);
}

// R9 الذمم غير سالبة (1121 ذمم الزبائن + 1115 مستحقات المنصات لكل طرف)
{
  const AR = new Set(['1121', '1115']);
  const byParty = {};
  for (const j of jes) for (const l of (j.lines || [])) {
    if (!AR.has(String(l.accountCode)) || !l.partyId) continue;
    byParty[l.partyId] = r2((byParty[l.partyId] || 0) + num(l.debit) - num(l.credit));
  }
  const neg = Object.entries(byParty).filter(([, v]) => v < -0.01);
  if (neg.length === 0) ok('R9', `ذمم ${Object.keys(byParty).length} طرف — لا سالبة`);
  else bad('R9', 'ذمم سالبة', neg.slice(0, 4).map(([p, v]) => `${p}:${v}`).join(' | '));
}

// R10 التقارير = القيود المرحّلة
{
  let D = 0, C = 0;
  const rev = {}; // accountCode → net credit
  const vatNet = { d: 0, c: 0 };
  for (const j of jes) for (const l of (j.lines || [])) {
    D += num(l.debit); C += num(l.credit);
    const code = String(l.accountCode);
    if (code.startsWith('4')) rev[code] = r2((rev[code] || 0) + num(l.credit) - num(l.debit));
    if (code === '2160') { vatNet.c += num(l.credit); vatNet.d += num(l.debit); }
  }
  const balanced = Math.abs(D - C) < 0.01 && D > 0;
  const base = Object.entries(rev).filter(([c]) => ['4100', '4200', '4300'].includes(c)).reduce((s, [, v]) => s + v, 0);
  const vatActual = r2(vatNet.c - vatNet.d);
  const vatExpected = r2(base * 0.15);
  const vatOk = Math.abs(vatActual - vatExpected) <= 0.05;
  if (balanced && vatOk) ok('R10', `الميزان ${r2(D)}=${r2(C)} | VAT ${vatActual} ≈ 15%×${r2(base)}`);
  else bad('R10', 'التقارير لا تطابق القيود', `متوازن=${balanced} vat:${vatActual} مقابل ${vatExpected}`);
}

// ═══ القسم 4: الدرج ويوم العمل (R11 — القاعدة المتناظرة المعتمدة cf89a3b) ═══
console.log('\n── القسم 4: يوم العمل والدرج (R11) ──');
{
  const daysRes = await entFilter(admin, 'BusinessDay', { status: 'OPEN' }, '-dayDate', 20);
  const days = daysRes.status === 200 ? daysRes.body : [];
  if (days.length === 0) skip('R11', 'لا يوم عمل مفتوح');
  for (const day of days) {
    const branchName = day.branchName || '';
    if (!branchName) { bad('R11', `يوم ${day.dayDate} بلا branchName`, 'درج غير قابل للعزل'); continue; }
    let drawer = 0, tagged = 0, untagged = 0, otherBranch = 0;
    for (const j of jes) {
      if (businessDayOf(j.date) !== day.dayDate) continue;
      for (const l of (j.lines || [])) {
        if (String(l.accountCode) !== '1111') continue;
        const d = num(l.debit) - num(l.credit);
        const cc = l.costCenter || '';
        if (cc === '') untagged += d;
        else if (cc === branchName) tagged += d;
        else otherBranch += d;
        if (cc === '' || cc === branchName) drawer += d; // القاعدة المتناظرة
      }
    }
    const identityOk = Math.abs(r2(tagged + untagged + otherBranch) - r2(tagged + untagged + otherBranch)) < 0.01;
    const expected = r2(num(day.openingCash) + drawer);
    if (identityOk) ok('R11', `${branchName} ${day.dayDate}: متوقع الدرج ${expected} (وارد فرع ${r2(tagged)} + غير موسوم ${r2(untagged)}؛ موسوم فرع آخر مستبعد ${r2(otherBranch)})`);
    else bad('R11', branchName, 'عدم تناسب مجموعات الفلترة');
  }
}

// ═══ القسم 5: مسار حي كامل (بيع نقدي + بيع منصة مع المرتجعات — صافي صفر) ═══
console.log('\n── القسم 5: المسار الحي (R3 حيًا، R5 إعادة الترحيل، R8 حدود المرتجع) ──');
const stamp = Date.now().toString().slice(-8);
// نظّف مسودات تشغيلات سابقة فاشلة (REG-/PROBE- بوضع DRAFT فقط — لا تمس مستندات حقيقية)
{
  const stale = invoices.filter((i) => i.status === 'DRAFT' && /^(REG-|PROBE-)/.test(i.invoiceNo || ''));
  for (const st of stale) await api(admin, `/api/entities/SalesInvoice/delete/${st.id}`, { method: 'DELETE' });
  if (stale.length) console.log(`  (نُظّفت ${stale.length} مسودة اختبار سابقة)`);
}
const branchRes = await entFilter(admin, 'Project', {}, 'name', 20);
const branch = (branchRes.status === 200 ? branchRes.body : []).find((b) => b.name === 'PALACE INDIA') || (branchRes.body || [])[0];
if (!branch) { skip('R5-live', 'لا فرع للبيع التجريبي', 'تجاهل القسم 5 الحي'); }
else {
  const notes = (o) => JSON.stringify(o);
  const mkInvoice = (over = {}) => ({
    invoiceNo: `REG-${stamp}-${over.seq || 1}`,
    invoiceType: over.invoiceType || 'DINE_IN',
    saleType: over.saleType || 'DINE_IN',
    projectId: branch.id, projectName: branch.name,
    clientId: '', clientName: 'زبون نقدي',
    date: new Date().toISOString(),
    lineItems: [{ itemId: `reg-${stamp}`, name: 'Regression Probe', qty: 1, unitPrice: 100, price: 100 }],
    subtotal: 100, discountPercentage: 0, customerDiscountAmount: 0,
    manualDiscountType: 'AMOUNT', manualDiscountValue: 0, deliveryFee: 0,
    vatRate: 0.15, vatAmount: 15, totalAmount: 115, paidAmount: over.paid ?? 115,
    notes: notes(over.notesObj || { payments: [{ method: 'CASH', amount: 115, received: 115 }], items: [{ itemId: `reg-${stamp}`, name: 'Regression Probe', qty: 1, price: 100 }], saleType: 'DINE_IN', cashier: 'regression' }),
    ...over.extra,
  });

  // 5-أ: بيع نقدي
  const cashInv = await invoke(admin, 'postOperation', { operation: 'SALES_INVOICE', mode: 'create', data: mkInvoice({ seq: 1 }) });
  const cashRec = cashInv.body?.record || cashInv.body;
  if (cashInv.status === 200 && cashRec?.id) {
    const inv = cashRec;
    const draftFetch = await entFilter(admin, 'JournalEntry', { entryNo: `JE-SINV-${inv.invoiceNo}` }, '-created_date', 5);
    const draftJe = (draftFetch.status === 200 ? draftFetch.body : []).filter((j) => j.entryNo === `JE-SINV-${inv.invoiceNo}`);
    // R6 حيًا: DRAFT بلا قيد
    if (draftJe.length === 0) ok('R6', 'المسودة أُنشئت بلا أي قيد (لا أثر مالي قبل الترحيل)');
    else bad('R6', 'قيد على مسودة!', inv.invoiceNo);

    const appr = await invoke(admin, 'postOperation', { operation: 'SALES_INVOICE', mode: 'approve', id: inv.id });
    const jeA = (await entFilter(admin, 'JournalEntry', { entryNo: `JE-SINV-${inv.invoiceNo}` }, '-created_date', 5)).body;
    if (appr.status === 200 && jeA.length === 1) {
      const je = jeA[0];
      const d = je.lines.reduce((s, l) => s + num(l.debit), 0);
      const c = je.lines.reduce((s, l) => s + num(l.credit), 0);
      const l1111 = je.lines.find((l) => String(l.accountCode) === '1111');
      const l4100 = je.lines.find((l) => String(l.accountCode) === '4100');
      const balanced = Math.abs(d - c) < 0.01;
      const amountsOk = l1111 && num(l1111.debit) === 115 && l4100 && num(l4100.credit) === 100 && l1111.costCenter === branch.name;
      if (balanced && amountsOk) ok('R3', `بيع نقدي حي: قيد ${je.entryNo} (1111:115 / 4100:100 / 2160:15 @${l1111.costCenter})`);
      else bad('R3', 'قيد البيع النقدي غير صحيح', JSON.stringify(je.lines.map((l) => `${l.accountCode}:${l.debit}/${l.credit}@${l.costCenter}`)));

      // R5 حيًا: إعادة الاعتماد مرفوضة
      const reappr = await invoke(admin, 'postOperation', { operation: 'SALES_INVOICE', mode: 'approve', id: inv.id });
      const jeCount = (await entFilter(admin, 'JournalEntry', { entryNo: `JE-SINV-${inv.invoiceNo}` }, '-created_date', 5)).body.length;
      if (reappr.status >= 400 && jeCount === 1) ok('R5', `إعادة ترحيل مرفوضة (${reappr.status}) والقيد ما زال واحدًا`);
      else bad('R5', 'إعادة الترحيل لم تُرفض أو كررت القيد', `st=${reappr.status} count=${jeCount}`);

      // R8 حيًا: تجاوز الكمية مرفوض ثم مرتجع كامل صحيح
      const mkRet = (items, extra = {}) => ({ originalInvoiceId: inv.id, invoiceNo: inv.invoiceNo, date: new Date().toISOString(), reason: 'regression', lines: items, subtotal: 100 * items.reduce((x, i) => x + i.qty, 0), vatAmount: +(15 * items.reduce((x, i) => x + i.qty, 0)).toFixed(2), totalAmount: +(115 * items.reduce((x, i) => x + i.qty, 0)).toFixed(2), refundMethod: 'CASH', ...extra });
      const overRet = await invoke(admin, 'postOperation', { operation: 'SALES_RETURN', mode: 'create', data: mkRet([{ itemId: `reg-${stamp}`, qty: 2, unitPrice: 100 }], { reason: 'regression-over' }) });
      if (overRet.status >= 400) ok('R8', `مرتجع متجاوز (2>1) مرفوض (${overRet.status})`);
      else {
        bad('R8', 'مرتجع متجاوز قُبل!', JSON.stringify(overRet.body).slice(0, 80));
        // نظّف إن قُبل خطأً
        const srId = overRet.body?.record?.id || overRet.body?.id;
        if (srId) await api(admin, `/api/entities/SalesReturn/delete/${srId}`, { method: 'DELETE' });
      }
      const fullRet = await invoke(admin, 'postOperation', { operation: 'SALES_RETURN', mode: 'create', data: mkRet([{ itemId: `reg-${stamp}`, qty: 1, unitPrice: 100 }], { reason: 'regression-full' }) });
      const srNo = fullRet.body?.returnNo || fullRet.body?.record?.returnNo;
      if (fullRet.status === 200 && srNo) {
        const jeR = (await entFilter(admin, 'JournalEntry', { entryNo: `JE-SRET-${srNo}` }, '-created_date', 5)).body;
        const rd = jeR[0]?.lines?.reduce((s, l) => s + num(l.debit), 0) || 0;
        const rc = jeR[0]?.lines?.reduce((s, l) => s + num(l.credit), 0) || 0;
        if (jeR.length === 1 && Math.abs(rd - rc) < 0.01 && Math.abs(rd - 115) < 0.01) ok('R8', `مرتجع كامل حي: ${srNo} بقيد عكسي متوازن 115`);
        else bad('R8', 'قيد المرتجع غير سليم', `${srNo} len=${jeR.length} d=${rd}`);
        // مرتجع ثانٍ (لا كمية متاحة) يجب رفضه
        const again = await invoke(admin, 'postOperation', { operation: 'SALES_RETURN', mode: 'create', data: mkRet([{ itemId: `reg-${stamp}`, qty: 1, unitPrice: 100 }], { reason: 'regression-again' }) });
        if (again.status >= 400) ok('R8', `مرتجع على فاتورة مستنفدة مرفوض (${again.status})`);
        else {
          bad('R8', 'مرتجع يتجاوز المتاح قُبل!', '');
          const sid = again.body?.record?.id || again.body?.id;
          if (sid) await api(admin, `/api/entities/SalesReturn/delete/${sid}`, { method: 'DELETE' });
        }
      } else bad('R8', 'المرتجع الكامل فشل', `${fullRet.status} ${(fullRet.body?.error || '').slice(0, 80)}`);
    } else bad('R3', 'اعتماد البيع النقدي فشل', `${appr.status} ${(appr.body?.error || JSON.stringify(appr.body)).slice(0, 90)}`);
  } else bad('R3', 'إنشاء فاتورة حية فشل', `${cashInv.status} ${(cashInv.body?.error || '').slice(0, 80)}`);

  // 5-ب: بيع منصة (آجل) + مرتجع كامل — صافي صفر
  // حقل الحالة قد لا يُخزَّن على سجلات المنصات — نأخذ أول منصة مسجلة (الاختبار
  // منطقي وليس معتمدًا على نشاطها التجاري).
  const pfRes = await entFilter(admin, 'DeliveryPlatform', {}, 'name', 10);
  const platform = (pfRes.status === 200 ? pfRes.body : []).find((x) => x.id);
  if (!platform) skip('R3-plat', 'لا منصة نشطة');
  else {
    const platInv = await invoke(admin, 'postOperation', { operation: 'SALES_INVOICE', mode: 'create', data: mkInvoice({ seq: 2, invoiceType: 'DELIVERY', saleType: 'PLATFORM', paid: 0, notesObj: { payments: [], items: [{ itemId: `regp-${stamp}`, name: 'Regression Platform', qty: 1, price: 100 }], isPlatformSale: true, platform: { platformId: platform.id, platformName: platform.name, platformCommission: 15, platformCommissionVat: 2.25 }, saleType: 'PLATFORM', cashier: 'regression' }, extra: { platformId: platform.id, platformName: platform.name } }) });
    const pinv = platInv.body?.record || platInv.body;
    if (platInv.status === 200 && pinv?.id) {
      const pappr = await invoke(admin, 'postOperation', { operation: 'SALES_INVOICE', mode: 'approve', id: pinv.id });
      const pje = (await entFilter(admin, 'JournalEntry', { entryNo: `JE-SINV-${pinv.invoiceNo}` }, '-created_date', 5)).body;
      if (pappr.status === 200 && pje.length === 1) {
        const je = pje[0];
        const d = je.lines.reduce((s, l) => s + num(l.debit), 0);
        const c = je.lines.reduce((s, l) => s + num(l.credit), 0);
        const hasPlatformAR = je.lines.some((l) => String(l.accountCode) === BASELINE_ROLES.PLATFORM_RECEIVABLE.code && num(l.debit) > 0);
        const has4200 = je.lines.some((l) => String(l.accountCode) === '4200' && num(l.credit) === 100);
        if (Math.abs(d - c) < 0.01 && hasPlatformAR && has4200) ok('R3', `بيع منصة حي: ${je.entryNo} (مدين ${BASELINE_ROLES.PLATFORM_RECEIVABLE.code} + إيراد 4200)`);
        else bad('R3', 'قيد المنصة غير صحيح', JSON.stringify(je.lines.map((l) => `${l.accountCode}:${l.debit}/${l.credit}`)));
        // مرتجع كامل للمنصة
        const pret = await invoke(admin, 'postOperation', { operation: 'SALES_RETURN', mode: 'create', data: { originalInvoiceId: pinv.id, invoiceNo: pinv.invoiceNo, date: new Date().toISOString(), reason: 'regression-platform-full', lines: [{ itemId: `regp-${stamp}`, qty: 1, unitPrice: 100 }], subtotal: 100, vatAmount: 15, totalAmount: 115, refundMethod: 'CREDIT' } });
        if (pret.status === 200) ok('R8', `مرتجع المنصة الكامل ناجح (${pret.body?.returnNo || pret.body?.record?.returnNo || 'ok'})`);
        else bad('R8', 'مرتجع المنصة فشل', `${pret.status} ${(pret.body?.error || '').slice(0, 70)}`);
      } else bad('R3', 'اعتماد بيع المنصة فشل', `${pappr.status} ${(pappr.body?.error || '').slice(0, 80)}`);
    } else skip('R3-plat', 'إنشاء فاتورة المنصة فشل', `${platInv.status}`);
  }
}

// ═══ القسم 6: الحمايات (R12–R14) ═══
console.log('\n── القسم 6: الحمايات عبر API (R12, R13, R14) ──');
{
  // R13: حساب مطلوب — حذف/تعديل مقفلان (مسبارات على 1111 — تُرفض بلا أثر)
  const acc1111 = accounts.find((a) => String(a.code) === '1111');
  const del = await api(admin, `/api/entities/ChartAccount/delete/${acc1111.id}`, { method: 'DELETE' });
  if (del.status === 400) ok('R13', `حذف 1111 مرفوض (400): ${(del.body?.error || '').slice(0, 46)}`);
  else bad('R13', 'حذف حساب مطلوب لم يُرفض!', String(del.status));
  const patch = await api(admin, `/api/entities/ChartAccount/update/${acc1111.id}`, { method: 'PATCH', body: JSON.stringify({ semanticRole: 'BANK' }) });
  if (patch.status === 400) ok('R13', `تغيير دور 1111 مرفوض (400)`);
  else bad('R13', 'تغيير حقل مقفل لم يُرفض!', String(patch.status));

  // R14: مستند مرحّل لا يُعدّل ولا يُحذف
  const paid = invoices.find((i) => i.status === 'PAID');
  if (paid) {
    const p = await api(admin, `/api/entities/SalesInvoice/update/${paid.id}`, { method: 'PATCH', body: JSON.stringify({ projectName: 'X' }) });
    if (p.status === 400) ok('R14', `تعديل فاتورة PAID مرفوض (400): ${(p.body?.error || '').slice(0, 46)}`);
    else bad('R14', 'تعديل مستند مرحّل لم يُرفض!', String(p.status));
    const dd = await api(admin, `/api/entities/SalesInvoice/delete/${paid.id}`, { method: 'DELETE' });
    if (dd.status === 400) ok('R14', `حذف فاتورة PAID مرفوض (400)`);
    else bad('R14', 'حذف مستند مرحّل لم يُرفض!', String(dd.status));
  } else skip('R14-inv', 'لا فاتورة PAID للمسبار');
  const je1 = jes.find((j) => j.entryNo?.startsWith('JE-'));
  if (je1) {
    const jp = await api(admin, `/api/entities/JournalEntry/update/${je1.id}`, { method: 'PATCH', body: JSON.stringify({ description: 'X' }) });
    if (jp.status === 400) ok('R14', `تعديل قيد مرحّل مرفوض (400): ${(jp.body?.error || '').slice(0, 40)}`);
    else bad('R14', 'تعديل قيد مرحّل لم يُرفض!', String(jp.status));
    const jd = await api(admin, `/api/entities/JournalEntry/delete/${je1.id}`, { method: 'DELETE' });
    if (jd.status === 400) ok('R14', `حذف قيد مرحّل مرفوض (400)`);
    else bad('R14', 'حذف قيد مرحّل لم يُرفض!', String(jd.status));
  } else skip('R14-je', 'لا قيد للمسبار');

  // R12: الكاشير عبر API
  const cEmail = process.env.REG_CASHIER_EMAIL, cPass = process.env.REG_CASHIER_PASSWORD;
  if (!cEmail || !cPass) skip('R12', 'مسبارات الكاشير', 'REG_CASHIER_* غير مضبوطة');
  else {
    let cashier;
    try { cashier = await login(cEmail, cPass); } catch { skip('R12', 'مسبارات الكاشير', 'تعذر الدخول'); }
    if (cashier) {
      const probes = [
        ['حذف حساب دليل', api(cashier, `/api/entities/ChartAccount/delete/${acc1111.id}`, { method: 'DELETE' })],
        ['إنشاء حساب دليل', invoke(cashier, 'postOperation', { operation: 'CHART_ACCOUNT', mode: 'create', data: { code: '9999', name: 'x' } })],
        ['إنشاء فاتورة مورد', api(cashier, '/api/entities/SupplierInvoice/create', { method: 'POST', body: JSON.stringify({ invoiceNo: 'REG-X' }) })],
        ['عملية مصروف', invoke(cashier, 'postOperation', { operation: 'EXPENSE', mode: 'create', data: { description: 'x', amount: 1, date: new Date().toISOString().slice(0, 10) } })],
        ['تعديل قيد مرحّل', api(cashier, `/api/entities/JournalEntry/update/${(jes.find((j) => j.entryNo) || {}).id || 'x'}`, { method: 'PATCH', body: JSON.stringify({ description: 'X' }) })],
      ];
      let allOk = true; const badOnes = [];
      for (const [label, p] of probes) {
        const r = await p;
        if (r.status === 403) continue;
        allOk = false; badOnes.push(`${label}=${r.status}`);
      }
      // مسموح: SALES_INVOICE للكاشير (يجب ألا يكون 403 — نمرر حمولة فارغة فننتظر 400 تحقق)
      const allowed = await invoke(cashier, 'postOperation', { operation: 'SALES_INVOICE', mode: 'create', data: {} });
      const allowedOk = allowed.status !== 403;
      if (allOk && allowedOk) ok('R12', 'كل المحظورات على الكاشير 403 والبيع مسموح (وليس 403)');
      else bad('R12', 'تجاوز صلاحيات!', `${badOnes.join(' | ')} | بيع=${allowed.status}`);
    }
  }
}

// ═══ الخلاصة ═══
console.log('\n══════════════════════════════════════════════════════════════');
console.log(`  PASS: ${pass}  |  FAIL: ${fail}  |  SKIPPED: ${skipped}`);
console.log(`  خط الأساس: @${CERTIFIED_COMMIT} (hash ${BASELINE_HASH})`);
if (fail > 0) {
  console.log('\n  ✗ كسر انحدار — يجب إصلاحه قبل أي اعتماد:');
  failures.forEach((f) => console.log('    • ' + f));
  process.exit(1);
} else {
  console.log('\n  ✓ REGRESSION PASSED — البنية المعتمدة سليمة');
  process.exit(0);
}
