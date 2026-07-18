import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, PieChart, TrendingUp, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useBranches } from '@/hooks/useBranches';
import { useAccounts } from '@/hooks/useAccounts';
import { t, formatCurrency, formatNumber } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { buildCostCenterAnalysis } from '@/lib/ledgerEngine';
import { toast } from 'sonner';

// تحليل أقسام المطعم: إيراد وتكلفة وهامش لكل قسم (طلب/فرع). الكيان Project يُستخدم كقسم مطعم.
export default function CostCenters() {
  const { lang } = useStore();
  // الفروع والدليل المحاسبي من cache مشترك بدلاً من جلبها مستقلة عند كل mount.
  const { branches } = useBranches();
  const { accounts } = useAccounts();
  const [journalEntries, setJournalEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      // الفروع والدليل من cache مشترك — لا يُجلبان هنا.
      const jes = await base44.entities.JournalEntry.list('-date', 5000);
      setJournalEntries(jes);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const data = useMemo(
    () => ({ projects: branches, journalEntries, chartAccounts: accounts }),
    [branches, journalEntries, accounts]
  );

  const analysis = useMemo(
    () => buildCostCenterAnalysis(data, { from, to }),
    [data, from, to]
  );

  const exportColumns = [
    { header: { ar: 'قسم المطعم', en: 'Restaurant Section' }, value: (r) => r.name || (lang === 'ar' ? 'غير مخصّص' : 'Unassigned') },
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الإيراد', en: 'Revenue' }, value: (r) => r.revenue },
    { header: { ar: 'مصروفات', en: 'Expenses' }, value: (r) => r.expenseCost },
    { header: { ar: 'فواتير مورد', en: 'Supplier Invoices' }, value: (r) => r.supplierCost },
    { header: { ar: 'مورّدو الخدمات', en: 'Service Providers' }, value: (r) => r.subCost },
    { header: { ar: 'إجمالي التكلفة', en: 'Total Cost' }, value: (r) => r.cost },
    { header: { ar: 'الهامش', en: 'Margin' }, value: (r) => r.margin },
    { header: { ar: 'نسبة الهامش %', en: 'Margin %' }, value: (r) => r.marginPercent },
  ];

  const kpis = [
    { label: { ar: 'إجمالي الإيرادات', en: 'Total Revenue' }, value: analysis.totals.revenue, color: 'text-emerald-700', bg: 'bg-emerald-50/60' },
    { label: { ar: 'إجمالي التكاليف', en: 'Total Costs' }, value: analysis.totals.cost, color: 'text-rose-700', bg: 'bg-rose-50/60' },
    { label: { ar: 'صافي الهامش', en: 'Net Margin' }, value: analysis.totals.margin, color: analysis.totals.margin >= 0 ? 'text-teal-700' : 'text-rose-700', bg: 'bg-teal-50/60' },
  ];

  return (
    <ModuleLayout
      title={t('تحليل أقسام المطعم', 'Restaurant Section Analysis', lang)}
      subtitle={t('الإيراد والتكلفة والهامش لكل قسم مطعم (طلب)', 'Revenue, cost and margin per restaurant section', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar
            columns={exportColumns}
            rows={analysis.rows}
            title={{ ar: 'تحليل أقسام المطعم', en: 'Restaurant Section Analysis' }}
            subheading={from || to ? { ar: `الفترة: ${from || '—'} إلى ${to || '—'}`, en: `Period: ${from || '—'} to ${to || '—'}` } : undefined}
          />
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {kpis.map((k, i) => (
          <Card key={i} className={`p-4 ${k.bg}`}>
            <div className="text-xs text-muted-foreground mb-1">{lang === 'ar' ? k.label.ar : k.label.en}</div>
            <div className={`text-xl font-bold ${k.color}`}>{formatCurrency(k.value, lang)}</div>
          </Card>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" /></div>
        {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}>{t('مسح الفترة', 'Clear', lang)}</Button>}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('قسم المطعم', 'Restaurant Section', lang)}</TableHead>
                <TableHead className="text-end">{t('الإيراد', 'Revenue', lang)}</TableHead>
                <TableHead className="text-end">{t('مصروفات', 'Expenses', lang)}</TableHead>
                <TableHead className="text-end">{t('باطن', 'Sub', lang)}</TableHead>
                <TableHead className="text-end">{t('إجمالي التكلفة', 'Total Cost', lang)}</TableHead>
                <TableHead className="text-end">{t('الهامش', 'Margin', lang)}</TableHead>
                <TableHead className="text-end">{t('النسبة', 'Margin %', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : analysis.rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground flex-col"><PieChart className="size-7 mx-auto mb-2 text-indigo-400/50" />{t('لا توجد بيانات أقسام مطاعم', 'No restaurant section data', lang)}</TableCell></TableRow>
                : analysis.rows.map((r, i) => (
                  <TableRow key={i} className="hover:bg-muted/30">
                    <TableCell className="font-medium">
                      {r.name || (lang === 'ar' ? 'غير مخصّص' : 'Unassigned')}
                      {r.code && r.code !== '—' && <span className="font-mono text-[10px] text-muted-foreground ms-2">{r.code}</span>}
                    </TableCell>
                    <TableCell className="text-end text-sm text-emerald-700">{formatCurrency(r.revenue, lang)}</TableCell>
                    <TableCell className="text-end text-sm">{formatCurrency(r.expenseCost, lang)}</TableCell>
                    <TableCell className="text-end text-sm">{formatCurrency(r.subCost, lang)}</TableCell>
                    <TableCell className="text-end text-sm text-rose-700">{formatCurrency(r.cost, lang)}</TableCell>
                    <TableCell className={`text-end text-sm font-semibold ${r.margin >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>
                      <span className="inline-flex items-center gap-1 justify-end">
                        {r.margin >= 0 ? <TrendingUp className="size-3.5" /> : <TrendingDown className="size-3.5" />}
                        {formatCurrency(r.margin, lang)}
                      </span>
                    </TableCell>
                    <TableCell className={`text-end text-sm ${r.margin >= 0 ? 'text-teal-600' : 'text-rose-600'}`}>{formatNumber(r.marginPercent, 1)}%</TableCell>
                  </TableRow>
                ))}
              {!loading && analysis.rows.length > 0 && (
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell>{t('الإجمالي', 'Total', lang)}</TableCell>
                  <TableCell className="text-end text-emerald-700">{formatCurrency(analysis.totals.revenue, lang)}</TableCell>
                  <TableCell colSpan={2}></TableCell>
                  <TableCell className="text-end text-rose-700">{formatCurrency(analysis.totals.cost, lang)}</TableCell>
                  <TableCell className={`text-end ${analysis.totals.margin >= 0 ? 'text-teal-700' : 'text-rose-700'}`}>{formatCurrency(analysis.totals.margin, lang)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>
    </ModuleLayout>
  );
}