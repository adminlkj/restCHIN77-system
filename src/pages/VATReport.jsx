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

function inPeriod(dateStr, year, months) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === Number(year) && months.includes(d.getMonth());
}

// تقرير ضريبة القيمة المضافة: تفاصيل الضريبة المخرجة (مبيعات) والمدخلة (مشتريات/مصروفات)
// وصافي المستحق للربع والسنة المختارين.
export default function VATReport() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [sales, setSales] = useState([]);
  const [rentalSales, setRentalSales] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [year, setYear] = useState(String(currentYear));
  const [quarter, setQuarter] = useState(currentQuarter);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, rinv, exp, si] = await Promise.all([
        base44.entities.SalesInvoice.list('-date', 2000),
        base44.entities.RentalInvoice.list('-date', 2000),
        base44.entities.Expense.list('-date', 2000),
        base44.entities.SupplierInvoice.list('-date', 2000),
      ]);
      setSales(inv); setRentalSales(rinv); setExpenses(exp); setSupplierInvoices(si);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const q = QUARTERS.find(x => x.key === quarter) || QUARTERS[0];

  // الضريبة المخرجة: فواتير المبيعات والتأجير ضمن الفترة (باستثناء المسودات والملغاة).
  const outputRows = useMemo(() => {
    const taxableStatuses = ['APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
    const salesRows = sales
      .filter(i => taxableStatuses.includes(i.status) && inPeriod(i.date, year, q.months))
      .map(i => ({
        date: i.date,
        docNo: i.invoiceNo,
        party: i.clientName,
        source: t('فاتورة مبيعات', 'Sales Invoice', lang),
        base: Number(i.subtotal) || 0,
        vat: Number(i.vatAmount) || 0,
        total: Number(i.totalAmount) || 0,
      }));
    const rentalRows = rentalSales
      .filter(i => taxableStatuses.includes(i.status) && inPeriod(i.date, year, q.months))
      .map(i => ({
        date: i.date,
        docNo: i.invoiceNo,
        party: i.clientName,
        source: t('فاتورة تأجير', 'Rental Invoice', lang),
        base: (Number(i.baseAmount) || 0) + (Number(i.extraCharges) || 0) + (i.deliveryVatable === false ? 0 : (Number(i.deliveryAmount) || 0)),
        vat: Number(i.vatAmount) || 0,
        total: Number(i.totalAmount) || 0,
      }));
    return [...salesRows, ...rentalRows].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [sales, rentalSales, year, q, lang]);

  // الضريبة المدخلة: المصروفات + فواتير الموردين ضمن الفترة.
  const inputRows = useMemo(() => {
    const expRows = expenses
      .filter(e => inPeriod(e.date, year, q.months) && (Number(e.vatAmount) || 0) > 0)
      .map(e => ({
        date: e.date,
        docNo: e.reference || '—',
        party: e.description,
        source: t('مصروف', 'Expense', lang),
        base: Number(e.amount) || 0,
        vat: Number(e.vatAmount) || 0,
        total: Number(e.totalAmount) || 0,
      }));
    const siRows = supplierInvoices
      .filter(s => s.status !== 'CANCELLED' && inPeriod(s.date, year, q.months) && (Number(s.vatAmount) || 0) > 0)
      .map(s => ({
        date: s.date,
        docNo: s.invoiceNo,
        party: s.supplierName,
        source: t('فاتورة مورد', 'Supplier Invoice', lang),
        base: Number(s.baseAmount) || 0,
        vat: Number(s.vatAmount) || 0,
        total: Number(s.totalAmount) || 0,
      }));
    return [...expRows, ...siRows].sort((a, b) => new Date(b.date) - new Date(a.date));
  }, [expenses, supplierInvoices, year, q, lang]);

  const outputBase = outputRows.reduce((s, r) => s + r.base, 0);
  const outputVat = outputRows.reduce((s, r) => s + r.vat, 0);
  const inputBase = inputRows.reduce((s, r) => s + r.base, 0);
  const inputVat = inputRows.reduce((s, r) => s + r.vat, 0);
  const netVat = outputVat - inputVat;

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
              <CardTitle className="text-base">{t('تفاصيل الضريبة المخرجة — المبيعات والتأجير', 'Output VAT Details — Sales & Rental', lang)}</CardTitle>
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
                      <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">{t('لا توجد فواتير مبيعات أو تأجير في هذه الفترة', 'No sales or rental invoices in this period', lang)}</TableCell></TableRow>
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