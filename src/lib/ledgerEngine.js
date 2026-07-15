/**
 * Ledger Engine — محرك الأستاذ والتقارير المالية
 *
 * يبني ميزان المراجعة ودفتر الأستاذ من القيود المُرحّلة فقط (isPosted=true).
 * المصدر الموحّد لأي تقرير رصيد حساب في النظام.
 */

/**
 * يستخرج كل سطور القيود المرحّلة مسطّحة مع بيانات القيد.
 */
export function flattenPostedLines(entries) {
  const rows = [];
  for (const je of entries) {
    if (!je.isPosted) continue;
    for (const line of je.lines || []) {
      rows.push({
        entryNo: je.entryNo,
        date: je.date,
        entryDescription: je.description,
        sourceType: je.sourceType || '',
        accountCode: line.accountCode,
        accountName: line.accountName,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
        description: line.description,
        costCenter: line.costCenter || '',
        projectId: line.projectId || '',
        partyType: line.partyType || '',
        partyId: line.partyId || '',
        partyName: line.partyName || '',
      });
    }
  }
  return rows;
}

/**
 * ميزان المراجعة: مجاميع مدين ودائن لكل حساب + الرصيد الصافي.
 * accounts (اختياري) لإثراء الأسماء والأنواع من الدليل المحاسبي.
 * فترة اختيارية { from, to } لتصفية التواريخ.
 */
export function buildTrialBalance(entries, accounts = [], period = {}) {
  const accByCode = Object.fromEntries((accounts || []).map(a => [a.code, a]));
  const map = {};
  for (const r of flattenPostedLines(entries)) {
    if (period.from && r.date < period.from) continue;
    if (period.to && r.date > period.to) continue;
    const key = r.accountCode || '—';
    if (!map[key]) {
      const acc = accByCode[key];
      map[key] = {
        accountCode: key,
        accountName: acc?.name || r.accountName || key,
        accountType: acc?.accountType || null,
        totalDebit: 0,
        totalCredit: 0,
      };
    }
    map[key].totalDebit += r.debit;
    map[key].totalCredit += r.credit;
  }
  const rows = Object.values(map).map(a => {
    const net = a.totalDebit - a.totalCredit;
    return {
      ...a,
      totalDebit: +a.totalDebit.toFixed(2),
      totalCredit: +a.totalCredit.toFixed(2),
      debitBalance: net > 0 ? +net.toFixed(2) : 0,
      creditBalance: net < 0 ? +Math.abs(net).toFixed(2) : 0,
    };
  }).sort((a, b) => (a.accountCode > b.accountCode ? 1 : -1));

  const totals = rows.reduce((s, r) => ({
    debit: s.debit + r.totalDebit,
    credit: s.credit + r.totalCredit,
    debitBal: s.debitBal + r.debitBalance,
    creditBal: s.creditBal + r.creditBalance,
  }), { debit: 0, credit: 0, debitBal: 0, creditBal: 0 });

  return {
    rows,
    totals: {
      debit: +totals.debit.toFixed(2),
      credit: +totals.credit.toFixed(2),
      debitBal: +totals.debitBal.toFixed(2),
      creditBal: +totals.creditBal.toFixed(2),
    },
    balanced: Math.abs(totals.debit - totals.credit) < 0.01,
  };
}

/**
 * دفتر أستاذ لحساب واحد: الحركات مرتبة بالتاريخ مع رصيد جارٍ.
 */
export function buildAccountLedger(entries, accountCode, period = {}) {
  const allRows = flattenPostedLines(entries)
    .filter(r => r.accountCode === accountCode)
    .sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : 0));

  const openingBalance = +allRows
    .filter(r => period.from && r.date < period.from)
    .reduce((s, r) => s + r.debit - r.credit, 0)
    .toFixed(2);

  const rows = allRows
    .filter(r => (!period.from || r.date >= period.from) && (!period.to || r.date <= period.to));

  let running = openingBalance;
  const movements = rows.map(r => {
    running += r.debit - r.credit;
    return { ...r, balance: +running.toFixed(2) };
  });
  const totalDebit = +rows.reduce((s, r) => s + r.debit, 0).toFixed(2);
  const totalCredit = +rows.reduce((s, r) => s + r.credit, 0).toFixed(2);
  return { movements, totalDebit, totalCredit, openingBalance, closingBalance: +running.toFixed(2) };
}

/**
 * تحليل مراكز التكلفة: يجمّع الإيرادات والتكاليف لكل مركز تكلفة (مشروع).
 *
 * التكاليف = المصروفات المرتبطة بالمشروع + فواتير مقاولي الباطن للمشروع.
 * الإيرادات = مستخلصات/فواتير العملاء للمشروع (بالمبلغ قبل الضريبة).
 * الهامش = الإيراد − التكلفة، ونسبة الهامش منسوبة إلى الإيراد.
 *
 * period اختياري { from, to } لتصفية حسب تاريخ المستند.
 */
