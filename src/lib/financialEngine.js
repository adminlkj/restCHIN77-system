/**
 * Financial Engine — مصدر موحّد لكل البيانات المالية من القيود المرحّلة.
 *
 * القاعدة: لا تُقرأ أي بيانات مالية من سجلات العمليات (فواتير، سندات، مصروفات).
 * كل رقم مالي في النظام يُستخرج من قيود اليومية المرحّلة (isPosted=true).
 *
 * هذا يضمن:
 *  - تطابق 100% بين كل الشاشات والتقارير
 *  - ميزان المراجعة = قائمة الدخل = التدفقات النقدية = كشف المشروع
 *  - لا تظهر بيانات بدون قيد مرحّل
 */

/**
 * يبني خريطة الحسابات من دليل الحسابات.
 */
export function buildAccountMap(accounts = []) {
  const m = {};
  for (const a of accounts) {
    m[a.code] = a;
  }
  return m;
}

/**
 * يفلتر القيود المرحّلة فقط.
 */
export function postedEntries(journalEntries = []) {
  return (journalEntries || []).filter(je => je.isPosted);
}

/**
 * يبني قائمة مسطّحة من كل سطور القيود المرحّلة.
 * كل سطر يحمل بيانات القيد الأصلي + بيانات السطر.
 */
export function flattenPostedLines(journalEntries = []) {
  const posted = postedEntries(journalEntries);
  const lines = [];
  for (const je of posted) {
    for (const l of (je.lines || [])) {
      lines.push({
        // من القيد
        entryNo: je.entryNo,
        date: je.date,
        jeDescription: je.description,
        sourceType: je.sourceType || '',
        isPosted: je.isPosted,
        // من السطر
        accountCode: l.accountCode || '',
        accountName: l.accountName || '',
        debit: Number(l.debit) || 0,
        credit: Number(l.credit) || 0,
        description: l.description || '',
        partyType: l.partyType || '',
        partyId: l.partyId || '',
        partyName: l.partyName || '',
        costCenter: l.costCenter || '',
        projectId: l.projectId || '',
      });
    }
  }
  return lines;
}

/**
 * يبني قائمة الدخل من القيود المرحّلة.
 *
 * @param journalEntries  كل القيود
 * @param accountMap      خريطة الحسابات (من buildAccountMap)
 * @param period          { from, to } اختياري
 * @returns { revenue, expenses, payroll, netProfit, revenueLines, expenseLines }
 */
export function buildIncomeStatement(journalEntries = [], accountMap = {}, period = {}) {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (period.from && l.date < period.from) return false;
    if (period.to && l.date > period.to) return false;
    return true;
  });

  const revenueLines = [];
  const expenseLines = [];
  let revenue = 0;
  let expenses = 0;

  for (const l of lines) {
    const acc = accountMap[l.accountCode];
    const type = acc?.accountType || '';
    if (type === 'REVENUE') {
      // الإيراد دائن بطبيعته — credit يزيد الإيراد
      const amount = l.credit - l.debit;
      if (amount !== 0) {
        revenue += amount;
        revenueLines.push({ ...l, amount });
      }
    } else if (type === 'EXPENSE') {
      // المصروف مدين بطبيعته — debit يزيد المصروف
      const amount = l.debit - l.credit;
      if (amount !== 0) {
        expenses += amount;
        expenseLines.push({ ...l, amount });
      }
    }
  }

  // الرواتب المدفوعة = سطور مصروف الرواتب (5210) من القيود المرحّلة
  const payroll = lines
    .filter(l => accountMap[l.accountCode]?.semanticRole === 'EXPENSE_SALARIES')
    .reduce((s, l) => s + (l.debit - l.credit), 0);

  return {
    revenue: +revenue.toFixed(2),
    expenses: +expenses.toFixed(2),
    payroll: +payroll.toFixed(2),
    netProfit: +(revenue - expenses).toFixed(2),
    revenueLines,
    expenseLines,
  };
}

/**
 * يبني تقرير ضريبة القيمة المضافة من القيود المرحّلة.
 *
 * VAT محصّل = دائن في حساب ضريبة القيمة المضافة المحصلة (VAT_PAYABLE)
 * VAT مدفوع = مدين في حساب ضريبة القيمة المضافة المدفوعة (VAT_RECEIVABLE)
 * صافي = محصّل − مدفوع
 */
