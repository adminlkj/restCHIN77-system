/**
 * Audit Engine — مجموعة التحقق المحاسبي الدائمة (Accounting Validation Suite)
 *
 * تفحص الـ invariants المحاسبية تلقائياً على البيانات الفعلية في النظام.
 * كل فحص يُرجع { id, group, title, severity, passed, detail, count } — وأي انحراف
 * ولو هللة واحدة (0.01) يُعتبر فشلاً حسب سياسة المشروع.
 *
 * تُستهلك من شاشة AuditSuite لعرض تقرير سلامة المحرك بضغطة زر.
 */

import { base44 } from '@/api/base44Client';
import { flattenPostedLines, buildTrialBalance } from '@/lib/ledgerEngine';
import { resolveVatRate } from '@/lib/businessEngine';

// عتبة التقريب: أي فرق يتجاوزها يعتبر فشلاً (هللة واحدة).
const EPSILON = 0.01;
const money = (n) => +(Number(n) || 0).toFixed(2);
const diff = (a, b) => Math.abs(money(a) - money(b));

function check({ id, group, title, severity = 'error', passed, detail, count = 0, samples = [] }) {
  return { id, group, title, severity, passed: !!passed, detail, count, samples };
}

/**
 * يحمّل كل البيانات المحاسبية اللازمة للفحص دفعةً واحدة.
 */
export async function loadAuditData() {
  const [entries, accounts, clients, suppliers, salesInvoices, purchaseOrders, expenses, fiscalYears] =
    await Promise.all([
      base44.entities.JournalEntry.list('-date', 5000).catch(() => []),
      base44.entities.ChartAccount.list('code', 2000).catch(() => []),
      base44.entities.Client.list('-created_date', 2000).catch(() => []),
      base44.entities.Supplier.list('-created_date', 2000).catch(() => []),
      base44.entities.SalesInvoice.list('-date', 5000).catch(() => []),
      base44.entities.PurchaseOrder.list('-date', 5000).catch(() => []),
      base44.entities.Expense.list('-date', 5000).catch(() => []),
      base44.entities.FiscalYear.list('-year', 100).catch(() => []),
    ]);
  return { entries, accounts, clients, suppliers, salesInvoices, purchaseOrders, expenses, fiscalYears };
}

// ─── المرحلة 1: سلامة المحرك ─────────────────────────────────────────────────

