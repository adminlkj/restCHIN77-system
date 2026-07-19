import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, TrendingUp, TrendingDown, Scale, Printer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { printReportDocument } from '@/lib/printTemplate';
import { buildAccountMap, flattenPostedLines } from '@/lib/financialEngine';

// أرباع السنة الميلادية: كل ربع 3 أشهر.
const QUARTERS = [
  { key: 'Q1', ar: 'الربع الأول (يناير - مارس)', en: 'Q1 (Jan - Mar)', months: [0, 1, 2] },
  { key: 'Q2', ar: 'الربع الثاني (أبريل - يونيو)', en: 'Q2 (Apr - Jun)', months: [3, 4, 5] },
  { key: 'Q3', ar: 'الربع الثالث (يوليو - سبتمبر)', en: 'Q3 (Jul - Sep)', months: [6, 7, 8] },
  { key: 'Q4', ar: 'الربع الرابع (أكتوبر - ديسمبر)', en: 'Q4 (Oct - Dec)', months: [9, 10, 11] },
];

const currentYear = new Date().getFullYear();
const currentQuarter = QUARTERS[Math.floor(new Date().getMonth() / 3)]?.key || 'Q1';
const YEARS = Array.from({ length: 6 }, (_, i) => currentYear - i);

// التحقق من وقوع تاريخ السطر ضمن ربع وسنة معيّنين.
// نستخدم التاريخ المحلي (وليس UTC) لتفادي إدراج فاتورة بعد منتصف الليل في ربع خاطئ.
function inPeriod(dateStr, year, months) {
  if (!dateStr) return false;
  // نُنشئ التاريخ كـ local (بتمرير التاريخ فقط دون وقت) لتجنّب انحراف UTC.
  const d = new Date(String(dateStr).slice(0, 10) + 'T00:00:00');
  return d.getFullYear() === Number(year) && months.includes(d.getMonth());
}