export function buildVATReport(journalEntries = [], accountMap = {}, period = {}) {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (period.from && l.date < period.from) return false;
    if (period.to && l.date > period.to) return false;
    return true;
  });

  let vatCollected = 0;
  let vatPaid = 0;
  const collectedLines = [];
  const paidLines = [];

  for (const l of lines) {
    const acc = accountMap[l.accountCode];
    if (!acc) continue;
    if (acc.semanticRole === 'VAT_PAYABLE') {
      // ضريبة محصّلة — دائن بطبيعتها. القيد العكسي (إلغاء فاتورة) يُحسب
      // كقيمة سالبة فتُخصم من المحصّل، لذلك لا نتجاهل السالب.
      const amount = l.credit - l.debit;
      if (amount !== 0) {
        vatCollected += amount;
        collectedLines.push({ ...l, amount });
      }
    } else if (acc.semanticRole === 'VAT_RECEIVABLE') {
      // ضريبة مدفوعة — مدين بطبيعتها. القيد العكسي يُخصم من المدفوع.
      const amount = l.debit - l.credit;
      if (amount !== 0) {
        vatPaid += amount;
        paidLines.push({ ...l, amount });
      }
    }
  }

  return {
    vatCollected: +vatCollected.toFixed(2),
    vatPaid: +vatPaid.toFixed(2),
    vatNet: +(vatCollected - vatPaid).toFixed(2),
    collectedLines,
    paidLines,
  };
}

/**
 * يبني التدفقات النقدية من القيود المرحّلة.
 *
 * النقد أصل مدين بطبيعته:
 *   تدفق داخل (استلام نقد) = مدين في حسابات النقد/البنك/العهد (debit > 0)
 *   تدفق خارج (صرف نقد)   = دائن في حسابات النقد/البنك/العهد (credit > 0)
 *
 * يشمل حسابات: CASH, BANK, CUSTODY، وحساب نقدية بطاقات البيع (POS)
 * الذي قد لا يحمل دوراً دلالياً صريحاً.
 */
export function buildCashFlow(journalEntries = [], accountMap = {}, period = {}) {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (period.from && l.date < period.from) return false;
    if (period.to && l.date > period.to) return false;
    return true;
  });

  let inflow = 0;
  let outflow = 0;
  const inflowLines = [];
  const outflowLines = [];

  for (const l of lines) {
    const acc = accountMap[l.accountCode];
    if (!acc) continue;
    // تحديد ما إذا كان الحساب نقدياً: بالدور الدلالي أو بموقعه تحت مجموعة
    // النقدية (111x) أو بدلالة اسمه (بطاقات/POS/card) — لالتقاط حساب نقدية
    // بطاقات البيع (1114) الذي قد لا يحمل دوراً دلالياً.
    const isCash = acc.semanticRole === 'CASH'
      || acc.semanticRole === 'BANK'
      || acc.semanticRole === 'CUSTODY'
      || /^111\d$/.test(acc.code || '');
    if (isCash) {
      // النقد أصل مدين: القبض = مدين (inflow)، الصرف = دائن (outflow).
      if (l.debit > 0) {
        inflow += l.debit;
        inflowLines.push(l);
      }
      if (l.credit > 0) {
        outflow += l.credit;
        outflowLines.push(l);
      }
    }
  }

  return {
    inflow: +inflow.toFixed(2),
    outflow: +outflow.toFixed(2),
    net: +(inflow - outflow).toFixed(2),
    inflowLines,
    outflowLines,
  };
}

/**
 * يبني الميزانية من القيود المرحّلة (تراكمية حتى تاريخ).
 *
 * الأصول = مدين − دائن لكل حساب أصول
 * الخصوم = دائن − مدين لكل حساب خصوم
 * حقوق الملكية = دائن − مدين لكل حساب حقوق ملكية + صافي الربح
 */
