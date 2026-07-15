import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

// ─── دورة الأصول الثابتة والإهلاك (IAS 16) ─────────────────────────────────────
// عمليتان:
//   • capitalize — رسملة الأصل: من ح/ الأصل الثابت (مدين) إلى ح/ النقدية/الدائن (دائن).
//   • depreciate — قسط إهلاك دوري بالقسط الثابت: من ح/ مصروف الإهلاك (مدين)
//     إلى ح/ مجمع الإهلاك (دائن). مجمع الإهلاك حساب أصل عكسي (contra-asset) طبيعته دائنة.

const num = (v) => (typeof v === 'number' ? v : parseFloat(v) || 0);

// خرائط الحسابات حسب فئة الأصل — تُقرأ من الدليل بالدور الدلالي، وإلا الرقم القياسي.
const CATEGORY_ASSET_ROLE = {
  EQUIPMENT: 'FIXED_EQUIPMENT',
  VEHICLE: 'FIXED_EQUIPMENT',
  FURNITURE: 'FIXED_EQUIPMENT',
  BUILDING: 'FIXED_EQUIPMENT',
  OTHER: 'FIXED_EQUIPMENT',
};
const FALLBACK = {
  FIXED_EQUIPMENT: { code: '1210', name: 'المعدات والآلات الثقيلة' },
  ACCUM_DEPRECIATION: { code: '1290', name: 'مجمع الإهلاك' },
  EXPENSE_DEPRECIATION: { code: '5260', name: 'مصروف الإهلاك' },
};

function resolveAccount(role, accounts) {
  const found = (accounts || []).find((a) => a.semanticRole === role && a.isActive !== false);
  if (found) return { code: found.code, name: found.name };
  return FALLBACK[role] || { code: '????', name: `دور غير معرّف: ${role}` };
}

// يرفض الترحيل في سنة مالية مغلقة/مقفلة.
async function assertPeriodOpen(base44, date) {
  if (!date) return;
  const years = await base44.asServiceRole.entities.FiscalYear.filter({});
  const locking = (years || []).find((y) =>
    (y.status === 'CLOSED' || y.status === 'LOCKED') &&
    y.startDate && y.endDate && date >= y.startDate && date <= y.endDate
  );
  if (locking) throw new Error(`لا يمكن الترحيل في فترة مقفلة — السنة المالية "${locking.name}" تشمل ${date}`);
}

// يرحّل قيداً متوازناً ذرّياً ويمنع التكرار بنفس رقم القيد.
async function postJE(base44, je) {
  const sumDebit = +je.lines.reduce((s, l) => s + num(l.debit), 0).toFixed(2);
  const sumCredit = +je.lines.reduce((s, l) => s + num(l.credit), 0).toFixed(2);
  if (Math.abs(sumDebit - sumCredit) >= 0.01) throw new Error(`القيد ${je.entryNo} غير متوازن`);
  if (je.lines.find((l) => !l.accountCode || l.accountCode === '????')) throw new Error(`القيد ${je.entryNo} يحتوي حساباً غير معرّف`);
  await assertPeriodOpen(base44, je.date);
  const existing = await base44.asServiceRole.entities.JournalEntry.filter({ entryNo: je.entryNo });
  if (existing && existing.length > 0) return existing[0];
  return await base44.asServiceRole.entities.JournalEntry.create({ ...je, isPosted: true, totalDebit: sumDebit, totalCredit: sumCredit });
}

// القسط الشهري بالقسط الثابت = (التكلفة − القيمة المتبقية) ÷ العمر بالأشهر.
function monthlyDepreciation(asset) {
  const base = num(asset.acquisitionCost) - num(asset.salvageValue);
  const months = num(asset.usefulLifeMonths) || 1;
  return +(base / months).toFixed(2);
}

// المتبقي القابل للإهلاك = (التكلفة − القيمة المتبقية) − مجمع الإهلاك.
function remainingDepreciable(asset) {
  const depreciableBase = num(asset.acquisitionCost) - num(asset.salvageValue);
  return +(depreciableBase - num(asset.accumulatedDepreciation)).toFixed(2);
}

