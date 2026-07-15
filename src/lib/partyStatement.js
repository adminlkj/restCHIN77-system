/**
 * Party Statement Engine — محرك كشوفات حسابات العملاء والموردين
 *
 * المصدر الوحيد للحقيقة: قيود اليومية المُرحّلة فقط (isPosted=true).
 * لا يقرأ من الفواتير أو سندات القبض/الصرف مباشرةً — كل حركة كشف مأخوذة من
 * سطر قيد مُرحّل يخص حساب الذمم (العملاء أو الموردين) ومربوط بالطرف المحدّد.
 *
 * الربط بالطرف يتم عبر حقول السطر partyType/partyId التي يكتبها محرك الترحيل.
 * للقيود القديمة (قبل إضافة هذه الحقول) نستعين بمطابقة الاسم في وصف السطر/القيد.
 */

import { ACCOUNTS } from './businessEngine.js';

// أدوار حسابات الذمم لكل نوع طرف — يُطابق الشجرة المحاسبية القياسية.
const AR_ROLE = 'RECEIVABLES';   // ذمم العملاء (مدين بطبيعته)
const AP_ROLE = 'PAYABLES';      // ذمم الموردين (دائن بطبيعته)

/**
 * يحدّد كود حساب الذمم الخاص بنوع الطرف من الدليل المحاسبي (SSOT) أو الافتراضي.
 * الأكواد الافتراضية مأخوذة من businessEngine.ACCOUNTS لضمان التوافق التام.
 */
function receivableAccountCode(accounts, partyType) {
  const role = partyType === 'SUPPLIER' ? AP_ROLE : AR_ROLE;
  const fallback = partyType === 'SUPPLIER' ? ACCOUNTS.PAYABLES.code : ACCOUNTS.RECEIVABLES.code;
  const acc = (accounts || []).find(a => a.semanticRole === role && a.isActive !== false);
  return acc?.code || fallback;
}

// تطبيع نص للمطابقة النصّية الاحتياطية للقيود القديمة.
function norm(s) {
  return String(s || '').trim().toLowerCase();
}

/**
 * يستخرج حركات كشف حساب طرف واحد (عميل/مورد) من القيود المرحّلة.
 *
 * @param entries   كل قيود اليومية (تُصفّى داخلياً على isPosted فقط)
 * @param accounts  الدليل المحاسبي (لحلّ كود حساب الذمم)
 * @param party     { id, name, type: 'CLIENT' | 'SUPPLIER' }
 * @param period    { from, to } اختياري
 *
 * لكل حركة: من الطرف المدين (debit) والدائن (credit) على حساب الذمم فقط،
 * ورصيد جارٍ. للعملاء الرصيد المدين = مستحق علينا تحصيله؛ للموردين الرصيد
 * الدائن = مستحق علينا سداده.
 */
export function buildPartyStatement(entries, accounts, party, period = {}) {
  const arCode = receivableAccountCode(accounts, party.type);
  const nameKey = norm(party.name);
  const movements = [];

  for (const je of entries) {
    if (!je.isPosted) continue;
    if (period.from && je.date < period.from) continue;
    if (period.to && je.date > period.to) continue;

    for (const line of je.lines || []) {
      if (line.accountCode !== arCode) continue;

      // مطابقة الطرف: أولاً بالمعرّف الصريح، وإلا بمطابقة الاسم نصّياً (قيود قديمة).
      let belongs = false;
      if (line.partyId) {
        belongs = line.partyId === party.id;
      } else if (nameKey) {
        const text = `${norm(line.partyName)} ${norm(line.description)} ${norm(je.description)}`;
        belongs = text.includes(nameKey);
      }
      if (!belongs) continue;

      movements.push({
        entryNo: je.entryNo,
        date: je.date,
        sourceType: je.sourceType,
        description: line.description || je.description,
        debit: Number(line.debit) || 0,
        credit: Number(line.credit) || 0,
      });
    }
  }

  movements.sort((a, b) => (a.date > b.date ? 1 : a.date < b.date ? -1 : (a.entryNo > b.entryNo ? 1 : -1)));

  let running = 0;
  const rows = movements.map(m => {
    running += m.debit - m.credit;
    return { ...m, balance: +running.toFixed(2) };
  });

  const totalDebit = +rows.reduce((s, r) => s + r.debit, 0).toFixed(2);
  const totalCredit = +rows.reduce((s, r) => s + r.credit, 0).toFixed(2);
  const net = +(totalDebit - totalCredit).toFixed(2);

  // للعميل: net موجب = مستحق علينا تحصيله. للمورد: net سالب (رصيد دائن) = مستحق علينا سداده.
  const outstanding = party.type === 'SUPPLIER' ? +Math.abs(Math.min(net, 0)).toFixed(2) : +Math.max(net, 0).toFixed(2);

  return { rows, totalDebit, totalCredit, net, outstanding };
}

/**
 * ملخّص أرصدة كل الأطراف من نوع واحد — يبني صفّاً لكل طرف مع إجمالياته.
 * يُستخدم في جدول متابعة الدفعات. يعتمد كلياً على القيود المرحّلة.
 *
 * @param parties قائمة العملاء أو الموردين
 * @param type    'CLIENT' | 'SUPPLIER'
 */
export function buildPartyBalances(entries, accounts, parties, type, period = {}) {
  const rows = (parties || []).map(p => {
    const st = buildPartyStatement(entries, accounts, { id: p.id, name: p.name, type }, period);
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      phone: p.phone,
      totalDebit: st.totalDebit,
      totalCredit: st.totalCredit,
      net: st.net,
      outstanding: st.outstanding,
      movementsCount: st.rows.length,
    };
  });

  const totals = rows.reduce(
    (s, r) => ({
      debit: s.debit + r.totalDebit,
      credit: s.credit + r.totalCredit,
      outstanding: s.outstanding + r.outstanding,
    }),
    { debit: 0, credit: 0, outstanding: 0 }
  );

  return {
    rows,
    totals: {
      debit: +totals.debit.toFixed(2),
      credit: +totals.credit.toFixed(2),
      outstanding: +totals.outstanding.toFixed(2),
    },
  };
}