export function buildBalanceSheet(journalEntries = [], accountMap = {}, asOfDate = '') {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (asOfDate && l.date > asOfDate) return false;
    return true;
  });

  const accountBalances = {};
  for (const l of lines) {
    if (!accountBalances[l.accountCode]) {
      accountBalances[l.accountCode] = { code: l.accountCode, name: l.accountName, debit: 0, credit: 0 };
    }
    accountBalances[l.accountCode].debit += l.debit;
    accountBalances[l.accountCode].credit += l.credit;
  }

  const assets = [];
  const liabilities = [];
  const equity = [];
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalEquity = 0;

  for (const bal of Object.values(accountBalances)) {
    const acc = accountMap[bal.code] || {};
    const type = acc.accountType || 'ASSET';
    const amount = type === 'ASSET' ? bal.debit - bal.credit : bal.credit - bal.debit;
    const row = { ...bal, type, amount: +amount.toFixed(2) };
    if (type === 'ASSET') { assets.push(row); totalAssets += amount; }
    else if (type === 'LIABILITY') { liabilities.push(row); totalLiabilities += amount; }
    else if (type === 'EQUITY') { equity.push(row); totalEquity += amount; }
  }

  // صافي الربح للفترة يُضاف لحقوق الملكية
  const income = buildIncomeStatement(journalEntries, accountMap, { to: asOfDate });
  totalEquity += income.netProfit;

  return {
    assets, liabilities, equity,
    totalAssets: +totalAssets.toFixed(2),
    totalLiabilities: +totalLiabilities.toFixed(2),
    totalEquity: +totalEquity.toFixed(2),
    netProfit: income.netProfit,
    isBalanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.01,
  };
}

/**
 * يبني تقرير المشاريع من القيود المرحّلة.
 *
 * لكل مشروع: إيراد + تكلفة + ربح من سطور القيود المرحّلة.
 * يعتمد على sourceType و description لربط السطر بالمشروع.
 */
export function buildProjectReport(journalEntries = [], accountMap = {}, projects = [], period = {}) {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (period.from && l.date < period.from) return false;
    if (period.to && l.date > period.to) return false;
    return true;
  });

  // تجميع حسب المشروع — نستخدم description للعثور على اسم المشروع
  const byProject = {};
  for (const p of projects) {
    byProject[p.id] = {
      projectId: p.id,
      name: p.name,
      code: p.code,
      status: p.status,
      revenue: 0,
      cost: 0,
    };
  }

  // حساب الإيرادات: دائن في حسابات الإيراد + مدين في ذمم العملاء
  // حساب التكاليف: مدين في حسابات المصروفات + دائن في ذمم الموردين
  for (const l of lines) {
    const acc = accountMap[l.accountCode] || {};
    const type = acc.accountType || '';
    // محاولة ربط السطر بمشروع عبر sourceType أو description
    // الإيرادات والمصروفات تُربط بالمشروع عبر اسم المشروع في الوصف
    for (const p of projects) {
      const pName = p.name || '';
      if (pName && (l.description?.includes(pName) || l.jeDescription?.includes(pName))) {
        if (type === 'REVENUE') {
          byProject[p.id].revenue += (l.credit - l.debit);
        } else if (type === 'EXPENSE') {
          byProject[p.id].cost += (l.debit - l.credit);
        }
        break;
      }
    }
  }

  const rows = Object.values(byProject).map(r => {
    const profit = r.revenue - r.cost;
    return {
      ...r,
      revenue: +r.revenue.toFixed(2),
      cost: +r.cost.toFixed(2),
      profit: +profit.toFixed(2),
      marginPercent: r.revenue > 0 ? +((profit / r.revenue) * 100).toFixed(1) : 0,
    };
  }).filter(r => r.revenue !== 0 || r.cost !== 0);

  return rows;
}

/**
 * يحسب إجمالي الإيرادات من القيود المرحّلة.
 * يستخدم في Dashboard و SalesInvoices وغيرها.
 */
export function totalRevenueFromJournal(journalEntries = [], accountMap = {}, period = {}) {
  return buildIncomeStatement(journalEntries, accountMap, period).revenue;
}

/**
 * يحسب إجمالي المصروفات من القيود المرحّلة.
 */
export function totalExpensesFromJournal(journalEntries = [], accountMap = {}, period = {}) {
  return buildIncomeStatement(journalEntries, accountMap, period).expenses;
}

/**
 * يحسب رصيد ذمم العملاء من القيود المرحّلة.
 * رصيد ذمم العملاء = مدين − دائن في حساب RECEIVABLES
 */
