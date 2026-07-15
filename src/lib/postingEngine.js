/**
 * Posting Engine — محرك الترحيل الدلالي (Semantic Posting Engine)
 *
 * الفكرة الأساسية: القيود لا تعتمد على أرقام حسابات ثابتة.
 * كل سطر قيد يشير إلى "دور دلالي" (semanticRole) مثل REVENUE_CONSTRUCTION،
 * والمحرك يحلّ هذا الدور إلى الحساب الفعلي من الدليل المحاسبي وقت الترحيل.
 *
 * فإذا غيّر المحاسب الحساب المرتبط بدور ما، تتبعه كل القيود تلقائياً
 * دون تعديل أي كود — وهذا جوهر الـ Semantic Accounting Engine.
 */

import { base44 } from '@/api/base44Client';
import { ACCOUNTS } from '@/lib/businessEngine';

// ─── طبقة تخزين مؤقت للدليل المحاسبي (تتفادى rate limit وتسرّع الترحيل) ──────
let _accountsCache = null;

export async function loadAccounts(force = false) {
  if (_accountsCache && !force) return _accountsCache;
  try {
    const list = await base44.entities.ChartAccount.list('code', 1000);
    _accountsCache = list || [];
  } catch {
    _accountsCache = [];
  }
  return _accountsCache;
}

export function clearAccountsCache() {
  _accountsCache = null;
}

/**
 * يحل دوراً دلالياً إلى حساب فعلي.
 * الأولوية: الدليل المحاسبي (SSOT) → ثم الثوابت الافتراضية كخطة بديلة.
 */
export function resolveAccount(role, accounts) {
  const fromChart = (accounts || []).find(
    a => a.semanticRole === role && a.isActive !== false
  );
  if (fromChart) {
    return { code: fromChart.code, name: fromChart.name, nameEn: fromChart.nameEn };
  }
  const fallback = ACCOUNTS[role];
  if (fallback) return { code: fallback.code, name: fallback.name, nameEn: fallback.nameEn };
  // لا حساب معرّف لهذا الدور — يُعاد مؤشر واضح لالتقاطه في التحقق
  return { code: '????', name: `دور غير معرّف: ${role}`, nameEn: `Unmapped role: ${role}`, unmapped: true };
}

/**
 * يبني سطور قيد من قالب ترحيل ومبالغ.
 * amounts = { base, vat, total, net }
 * يُرجع { lines, totalDebit, totalCredit, unmappedRoles }
 */
export function buildLinesFromTemplate(template, amounts, accounts, ctx = {}) {
  const lines = [];
  const unmappedRoles = [];
  for (const tl of template.lines || []) {
    const amount = +(amounts[tl.amountField] || 0);
    if (tl.optional && amount <= 0) continue;
    const acc = resolveAccount(tl.semanticRole, accounts);
    if (acc.unmapped) unmappedRoles.push(tl.semanticRole);
    lines.push({
      accountCode: acc.code,
      accountName: acc.name,
      debit:  tl.side === 'DEBIT'  ? amount : 0,
      credit: tl.side === 'CREDIT' ? amount : 0,
      description: tl.description || ctx.description || '',
    });
  }
  const totalDebit  = +lines.reduce((s, l) => s + l.debit, 0).toFixed(2);
  const totalCredit = +lines.reduce((s, l) => s + l.credit, 0).toFixed(2);
  return { lines, totalDebit, totalCredit, unmappedRoles };
}

/**
 * يبني قيداً كاملاً من نوع عملية باستخدام القالب المخزّن (إن وجد).
 * إذا لم يوجد قالب لنوع العملية، يُرجع null ليتراجع النظام لبناء القيد الثابت.
 */