// مصدر الحقيقة الموحّد: نقرأ القيود المرحّلة + دليل الحسابات فقط، لا الفواتير.
// هذا يضمن تطابق إقرار VAT مع ميزان المراجعة وقائمة الدخل 100%.
export default function VATReport() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [journal, setJournal] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState(currentQuarter);

  const load = async () => {
    setLoading(true);
    try {
      const [jes, accs] = await Promise.all([
        base44.entities.JournalEntry.filter({ isPosted: true }, '-date', 5000),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setJournal(jes || []);
      setAccounts(accs || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const q = QUARTERS.find(x => x.key === quarter) || QUARTERS[0];
  const accountMap = useMemo(() => buildAccountMap(accounts), [accounts]);
  const allLines = useMemo(() => flattenPostedLines(journal), [journal]);

  // الضريبة المخرجة: سطور VAT_PAYABLE (دائن − مدين) ضمن الفترة.
  // القيد العكسي (إلغاء) يُنتج قيمة سالبة فتُخصم تلقائياً من المحصّل — ميزة المصدر الموحّد.
  const outputRows = useMemo(() => {
    return allLines
      .filter(l => {
        const acc = accountMap[l.accountCode];
        return acc?.semanticRole === 'VAT_PAYABLE' && inPeriod(l.date, year, q.months) && (l.credit - l.debit) !== 0;
      })
      .map(l => {
        const vat = +(l.credit - l.debit).toFixed(2);
        // القاعدة الخاضعة = VAT / 15% (نستنتجها من الضريبة المرحّلة، لا من الفاتورة).
        const base = +Math.abs((vat / 0.15)).toFixed(2);
        return {
          date: l.date,
          docNo: l.entryNo,
          party: l.partyName || l.description || '',
          source: l.sourceType || '',
          base: vat >= 0 ? base : -base,
          vat,
          total: +(base + vat).toFixed(2) * (vat >= 0 ? 1 : -1),
        };
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [allLines, accountMap, year, q]);

  // الضريبة المدخلة: سطور VAT_RECEIVABLE (مدين − دائن) ضمن الفترة.
  const inputRows = useMemo(() => {
    return allLines
      .filter(l => {
        const acc = accountMap[l.accountCode];
        return acc?.semanticRole === 'VAT_RECEIVABLE' && inPeriod(l.date, year, q.months) && (l.debit - l.credit) !== 0;
      })
      .map(l => {
        const vat = +(l.debit - l.credit).toFixed(2);
        const base = +Math.abs((vat / 0.15)).toFixed(2);
        return {
          date: l.date,
          docNo: l.entryNo,
          party: l.partyName || l.description || '',
          source: l.sourceType || '',
          base: vat >= 0 ? base : -base,
          vat,
        };
      })
      .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  }, [allLines, accountMap, year, q]);

  const outputBase = +outputRows.reduce((s, r) => s + r.base, 0).toFixed(2);
  const outputVat = +outputRows.reduce((s, r) => s + r.vat, 0).toFixed(2);
  const inputBase = +inputRows.reduce((s, r) => s + r.base, 0).toFixed(2);
  const inputVat = +inputRows.reduce((s, r) => s + r.vat, 0).toFixed(2);
  const netVat = +(outputVat - inputVat).toFixed(2);

  const periodLabel = {
    ar: `${lang === 'ar' ? q.ar : q.en} — ${year}`,
    en: `${q.en} — ${year}`,
  };

  const outputColumns = [
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => formatDate(r.date, lang) },
    { header: { ar: 'رقم الفاتورة', en: 'Invoice No' }, value: (r) => r.docNo },
    { header: { ar: 'العميل', en: 'Client' }, value: (r) => r.party || '' },
    { header: { ar: 'المصدر', en: 'Source' }, value: (r) => r.source || '' },
    { header: { ar: 'القاعدة الخاضعة', en: 'Taxable Base' }, value: (r) => r.base },
    { header: { ar: 'الضريبة المخرجة', en: 'Output VAT' }, value: (r) => r.vat },
    { header: { ar: 'الإجمالي', en: 'Total' }, value: (r) => r.total },
  ];
  const inputColumns = [
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => formatDate(r.date, lang) },
    { header: { ar: 'المستند', en: 'Document' }, value: (r) => r.docNo },
    { header: { ar: 'الجهة', en: 'Party' }, value: (r) => r.party || '' },
    { header: { ar: 'المصدر', en: 'Source' }, value: (r) => r.source },
    { header: { ar: 'القاعدة', en: 'Base' }, value: (r) => r.base },
    { header: { ar: 'الضريبة المدخلة', en: 'Input VAT' }, value: (r) => r.vat },
  ];

  const printFullReturn = () => {
    const detailHeaders = [
      t('التاريخ', 'Date', lang),
      t('المستند', 'Document', lang),
      t('الجهة', 'Party', lang),
      t('المصدر', 'Source', lang),
      t('القاعدة', 'Base', lang),
      t('الضريبة', 'VAT', lang),
      t('الإجمالي', 'Total', lang),
    ];

    printReportDocument({
      settings,
      lang,
      heading: t('إقرار ضريبة القيمة المضافة الكامل', 'Full VAT Return', lang),
      subheading: periodLabel[lang],
      summary: [
        { label: t('الضريبة المخرجة', 'Output VAT', lang), value: formatCurrency(outputVat, lang), note: `${t('القاعدة', 'Base', lang)}: ${formatCurrency(outputBase, lang)}` },
        { label: t('الضريبة المدخلة', 'Input VAT', lang), value: formatCurrency(inputVat, lang), note: `${t('القاعدة', 'Base', lang)}: ${formatCurrency(inputBase, lang)}` },
        { label: netVat >= 0 ? t('صافي مستحق للهيئة', 'Net Due to Authority', lang) : t('صافي قابل للاسترداد', 'Net Refundable', lang), value: formatCurrency(Math.abs(netVat), lang) },
      ],
      sections: [
        {
          title: t('تفاصيل الضريبة المخرجة — المبيعات', 'Output VAT Details — Sales', lang),
          headers: detailHeaders,
          rows: outputRows.map(r => [formatDate(r.date, lang), r.docNo, r.party || '', r.source || t('مبيعات', 'Sales', lang), formatCurrency(r.base, lang), formatCurrency(r.vat, lang), formatCurrency(r.total, lang)]),
          totals: [[t('الإجمالي', 'Total', lang), '', '', '', formatCurrency(outputBase, lang), formatCurrency(outputVat, lang), formatCurrency(outputBase + outputVat, lang)]],
        },
        {
          title: t('تفاصيل الضريبة المدخلة — المشتريات والمصروفات', 'Input VAT Details — Purchases & Expenses', lang),
          headers: detailHeaders,
          rows: inputRows.map(r => [formatDate(r.date, lang), r.docNo, r.party || '', r.source, formatCurrency(r.base, lang), formatCurrency(r.vat, lang), formatCurrency(r.total, lang)]),
          totals: [[t('الإجمالي', 'Total', lang), '', '', '', formatCurrency(inputBase, lang), formatCurrency(inputVat, lang), formatCurrency(inputBase + inputVat, lang)]],
        },
        {
          title: t('ملخص التسوية', 'Settlement Summary', lang),
          headers: [t('البيان', 'Statement', lang), t('المبلغ', 'Amount', lang)],
          rows: [
            [t('إجمالي الضريبة المخرجة', 'Total Output VAT', lang), formatCurrency(outputVat, lang)],
            [t('إجمالي الضريبة المدخلة', 'Total Input VAT', lang), formatCurrency(inputVat, lang)],
            [netVat >= 0 ? t('صافي الضريبة المستحقة للهيئة', 'Net VAT Due to Authority', lang) : t('صافي الضريبة القابلة للاسترداد', 'Net VAT Refundable', lang), formatCurrency(Math.abs(netVat), lang)],
          ],
        },
      ],
    });
  };

  return (
    <ModuleLayout
      title={t('إقرار ضريبة القيمة المضافة', 'VAT Return', lang)}
      subtitle={t('تفاصيل الضريبة المخرجة والمدخلة والصافي المستحق للفترة المختارة', 'Output & input VAT details and net due for the selected period', lang)}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={printFullReturn} className="gap-2" disabled={loading}>
            <Printer className="size-4" />{t('طباعة الإقرار الكامل', 'Print Full Return', lang)}
          </Button>
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      {/* Period selectors */}
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label className="text-xs">{t('السنة', 'Year', lang)}</Label>
          <Select value={year} onValueChange={setYear}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">{t('الربع', 'Quarter', lang)}</Label>
          <Select value={quarter} onValueChange={setQuarter}>
            <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
            <SelectContent>{QUARTERS.map(x => <SelectItem key={x.key} value={x.key}>{lang === 'ar' ? x.ar : x.en}</SelectItem>)}</SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {Array.from({ length: 3 }).map((_, i) => <Card key={i}><CardContent className="p-5"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>)}
        </div>
      ) : (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="border-t-4 border-t-emerald-500">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-emerald-600"><TrendingUp className="size-4" /><p className="text-sm text-muted-foreground">{t('الضريبة المخرجة (مبيعات)', 'Output VAT (Sales)', lang)}</p></div>
                <p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(outputVat, lang)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('قاعدة خاضعة', 'Taxable base', lang)}: {formatCurrency(outputBase, lang)}</p>
              </CardContent>
            </Card>
            <Card className="border-t-4 border-t-rose-500">
              <CardContent className="p-5">
                <div className="flex items-center gap-2 text-rose-600"><TrendingDown className="size-4" /><p className="text-sm text-muted-foreground">{t('الضريبة المدخلة (مشتريات)', 'Input VAT (Purchases)', lang)}</p></div>
                <p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(inputVat, lang)}</p>
                <p className="text-xs text-muted-foreground mt-1">{t('قاعدة', 'Base', lang)}: {formatCurrency(inputBase, lang)}</p>
              </CardContent>
            </Card>
            <Card className={`border-t-4 ${netVat >= 0 ? 'border-t-teal-500' : 'border-t-amber-500'}`}>
              <CardContent className="p-5">
                <div className={`flex items-center gap-2 ${netVat >= 0 ? 'text-teal-600' : 'text-amber-600'}`}><Scale className="size-4" /><p className="text-sm text-muted-foreground">{t('صافي الضريبة المستحقة', 'Net VAT Due', lang)}</p></div>
                <p className={`text-2xl font-bold mt-1 ${netVat >= 0 ? 'text-teal-600' : 'text-amber-600'}`}>{formatCurrency(Math.abs(netVat), lang)}</p>
                <p className="text-xs text-muted-foreground mt-1">{netVat >= 0 ? t('مستحقة للهيئة', 'Due to Authority', lang) : t('مستحقة للاسترداد', 'Refundable', lang)}</p>
              </CardContent>
            </Card>
          </div>

          {/* Output VAT details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('تفاصيل الضريبة المخرجة — المبيعات', 'Output VAT Details — Sales', lang)}</CardTitle>
              <TableToolbar
                columns={outputColumns}
                rows={outputRows}
                title={{ ar: 'الضريبة المخرجة (مبيعات)', en: 'Output VAT (Sales)' }}
                subheading={periodLabel}
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead>{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                      <TableHead>{t('العميل', 'Client', lang)}</TableHead>
                      <TableHead>{t('المصدر', 'Source', lang)}</TableHead>
                      <TableHead className="text-end">{t('القاعدة الخاضعة', 'Taxable Base', lang)}</TableHead>
                      <TableHead className="text-end">{t('الضريبة', 'VAT', lang)}</TableHead>
                      <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {outputRows.length === 0 ? (
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t('لا توجد فواتير مبيعات في هذه الفترة', 'No sales invoices in this period', lang)}</TableCell></TableRow>
                    ) : outputRows.map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="text-xs">{formatDate(r.date, lang)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.docNo}</TableCell>
                        <TableCell className="text-sm">{r.party}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                        <TableCell className="text-end text-sm">{formatCurrency(r.base, lang)}</TableCell>
                        <TableCell className="text-end text-sm text-emerald-600">{formatCurrency(r.vat, lang)}</TableCell>
                        <TableCell className="text-end text-sm">{formatCurrency(r.total, lang)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-emerald-50">
                      <TableCell colSpan={4}>{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(outputBase, lang)}</TableCell>
                      <TableCell className="text-end text-emerald-700">{formatCurrency(outputVat, lang)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(outputBase + outputVat, lang)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Input VAT details */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">{t('تفاصيل الضريبة المدخلة — المشتريات والمصروفات', 'Input VAT Details — Purchases & Expenses', lang)}</CardTitle>
              <TableToolbar
                columns={inputColumns}
                rows={inputRows}
                title={{ ar: 'الضريبة المدخلة (مشتريات)', en: 'Input VAT (Purchases)' }}
                subheading={periodLabel}
              />
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead>{t('المستند', 'Document', lang)}</TableHead>
                      <TableHead>{t('الجهة', 'Party', lang)}</TableHead>
                      <TableHead>{t('المصدر', 'Source', lang)}</TableHead>
                      <TableHead className="text-end">{t('القاعدة', 'Base', lang)}</TableHead>
                      <TableHead className="text-end">{t('الضريبة', 'VAT', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {inputRows.length === 0 ? (
                      <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('لا توجد مشتريات خاضعة للضريبة في هذه الفترة', 'No taxable purchases in this period', lang)}</TableCell></TableRow>
                    ) : inputRows.map((r, i) => (
                      <TableRow key={i} className="hover:bg-muted/30">
                        <TableCell className="text-xs">{formatDate(r.date, lang)}</TableCell>
                        <TableCell className="font-mono text-xs">{r.docNo}</TableCell>
                        <TableCell className="text-sm">{r.party}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{r.source}</TableCell>
                        <TableCell className="text-end text-sm">{formatCurrency(r.base, lang)}</TableCell>
                        <TableCell className="text-end text-sm text-rose-600">{formatCurrency(r.vat, lang)}</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-bold bg-rose-50">
                      <TableCell colSpan={4}>{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell className="text-end">{formatCurrency(inputBase, lang)}</TableCell>
                      <TableCell className="text-end text-rose-700">{formatCurrency(inputVat, lang)}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Net summary */}
          <Card>
            <CardContent className="p-5">
              <Table>
                <TableBody>
                  <TableRow><TableCell className="font-medium">{t('إجمالي الضريبة المخرجة', 'Total Output VAT', lang)}</TableCell><TableCell className="text-end text-emerald-700 font-semibold">{formatCurrency(outputVat, lang)}</TableCell></TableRow>
                  <TableRow><TableCell className="font-medium">{t('إجمالي الضريبة المدخلة', 'Total Input VAT', lang)}</TableCell><TableCell className="text-end text-rose-700 font-semibold">({formatCurrency(inputVat, lang)})</TableCell></TableRow>
                  <TableRow className={`font-bold text-base ${netVat >= 0 ? 'bg-teal-50' : 'bg-amber-50'}`}>
                    <TableCell>{netVat >= 0 ? t('صافي الضريبة المستحقة للهيئة', 'Net VAT Due to Authority', lang) : t('صافي الضريبة القابلة للاسترداد', 'Net VAT Refundable', lang)}</TableCell>
                    <TableCell className={`text-end ${netVat >= 0 ? 'text-teal-700' : 'text-amber-700'}`}>{formatCurrency(Math.abs(netVat), lang)}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </>
      )}
    </ModuleLayout>
  );
}