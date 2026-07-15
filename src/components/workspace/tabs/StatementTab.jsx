import React from 'react';
import { Info } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

/**
 * كشف حساب المشروع — من القيود المرحّلة فقط.
 *
 * القاعدة: المصدر الوحيد للحقيقة هو قيود اليومية المرحّلة (isPosted=true).
 * لا نقرأ من سجلات الفواتير أو السندات مباشرةً — كل ما يظهر هنا مأخوذ
 * من سطور القيود المرحّلة المرتبطة بهذا المشروع عبر حقل projectId.
 *
 * التصنيف:
 *   - إيراد: سطور بحساب إيراد (4xxx) مرتبطة بالمشروع
 *   - تكلفة: سطور بحساب مصروف (5xxx) مرتبطة بالمشروع
 *   - تحصيل: سطور بحساب ذمم عملاء (1121) دائنة مرتبطة بالمشروع
 *   - صرف: سطور بحساب ذمم مورد (2110) مدينة مرتبطة بالمشروع
 */
export default function StatementTab({ journalEntries = [], accounts = [], projectName }) {
  const { lang } = useStore();

  // بناء خريطة الحسابات لمعرفة النوع
  const accountMap = React.useMemo(() => {
    const m = {};
    (accounts || []).forEach(a => { m[a.code] = a; });
    return m;
  }, [accounts]);

  // استخراج سطور القيود المرحّلة المرتبطة بالمشروع
  // القيود تُربط بالمشروع عبر:
  //   1) line.costCenter === projectName
  //   2) je.description يحتوي على projectName
  //   3) line.projectId (إن وُجد)
  //   4) je.sourceDocumentType يشير لمستند مرتبط بالمشروع
  const projectLines = React.useMemo(() => {
    if (!projectName) return [];
    const posted = (journalEntries || []).filter(je => je.isPosted);
    const lines = [];
    posted.forEach(je => {
      const jeMatches = (je.description || '').includes(projectName);
      (je.lines || []).forEach(line => {
        const lineMatches =
          line.costCenter === projectName ||
          line.projectId ||
          jeMatches ||
          (line.description || '').includes(projectName);
        if (lineMatches) {
          lines.push({
            date: je.date,
            entryNo: je.entryNo,
            description: line.description || je.description,
            accountCode: line.accountCode,
            accountName: line.accountName,
            debit: Number(line.debit) || 0,
            credit: Number(line.credit) || 0,
            sourceType: je.sourceType || '',
          });
        }
      });
    });
    return lines.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  }, [journalEntries, projectName]);

  // تصنيف كل سطر حسب نوع الحساب المحاسبي
  const lines = projectLines.map(l => {
    const acc = accountMap[l.accountCode] || {};
    const type = acc.accountType || '';
    let category = 'other';
    // الإيرادات: حسابات 4xxx (دائن بطبيعتها)
    if (type === 'REVENUE') category = 'revenue';
    // المصروفات: حسابات 5xxx (مدين بطبيعتها)
    else if (type === 'EXPENSE') category = 'cost';
    // ذمم العملاء: مدين = فاتورة (إيراد مستحق)، دائن = تحصيل
    else if (acc.semanticRole === 'RECEIVABLES') category = l.credit > 0 ? 'collection' : 'revenue';
    // ذمم الموردين/مقاولي الباطن: دائن = فاتورة (تكلفة)، مدين = سداد
    else if (acc.semanticRole === 'PAYABLES' || acc.semanticRole === 'SUB_PAYABLES') category = l.debit > 0 ? 'payment' : 'cost';
    else if (type === 'ASSET' || type === 'LIABILITY') category = 'balance';
    return { ...l, category, accountType: type, semanticRole: acc.semanticRole || '' };
  });

  // الرصيد الجاري = مدين - دائن
  let running = 0;
  const withBalance = lines.map(l => {
    running += (l.debit - l.credit);
    return { ...l, balance: running };
  });

  // الإيرادات = دائن في حسابات الإيراد (4xxx) + مدين في ذمم العملاء (فواتير)
  const totalRevenue = lines
    .filter(l => l.category === 'revenue')
    .reduce((s, l) => {
      if (l.accountType === 'REVENUE') return s + (l.credit - l.debit); // إيراد دائن
      return s + l.debit; // ذمم عملاء مدينة (فاتورة)
    }, 0);
  // التحصيلات = دائن في ذمم العملاء
  const totalCollections = lines.filter(l => l.category === 'collection').reduce((s, l) => s + l.credit, 0);
  // التكاليف = مدين في حسابات المصروفات (5xxx) + دائن في ذمم الموردين (فواتير)
  const totalCosts = lines
    .filter(l => l.category === 'cost')
    .reduce((s, l) => {
      if (l.accountType === 'EXPENSE') return s + (l.debit - l.credit); // مصروف مدين
      return s + l.credit; // ذمم مورد دائنة (فاتورة)
    }, 0);
  // السدادات = مدين في ذمم الموردين
  const totalPayments = lines.filter(l => l.category === 'payment').reduce((s, l) => s + l.debit, 0);
  const netProfit = totalRevenue - totalCosts;
  const outstanding = totalRevenue - totalCollections;

  const categoryColor = (cat) => ({
    revenue: 'text-emerald-700',
    collection: 'text-blue-700',
    cost: 'text-rose-700',
    payment: 'text-amber-700',
    balance: 'text-slate-700',
    other: 'text-foreground',
  }[cat] || 'text-foreground');

  const categoryBg = (cat) => ({
    revenue: 'bg-emerald-50',
    collection: 'bg-blue-50',
    cost: 'bg-rose-50',
    payment: 'bg-amber-50',
    balance: 'bg-slate-50',
    other: 'bg-muted',
  }[cat] || 'bg-muted');

  const categoryLabel = (cat) => ({
    revenue: t('إيراد', 'Revenue', lang),
    collection: t('تحصيل', 'Collection', lang),
    cost: t('تكلفة', 'Cost', lang),
    payment: t('سداد', 'Payment', lang),
    balance: t('ميزانية', 'Balance', lang),
    other: t('أخرى', 'Other', lang),
  }[cat] || '');

  return (
    <div className="space-y-4">
      {/* صندوق توضيحي */}
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-3 text-xs text-emerald-800 flex items-start gap-2">
        <Info className="size-4 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-semibold">{t('مصدر البيانات: القيود المرحّلة فقط', 'Data Source: Posted Journal Entries Only')}</p>
          <p>
            {t(
              'كل حركة في هذا الكشف مأخوذة من سطور قيود اليومية المرحّلة (isPosted=true) المرتبطة بهذا المشروع. لا تُعرض أي فاتورة أو سند لم يُرحّل قيدها. هذا يضمن أن الأرقام تطابق ميزان المراجعة والأستاذ العام تماماً.',
              'Every transaction in this statement is taken from posted journal entry lines linked to this project. No invoice or voucher without a posted entry is shown. This ensures numbers match the Trial Balance and General Ledger exactly.'
            )}
          </p>
        </div>
      </div>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('الإيرادات', 'Revenue', lang)}</div>
          <div className="text-base font-bold text-emerald-700">{formatCurrency(totalRevenue, lang)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('من القيود المرحّلة', 'From posted entries', lang)}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('التحصيلات', 'Collections', lang)}</div>
          <div className="text-base font-bold text-blue-700">{formatCurrency(totalCollections, lang)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('سندات قبض مرحّلة', 'Posted receipts', lang)}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('التكاليف', 'Costs', lang)}</div>
          <div className="text-base font-bold text-rose-700">{formatCurrency(totalCosts, lang)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('من القيود المرحّلة', 'From posted entries', lang)}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('صافي الربح', 'Net Profit', lang)}</div>
          <div className={`text-base font-bold ${netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(netProfit, lang)}</div>
          <div className="text-[10px] text-muted-foreground mt-0.5">{t('الإيرادات − التكاليف', 'Revenue − Costs', lang)}</div>
        </Card>
      </div>

      {/* الجدول التفصيلي */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('رقم القيد', 'Entry No', lang)}</TableHead>
                <TableHead>{t('البيان', 'Description', lang)}</TableHead>
                <TableHead>{t('الحساب', 'Account', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead className="text-end">{t('مدين', 'Debit', lang)}</TableHead>
                <TableHead className="text-end">{t('دائن', 'Credit', lang)}</TableHead>
                <TableHead className="text-end">{t('الرصيد', 'Balance', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {withBalance.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد قيود مرحّلة لهذا المشروع', 'No posted entries for this project', lang)}</TableCell></TableRow>
              ) : (
                withBalance.map((l, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">{formatDate(l.date, lang)}</TableCell>
                    <TableCell className="font-mono text-xs">{l.entryNo}</TableCell>
                    <TableCell className="text-sm">{l.description}</TableCell>
                    <TableCell className="text-xs"><span className="font-mono text-muted-foreground">{l.accountCode}</span> {l.accountName}</TableCell>
                    <TableCell>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${categoryBg(l.category)} ${categoryColor(l.category)}`}>
                        {categoryLabel(l.category)}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-end text-emerald-700">{l.debit ? formatCurrency(l.debit, lang) : '—'}</TableCell>
                    <TableCell className={`text-sm text-end ${categoryColor(l.category)}`}>{l.credit ? formatCurrency(l.credit, lang) : '—'}</TableCell>
                    <TableCell className="text-sm text-end font-medium">{formatCurrency(l.balance, lang)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* ملخص سفلي */}
      <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs text-muted-foreground">
        <span>{t('المحصّل من العميل', 'Collected from client', lang)}: <strong className="text-blue-700">{formatCurrency(totalCollections, lang)}</strong></span>
        <span>{t('المتبقي على العميل', 'Outstanding from client', lang)}: <strong className="text-amber-700">{formatCurrency(outstanding, lang)}</strong></span>
        <span>{t('إجمالي التكاليف', 'Total costs', lang)}: <strong className="text-rose-700">{formatCurrency(totalCosts, lang)}</strong></span>
        <span>{t('مدفوعات الموردين', 'Supplier payments', lang)}: <strong className="text-amber-700">{formatCurrency(totalPayments, lang)}</strong></span>
        <span>{t('صافي الربح', 'Net profit', lang)}: <strong className={netProfit >= 0 ? 'text-emerald-700' : 'text-rose-700'}>{formatCurrency(netProfit, lang)}</strong></span>
      </div>
    </div>
  );
}