export async function buildJEFromTemplate(operationType, { entryNo, date, description, sourceType, amounts }) {
  const [accounts, templates] = await Promise.all([
    loadAccounts(),
    base44.entities.PostingTemplate.filter({ operationType, isActive: true }),
  ]);
  const template = (templates || [])[0];
  if (!template) return null;

  const { lines, totalDebit, totalCredit, unmappedRoles } = buildLinesFromTemplate(template, amounts, accounts, { description });
  // إذا وُجد دور دلالي بلا حساب مقابل في الدليل، لا يجوز بناء قيد معطوب.
  if (unmappedRoles.length > 0) {
    throw new Error(`أدوار محاسبية غير معرّفة في الدليل: ${unmappedRoles.join(', ')} — لا يمكن ترحيل القيد ${entryNo}`);
  }
  return {
    entryNo,
    date,
    description,
    sourceType,
    isPosted: true,
    totalDebit,
    totalCredit,
    lines,
  };
}

/**
 * تحقق توازن القيد — لا يُرحّل قيد غير متوازن (Validation).
 */
export function isBalanced(je) {
  return Math.abs((je.totalDebit || 0) - (je.totalCredit || 0)) < 0.01;
}

// ─── قراءة الحسابات حسب دورها المحاسبي (لاستخدام الشاشات الذكية) ─────────────
//
// الفكرة: الشاشات لا تعتمد قائمة ثابتة، بل تقرأ الحسابات الحيّة من الدليل وتفهم
// كيف تُستخدم من نوعها وموقعها في الشجرة، وفق المعايير المحاسبية.

const CASH_ROLES = ['CASH', 'BANK', 'CUSTODY'];

// كلمات دالّة على النقدية في اسم الحساب (عربي/إنجليزي) — تحليل نصّي لالتقاط
// حساب كتبه المستخدم بحرّية دون تعيين دور دلالي أو وضعه تحت مجموعة النقدية.
const CASH_NAME_HINTS = [
  'صندوق', 'نقد', 'نقدي', 'نقدية', 'خزينة', 'خزنة', 'بنك', 'مصرف',
  'عهد', 'عهدة', 'محفظة', 'شيك',
  'cash', 'bank', 'petty', 'till', 'wallet', 'treasury', 'custody', 'cheque', 'check',
];

// يفهم إن كان اسم الحساب (بالعربية أو الإنجليزية) يدل على حساب نقدي.
function nameLooksCash(acc) {
  const text = `${acc.name || ''} ${acc.nameEn || ''}`.toLowerCase();
  return CASH_NAME_HINTS.some(h => text.includes(h));
}

/**
 * حسابات المصروفات القابلة للترحيل — تظهر مباشرة في شاشة المصروفات.
 * أي حساب مصروف جديد يُضاف في الدليل يظهر هنا فوراً.
 */
export function selectExpenseAccounts(accounts) {
  return (accounts || [])
    .filter(a => a.accountType === 'EXPENSE' && a.isPostable && a.isActive !== false)
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

/**
 * الحسابات النقدية (صندوق/بنك/عهد) المستخدمة كطرق دفع.
 * يُفهَم الحساب بثلاث طرق متكاملة، فيكفي أن تتحقق واحدة منها:
 *   1) دوره الدلالي (CASH/BANK/CUSTODY)،
 *   2) موقعه في الشجرة تحت مجموعة "النقدية وما في حكمها" (الكود 1110)،
 *   3) دلالة اسمه (صندوق/بنك/عهدة… Bank/Cash/Petty…).
 * وبذلك أي حساب نقدي يُضاف لاحقاً يظهر تلقائياً في خيارات الدفع.
 */
export function selectCashAccounts(accounts) {
  const list = accounts || [];
  return list
    .filter(a =>
      a.accountType === 'ASSET' && a.isPostable && a.isActive !== false &&
      (CASH_ROLES.includes(a.semanticRole) || isUnderCashGroup(a, list) || nameLooksCash(a))
    )
    .sort((a, b) => (a.code || '').localeCompare(b.code || ''));
}

// يتتبّع سلسلة الآباء ليعرف إن كان الحساب واقعاً تحت مجموعة النقدية (1110).
function isUnderCashGroup(acc, list) {
  let cur = acc;
  let guard = 0;
  while (cur && cur.parentCode && guard < 10) {
    if (cur.parentCode === '1110') return true;
    cur = list.find(a => a.code === cur.parentCode);
    guard += 1;
  }
  return false;
}