// رسملة الأصل: يرحّل قيد الاقتناء (الأصل مدين / التمويل دائن) ويعلّم الأصل مرسملاً.
async function capitalizeAsset(base44, id) {
  const asset = await base44.asServiceRole.entities.FixedAsset.get(id);
  if (!asset) throw new Error('الأصل غير موجود');
  if (asset.capitalized) throw new Error('الأصل مرسمل بالفعل');
  if (num(asset.acquisitionCost) <= 0) throw new Error('تكلفة الاقتناء يجب أن تكون أكبر من صفر');

  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
  const assetAcc = asset.acquisitionAccountCode
    ? { code: asset.acquisitionAccountCode, name: asset.name }
    : resolveAccount(CATEGORY_ASSET_ROLE[asset.category] || 'FIXED_EQUIPMENT', accounts);
  const payAcc = asset.acquisitionPaymentCode
    ? { code: asset.acquisitionPaymentCode, name: 'تمويل اقتناء الأصل' }
    : resolveAccount('BANK', accounts);
  const cost = +num(asset.acquisitionCost).toFixed(2);

  await postJE(base44, {
    entryNo: `JE-FA-CAP-${asset.code}`, date: asset.acquisitionDate,
    description: `رسملة أصل ثابت ${asset.code} — ${asset.name}`, sourceType: 'FixedAsset',
    lines: [
      { accountCode: assetAcc.code, accountName: assetAcc.name, debit: cost, credit: 0, description: `اقتناء ${asset.name}` },
      { accountCode: payAcc.code, accountName: payAcc.name, debit: 0, credit: cost, description: 'تمويل الاقتناء' },
    ],
  });

  return await base44.asServiceRole.entities.FixedAsset.update(id, { capitalized: true, status: 'ACTIVE' });
}

// قسط إهلاك لشهر محدّد (YYYY-MM). لا يتجاوز المتبقي القابل للإهلاك، ويمنع تكرار نفس الشهر.
async function depreciateAsset(base44, id, period) {
  const asset = await base44.asServiceRole.entities.FixedAsset.get(id);
  if (!asset) throw new Error('الأصل غير موجود');
  if (!asset.capitalized) throw new Error('يجب رسملة الأصل أولاً قبل احتساب الإهلاك');
  if (asset.status !== 'ACTIVE') throw new Error('الأصل غير نشط (مُهلك بالكامل أو مستبعَد)');

  // تاريخ آخر يوم في الشهر المطلوب.
  const [y, m] = (period || '').split('-').map((x) => parseInt(x, 10));
  if (!y || !m) throw new Error('صيغة الشهر يجب أن تكون YYYY-MM');
  const lastDay = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  if (asset.lastDepreciationDate && asset.lastDepreciationDate >= lastDay) {
    throw new Error('تم احتساب إهلاك هذا الشهر أو شهر لاحق مسبقاً');
  }

  const remaining = remainingDepreciable(asset);
  if (remaining <= 0.01) throw new Error('الأصل مُهلك بالكامل — لا يوجد رصيد قابل للإهلاك');
  const amount = Math.min(monthlyDepreciation(asset), remaining);
  if (amount <= 0) throw new Error('قسط الإهلاك صفر');

  const accounts = await base44.asServiceRole.entities.ChartAccount.list('code', 1000);
  const expenseAcc = resolveAccount('EXPENSE_DEPRECIATION', accounts);
  const accumAcc = resolveAccount('ACCUM_DEPRECIATION', accounts);

  await postJE(base44, {
    entryNo: `JE-FA-DEP-${asset.code}-${period}`, date: lastDay,
    description: `إهلاك ${asset.name} عن ${period}`, sourceType: 'Depreciation',
    lines: [
      { accountCode: expenseAcc.code, accountName: expenseAcc.name, debit: amount, credit: 0, description: `مصروف إهلاك ${asset.name}` },
      { accountCode: accumAcc.code, accountName: accumAcc.name, debit: 0, credit: amount, description: `مجمع إهلاك ${asset.name}` },
    ],
  });

  const newAccum = +(num(asset.accumulatedDepreciation) + amount).toFixed(2);
  const fullyDepreciated = remaining - amount <= 0.01;
  return await base44.asServiceRole.entities.FixedAsset.update(id, {
    accumulatedDepreciation: newAccum,
    lastDepreciationDate: lastDay,
    status: fullyDepreciated ? 'FULLY_DEPRECIATED' : 'ACTIVE',
  });
}

// يُهلك كل الأصول النشطة المرسملة لشهر محدّد — للتشغيل الشهري الجماعي.
async function depreciateAll(base44, period) {
  const assets = await base44.asServiceRole.entities.FixedAsset.filter({ status: 'ACTIVE', capitalized: true });
  const results = [];
  for (const a of assets || []) {
    try {
      await depreciateAsset(base44, a.id, period);
      results.push({ code: a.code, status: 'OK' });
    } catch (e) {
      results.push({ code: a.code, status: 'SKIP', reason: e?.message });
    }
  }
  return { period, count: results.length, results };
}

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'غير مصرّح' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'صلاحية المدير مطلوبة' }, { status: 403 });

    const body = await req.json();
    const { mode, id, period } = body || {};

    let record;
    if (mode === 'capitalize') record = await capitalizeAsset(base44, id);
    else if (mode === 'depreciate') record = await depreciateAsset(base44, id, period);
    else if (mode === 'depreciateAll') record = await depreciateAll(base44, period);
    else return Response.json({ error: `وضع غير معروف: ${mode}` }, { status: 400 });

    return Response.json({ success: true, record });
  } catch (error) {
    return Response.json({ success: false, error: error?.message || 'فشل تنفيذ العملية' }, { status: 400 });
  }
});