export function receivablesBalance(journalEntries = [], accountMap = {}, asOfDate = '') {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (asOfDate && l.date > asOfDate) return false;
    return true;
  });
  let debit = 0, credit = 0;
  for (const l of lines) {
    const acc = accountMap[l.accountCode];
    if (acc?.semanticRole === 'RECEIVABLES') {
      debit += l.debit;
      credit += l.credit;
    }
  }
  return +(debit - credit).toFixed(2);
}

/**
 * يحسب رصيد ذمم الموردين من القيود المرحّلة.
 * رصيد ذمم الموردين = دائن − مدين في حساب PAYABLES
 */
export function payablesBalance(journalEntries = [], accountMap = {}, asOfDate = '') {
  const lines = flattenPostedLines(journalEntries).filter(l => {
    if (asOfDate && l.date > asOfDate) return false;
    return true;
  });
  let debit = 0, credit = 0;
  for (const l of lines) {
    const acc = accountMap[l.accountCode];
    if (acc?.semanticRole === 'PAYABLES') {
      debit += l.debit;
      credit += l.credit;
    }
  }
  return +(credit - debit).toFixed(2);
}

/**
 * يحسب ربحية مشروع من القيود المرحّلة فقط.
 *
 * القاعدة: المصدر الوحيد للحقيقة المالية هو قيود اليومية المرحّلة (isPosted=true).
 * لا نقرأ من سجلات الفواتير أو السندات أو المصروفات مباشرةً.
 *
 * الربط بالمشروع يتم عبر:
 *   1) line.costCenter === projectName  (القناة الرئيسية)
 *   2) line.projectId === projectId     (إن وُجد)
 *   3) je.description يحتوي projectName  (احتياطي)
 *
 * التصنيف:
 *   - إيراد: حسابات REVENUE (credit − debit) + ذمم عملاء مدينة (debit)
 *   - تكلفة: حسابات EXPENSE (debit − credit) + ذمم مورد/مقاولي باطن دائنة (credit)
 *
 * @returns { revenue, cost, profit, marginPercent, lineCount }
 */
export function computeProjectProfitabilityFromJE(journalEntries = [], accounts = [], projectName = '', projectId = '') {
  if (!projectName && !projectId) return { revenue: 0, cost: 0, profit: 0, marginPercent: 0, lineCount: 0 };

  // بناء خريطة الحسابات
  const accountMap = {};
  (accounts || []).forEach(a => {
    accountMap[a.code] = a;
  });

  const lines = flattenPostedLines(journalEntries).filter(l => {
    // مطابقة المشروع
    const matchesProject =
      (projectName && l.costCenter === projectName) ||
      (projectId && l.projectId === projectId) ||
      (projectName && (l.description || '').includes(projectName)) ||
      (projectName && (l.jeDescription || '').includes(projectName));
    return matchesProject;
  });

  let revenue = 0;
  let cost = 0;
  for (const l of lines) {
    const acc = accountMap[l.accountCode] || {};
    const type = acc.accountType || '';
    const semRole = acc.semanticRole || '';

    if (type === 'REVENUE') {
      // حسابات الإيراد بطبيعتها دائنة
      revenue += (l.credit - l.debit);
    } else if (type === 'EXPENSE') {
      // حسابات المصروف بطبيعتها مدينة
      cost += (l.debit - l.credit);
    } else if (semRole === 'RECEIVABLES') {
      // ذمم عملاء: مدين = فاتورة مبيعات (إيراد مستحق)
      if (l.debit > 0) revenue += l.debit;
      // دائن = تحصيل (لا يُضاف للإيراد)
    } else if (semRole === 'PAYABLES' || semRole === 'SUB_PAYABLES') {
      // ذمم مورد/مقاول باطن: دائن = فاتورة (تكلفة)
      if (l.credit > 0) cost += l.credit;
      // مدين = سداد (لا يُضاف للتكلفة)
    }
    // COGS / Inventory: لا نُضيفها هنا (تُعالج في كشوفات منفصلة)
  }

  const profit = revenue - cost;
  const marginPercent = revenue > 0 ? +((profit / revenue) * 100).toFixed(1) : 0;

  return {
    revenue: +revenue.toFixed(2),
    cost: +cost.toFixed(2),
    profit: +profit.toFixed(2),
    marginPercent,
    lineCount: lines.length,
  };
}