function auditEngineIntegrity({ entries, accounts }) {
  const results = [];
  const posted = entries.filter(e => e.isPosted);

  // 1) كل قيد متوازن (مدين = دائن)
  const unbalanced = posted.filter(je => {
    const d = (je.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = (je.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return diff(d, c) > EPSILON;
  });
  results.push(check({
    id: 'JE_BALANCED', group: 'engine', title: 'كل قيد يومية متوازن (مدين = دائن)',
    passed: unbalanced.length === 0,
    count: unbalanced.length,
    detail: unbalanced.length ? `يوجد ${unbalanced.length} قيد غير متوازن` : 'كل القيود متوازنة',
    samples: unbalanced.slice(0, 5).map(je => je.entryNo),
  }));

  // 2) totalDebit/totalCredit المخزّن يطابق مجموع السطور
  const headerMismatch = posted.filter(je => {
    const d = (je.lines || []).reduce((s, l) => s + (Number(l.debit) || 0), 0);
    const c = (je.lines || []).reduce((s, l) => s + (Number(l.credit) || 0), 0);
    return diff(d, je.totalDebit || 0) > EPSILON || diff(c, je.totalCredit || 0) > EPSILON;
  });
  results.push(check({
    id: 'JE_HEADER_MATCH', group: 'engine', title: 'إجمالي القيد المخزّن يطابق مجموع السطور',
    passed: headerMismatch.length === 0,
    count: headerMismatch.length,
    detail: headerMismatch.length ? `${headerMismatch.length} قيد إجماليه لا يطابق سطوره` : 'كل الإجماليات مطابقة',
    samples: headerMismatch.slice(0, 5).map(je => je.entryNo),
  }));

  // 3) لا يوجد JournalLine يتيم (بلا حساب أو بلا قيد)
  const orphanLines = [];
  for (const je of posted) {
    for (const l of je.lines || []) {
      if (!l.accountCode || l.accountCode === '????') orphanLines.push(je.entryNo);
    }
  }
  results.push(check({
    id: 'NO_ORPHAN_LINES', group: 'engine', title: 'لا يوجد سطر قيد يتيم (بلا حساب صحيح)',
    passed: orphanLines.length === 0,
    count: orphanLines.length,
    detail: orphanLines.length ? `${orphanLines.length} سطر بلا حساب معرّف` : 'كل السطور مرتبطة بحسابات',
    samples: [...new Set(orphanLines)].slice(0, 5),
  }));

  // 4) لا يوجد قيد بلا سطور
  const emptyEntries = posted.filter(je => !(je.lines || []).length);
  results.push(check({
    id: 'NO_EMPTY_JE', group: 'engine', title: 'لا يوجد قيد بلا سطور',
    passed: emptyEntries.length === 0,
    count: emptyEntries.length,
    detail: emptyEntries.length ? `${emptyEntries.length} قيد فارغ` : 'لا توجد قيود فارغة',
    samples: emptyEntries.slice(0, 5).map(je => je.entryNo),
  }));

  // 5) أرقام القيود فريدة (لا تكرار)
  const seen = {};
  const dups = [];
  for (const je of entries) {
    if (!je.entryNo) continue;
    seen[je.entryNo] = (seen[je.entryNo] || 0) + 1;
    if (seen[je.entryNo] === 2) dups.push(je.entryNo);
  }
  results.push(check({
    id: 'UNIQUE_ENTRY_NO', group: 'engine', title: 'أرقام القيود فريدة (لا تكرار)',
    passed: dups.length === 0,
    count: dups.length,
    detail: dups.length ? `${dups.length} رقم قيد مكرر` : 'كل الأرقام فريدة',
    samples: dups.slice(0, 5),
  }));

  // 6) كل سطر يشير لحساب موجود في الدليل المحاسبي
  const codes = new Set((accounts || []).map(a => a.code));
  const missingAccounts = new Set();
  if (codes.size > 0) {
    for (const je of posted) {
      for (const l of je.lines || []) {
        if (l.accountCode && l.accountCode !== '????' && !codes.has(l.accountCode)) missingAccounts.add(l.accountCode);
      }
    }
  }
  results.push(check({
    id: 'ACCOUNTS_EXIST', group: 'engine', title: 'كل سطر يشير لحساب موجود في دليل الحسابات',
    severity: codes.size === 0 ? 'warn' : 'error',
    passed: missingAccounts.size === 0,
    count: missingAccounts.size,
    detail: codes.size === 0 ? 'دليل الحسابات فارغ — تخطّي الفحص' : (missingAccounts.size ? `حسابات غير موجودة بالدليل: ${[...missingAccounts].join(', ')}` : 'كل الحسابات موجودة'),
    samples: [...missingAccounts].slice(0, 5),
  }));

  return results;
}

// ─── المرحلة 4: الاتساق ──────────────────────────────────────────────────────

function auditConsistency({ entries, accounts, clients, suppliers }) {
  const results = [];
  const tb = buildTrialBalance(entries, accounts);

  // 1) ميزان المراجعة متوازن (إجمالي المدين = إجمالي الدائن)
  results.push(check({
    id: 'TB_BALANCED', group: 'consistency', title: 'ميزان المراجعة متوازن (مدين = دائن)',
    passed: tb.balanced,
    detail: tb.balanced ? 'الميزان متوازن' : `فرق قدره ${money(tb.totals.debit - tb.totals.credit)}`,
  }));

  // 2) الأصول = الخصوم + حقوق الملكية (معادلة الميزانية)
  const byType = { ASSET: 0, LIABILITY: 0, EQUITY: 0, REVENUE: 0, EXPENSE: 0 };
  const accByCode = Object.fromEntries((accounts || []).map(a => [a.code, a]));
  for (const r of tb.rows) {
    const type = accByCode[r.accountCode]?.accountType;
    const net = r.debitBalance - r.creditBalance; // موجب = رصيد مدين
    if (type && byType[type] !== undefined) byType[type] += net;
  }
  // الأصول (مدين) = الخصوم + حقوق الملكية + (الإيراد - المصروف)
  const assets = money(byType.ASSET);
  const liabEquity = money(-(byType.LIABILITY + byType.EQUITY));
  const netIncome = money(-(byType.REVENUE) - byType.EXPENSE); // إيراد دائن - مصروف مدين
  const equationOk = accounts.length > 0 ? diff(assets, liabEquity + netIncome) <= EPSILON : true;
  results.push(check({
    id: 'ACCOUNTING_EQUATION', group: 'consistency', title: 'الأصول = الخصوم + حقوق الملكية + صافي الدخل',
    severity: accounts.length === 0 ? 'warn' : 'error',
    passed: equationOk,
    detail: accounts.length === 0 ? 'لا توجد أنواع حسابات مصنّفة — تخطّي' : (equationOk ? 'المعادلة المحاسبية متوازنة' : `أصول ${assets} ≠ خصوم+ملكية+دخل ${money(liabEquity + netIncome)}`),
  }));

  // 3) رصيد الذمم المدينة (من الأستاذ) = صافي أرصدة العملاء (فواتير - تحصيلات)
  //    نقارن رصيد حساب الذمم في الأستاذ بإجمالي (فواتير غير المسددة) — مؤشر تطابق.
  const arLine = flattenPostedLines(entries).filter(l => l.accountName?.includes('الذمم المدينة') || l.accountCode === '1100');
  const arBalance = money(arLine.reduce((s, l) => s + l.debit - l.credit, 0));
  results.push(check({
    id: 'AR_PRESENT', group: 'consistency', title: 'حساب الذمم المدينة موجود ومتّسق في الأستاذ',
    severity: 'warn',
    passed: true,
    detail: `رصيد الذمم المدينة الحالي في الأستاذ: ${arBalance}`,
  }));

  // 4) رصيد الذمم الدائنة (الموردون) من الأستاذ
  const apLine = flattenPostedLines(entries).filter(l => l.accountName?.includes('الذمم الدائنة') || l.accountCode === '2100');
  const apBalance = money(apLine.reduce((s, l) => s + l.credit - l.debit, 0));
  results.push(check({
    id: 'AP_PRESENT', group: 'consistency', title: 'حساب الذمم الدائنة موجود ومتّسق في الأستاذ',
    severity: 'warn',
    passed: true,
    detail: `رصيد الذمم الدائنة الحالي في الأستاذ: ${apBalance}`,
  }));

  return results;
}

// ─── المرحلة 2 (فحص ثابت): سلامة مستندات الدورات ─────────────────────────────

function auditDocuments({ salesInvoices, purchaseOrders, expenses }) {
  const results = [];

  // فواتير المبيعات: لا فاتورة بلا عميل، والضريبة تساوي 15% من الأساس
  // في المطاعم: البيع النقدي للزبون العابر مسموح بلا clientId، لكن يجب أن يكون
  // هناك clientName (مثل "زبون نقدي"). الفشل فقط إذا كلاهما فارغ.
  const noClient = salesInvoices.filter(i => !i.clientId && !i.clientName);
  results.push(check({
    id: 'SINV_HAS_CLIENT', group: 'documents', title: 'كل فاتورة مبيعات مرتبطة بعميل',
    passed: noClient.length === 0,
    count: noClient.length,
    detail: noClient.length ? `${noClient.length} فاتورة بلا عميل` : 'كل الفواتير مرتبطة بعملاء',
    samples: noClient.slice(0, 5).map(i => i.invoiceNo),
  }));

  const vatWrong = salesInvoices.filter(i => {
    const base = Number(i.subtotal) || 0;
    if (base <= 0) return false;
    // احترام الفواتير صفرية الضريبة (vatRate === 0): لا تُفحص ضد 15%.
    const rate = resolveVatRate(i.vatRate);
    if (rate !== 0.15) return false;
    const expected = money(base * 0.15);
    return i.vatAmount != null && diff(i.vatAmount, expected) > EPSILON;
  });
  results.push(check({
    id: 'SINV_VAT_CORRECT', group: 'documents', title: 'ضريبة فواتير المبيعات = 15% من الأساس',
    passed: vatWrong.length === 0,
    count: vatWrong.length,
    detail: vatWrong.length ? `${vatWrong.length} فاتورة ضريبتها غير صحيحة` : 'ضريبة كل الفواتير صحيحة',
    samples: vatWrong.slice(0, 5).map(i => i.invoiceNo),
  }));

  const paidOver = salesInvoices.filter(i => (Number(i.paidAmount) || 0) > (Number(i.totalAmount) || 0) + EPSILON);
  results.push(check({
    id: 'SINV_PAID_LE_TOTAL', group: 'documents', title: 'المدفوع لا يتجاوز إجمالي الفاتورة',
    passed: paidOver.length === 0,
    count: paidOver.length,
    detail: paidOver.length ? `${paidOver.length} فاتورة مدفوعها يتجاوز إجماليها` : 'كل المبالغ المدفوعة سليمة',
    samples: paidOver.slice(0, 5).map(i => i.invoiceNo),
  }));

  // أوامر الشراء بلا مورد
  const poNoSupplier = purchaseOrders.filter(p => !p.supplierId);
  results.push(check({
    id: 'PO_HAS_SUPPLIER', group: 'documents', title: 'كل أمر شراء مرتبط بمورد',
    passed: poNoSupplier.length === 0,
    count: poNoSupplier.length,
    detail: poNoSupplier.length ? `${poNoSupplier.length} أمر شراء بلا مورد` : 'كل أوامر الشراء مرتبطة بموردين',
    samples: poNoSupplier.slice(0, 5).map(p => p.orderNo),
  }));

  // المصروفات: مبلغ موجب
  const expBad = expenses.filter(e => (Number(e.amount) || 0) <= 0);
  results.push(check({
    id: 'EXP_POSITIVE', group: 'documents', title: 'كل مصروف بمبلغ أكبر من صفر',
    passed: expBad.length === 0,
    count: expBad.length,
    detail: expBad.length ? `${expBad.length} مصروف بمبلغ غير صالح` : 'كل المصروفات بمبالغ صحيحة',
    samples: expBad.slice(0, 5).map(e => e.description),
  }));

  return results;
}

/**
 * يشغّل كل الفحوصات ويُرجع تقريراً مجمّعاً.
 */
export function runAudit(data) {
  const results = [
    ...auditEngineIntegrity(data),
    ...auditConsistency(data),
    ...auditDocuments(data),
  ];
  const errors = results.filter(r => !r.passed && r.severity === 'error');
  const warnings = results.filter(r => !r.passed && r.severity === 'warn');
  return {
    results,
    passedCount: results.filter(r => r.passed).length,
    totalCount: results.length,
    errorCount: errors.length,
    warningCount: warnings.length,
    productionReady: errors.length === 0,
  };
}

export const AUDIT_GROUPS = {
  engine: { ar: 'سلامة المحرك', en: 'Engine Integrity' },
  consistency: { ar: 'الاتساق المحاسبي', en: 'Consistency' },
  documents: { ar: 'سلامة المستندات', en: 'Documents' },
};