/**
 * تحليل مراكز التكلفة — من القيود المرحّلة فقط.
 *
 * القاعدة: المصدر الوحيد للحقيقة المالية هو قيود اليومية المرحّلة (isPosted=true).
 * لا نقرأ من سجلات المصروفات/الفواتير/الموردين مباشرةً.
 *
 * الربط بالمشروع يتم عبر:
 *   1) line.costCenter === project.name (القناة الرئيسية)
 *   2) line.projectId === project.id
 *
 * التصنيف:
 *   - إيراد: حسابات REVENUE (credit − debit)
 *   - تكلفة: حسابات EXPENSE (debit − credit)
 *   - ذمم عملاء مدينة: تُحسب إيراداً مستحقاً (RECEIVABLES.debit)
 *   - ذمم مورد/مقاول باطن دائنة: تُحسب تكلفة (PAYABLES/SUB_PAYABLES.credit)
 *
 * @param {{ projects?: any[], journalEntries?: any[], chartAccounts?: any[] }} data
 * @param {{ from?: string, to?: string }} period
 */
export function buildCostCenterAnalysis({ projects = [], journalEntries = [], chartAccounts = [] }, period = {}) {
  const inPeriod = (d) => (!period.from || (d && d >= period.from)) && (!period.to || (d && d <= period.to));

  // بناء خريطة الحسابات
  const accountMap = {};
  (chartAccounts || []).forEach(a => { accountMap[a.code] = a; });

  // تهيئة المراكز من قائمة المشاريع
  const centers = {};
  const ensure = (project, fallbackName) => {
    const key = project?.id || `__${fallbackName || 'unassigned'}__`;
    if (!centers[key]) {
      centers[key] = {
        projectId: project?.id || null,
        code: project?.costCenter || project?.code || (project?.id ? '' : '—'),
        name: project?.name || fallbackName || '',
        cost: 0,
        revenue: 0,
        expenseCost: 0,
        subCost: 0,
        supplierCost: 0,
        _project: project,
      };
    }
    return centers[key];
  };

  // تهيئة مركز لكل مشروع معروف
  for (const p of projects) {
    ensure(p, p.name);
  }
  // مركز "غير مخصّص" للحركات بلا مركز تكلفة
  const unassignedProject = { id: null, name: 'غير مخصّص', code: '—' };

  // المرور على سطور القيود المرحّلة في الفترة
  const lines = flattenPostedLines(journalEntries).filter(l => inPeriod(l.date));
  for (const l of lines) {
    // تحديد المشروع المرتبط بالسطر
    let project = null;
    // 1) costCenter === project.name
    if (l.costCenter) {
      project = projects.find(p => p.name === l.costCenter || p.costCenter === l.costCenter);
    }
    // 2) projectId === project.id
    if (!project && l.projectId) {
      project = projects.find(p => p.id === l.projectId);
    }
    const c = ensure(project, l.costCenter || (project ? '' : 'غير مخصّص'));
    if (!project && !l.costCenter) {
      // ضمّ لمركز "غير مخصّص"
      c.name = c.name || 'غير مخصّص';
    }

    const acc = accountMap[l.accountCode] || {};
    const type = acc.accountType || '';
    const semRole = acc.semanticRole || '';
    let lineRevenue = 0;
    let lineCost = 0;
    let lineExpenseCost = 0;
    let lineSubCost = 0;
    let lineSupplierCost = 0;

    if (type === 'REVENUE') {
      lineRevenue = (l.credit - l.debit);
    } else if (type === 'EXPENSE') {
      lineCost = (l.debit - l.credit);
      lineExpenseCost = lineCost;
    } else if (semRole === 'RECEIVABLES') {
      // ذمم عملاء: مدين = فاتورة مبيعات (إيراد مستحق)
      if (l.debit > 0) lineRevenue += l.debit;
    } else if (semRole === 'PAYABLES') {
      // ذمم مورد: دائن = فاتورة (تكلفة)
      if (l.credit > 0) {
        lineCost += l.credit;
        lineSupplierCost += l.credit;
      }
    } else if (semRole === 'SUB_PAYABLES') {
      // ذمم مقاول باطن: دائن = فاتورة (تكلفة)
      if (l.credit > 0) {
        lineCost += l.credit;
        lineSubCost += l.credit;
      }
    }

    c.revenue += lineRevenue;
    c.cost += lineCost;
    c.expenseCost += lineExpenseCost;
    c.subCost += lineSubCost;
    c.supplierCost += lineSupplierCost;
  }

  const rows = Object.values(centers)
    .map((c) => {
      const margin = c.revenue - c.cost;
      return {
        ...c,
        cost: +c.cost.toFixed(2),
        revenue: +c.revenue.toFixed(2),
        expenseCost: +c.expenseCost.toFixed(2),
        subCost: +c.subCost.toFixed(2),
        supplierCost: +c.supplierCost.toFixed(2),
        margin: +margin.toFixed(2),
        marginPercent: c.revenue > 0 ? +((margin / c.revenue) * 100).toFixed(1) : 0,
      };
    })
    .filter((c) => c.cost !== 0 || c.revenue !== 0)
    .sort((a, b) => b.cost - a.cost);

  const totals = rows.reduce(
    (s, r) => ({
      cost: s.cost + r.cost,
      revenue: s.revenue + r.revenue,
      margin: s.margin + r.margin,
    }),
    { cost: 0, revenue: 0, margin: 0 }
  );

  return {
    rows,
    totals: {
      cost: +totals.cost.toFixed(2),
      revenue: +totals.revenue.toFixed(2),
      margin: +totals.margin.toFixed(2),
    },
  };
}