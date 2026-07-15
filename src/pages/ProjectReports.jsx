import React, { useState, useEffect } from 'react';
import { PieChart, RefreshCw } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { PROJECT_STATUS } from '@/lib/utils-binaa';
import TableToolbar from '@/components/shared/TableToolbar';
import { computeProjectProfitabilityFromJE } from '@/lib/financialEngine';
import { toast } from 'sonner';

// تقرير محفظة المشاريع: الإيراد والتكلفة والربح لكل مشروع — من القيود المرحّلة فقط.
export default function ProjectReports() {
  const { lang } = useStore();
  const [loading, setLoading] = useState(true);
  const [projects, setProjects] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [chartAccounts, setChartAccounts] = useState([]);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pr, je, acc] = await Promise.all([
        base44.entities.Project.list('-created_date', 500),
        base44.entities.JournalEntry.list('-date', 5000),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setProjects(pr);
      setJournalEntries(je || []);
      setChartAccounts(acc || []);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // فلترة القيود حسب الفترة المحددة
  const inPeriod = (date) => (!from || (date && date >= from)) && (!to || (date && date <= to));
  const periodJournal = journalEntries.filter(je => inPeriod(je.date));

  const rows = projects.map(p => {
    const jeProfit = computeProjectProfitabilityFromJE(periodJournal, chartAccounts, p.name || '', p.id || '');
    const revenue = jeProfit.revenue;
    const cost = jeProfit.cost;
    const profit = jeProfit.profit;
    const margin = jeProfit.marginPercent;
    return { ...p, revenue, cost, profit, margin };
  });

  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalCost = rows.reduce((s, r) => s + r.cost, 0);
  const totalProfit = totalRevenue - totalCost;
  const columns = [
    { header: { ar: 'الطلب', en: 'Order' }, value: r => r.name },
    { header: { ar: 'الإيراد', en: 'Revenue' }, value: r => formatCurrency(r.revenue, lang) },
    { header: { ar: 'التكلفة', en: 'Cost' }, value: r => formatCurrency(r.cost, lang) },
    { header: { ar: 'الربح', en: 'Profit' }, value: r => formatCurrency(r.profit, lang) },
    { header: { ar: 'الهامش', en: 'Margin' }, value: r => `${r.margin.toFixed(1)}%` },
  ];

  return (
    <ModuleLayout
      title={t('تقارير الطلبات', 'Order Reports', lang)}
      subtitle={t('ربحية محفظة الطلبات', 'Order portfolio profitability', lang)}
      actions={<div className="flex gap-2"><TableToolbar columns={columns} rows={rows} title={{ ar: 'تقارير الطلبات التفصيلية', en: 'Detailed Order Reports' }} /><Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button></div>}
    >
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} /></div>
          <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} /></div>
          <Button variant="outline" onClick={() => { setFrom(''); setTo(''); }}>{t('مسح الفترة', 'Clear Period', lang)}</Button>
        </div>
      </Card>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="border-t-4 border-t-emerald-500"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t('إجمالي الإيرادات', 'Total Revenue', lang)}</p><p className="text-2xl font-bold text-emerald-600 mt-1">{formatCurrency(totalRevenue, lang)}</p></CardContent></Card>
        <Card className="border-t-4 border-t-rose-500"><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t('إجمالي التكاليف', 'Total Costs', lang)}</p><p className="text-2xl font-bold text-rose-600 mt-1">{formatCurrency(totalCost, lang)}</p></CardContent></Card>
        <Card className={`border-t-4 ${totalProfit >= 0 ? 'border-t-teal-500' : 'border-t-amber-500'}`}><CardContent className="p-5"><p className="text-sm text-muted-foreground">{t('صافي الربح', 'Net Profit', lang)}</p><p className={`text-2xl font-bold mt-1 ${totalProfit >= 0 ? 'text-teal-600' : 'text-amber-600'}`}>{formatCurrency(totalProfit, lang)}</p></CardContent></Card>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-end">{t('الإيراد', 'Revenue', lang)}</TableHead>
                <TableHead className="text-end">{t('التكلفة', 'Cost', lang)}</TableHead>
                <TableHead className="text-end">{t('الربح', 'Profit', lang)}</TableHead>
                <TableHead className="text-end">{t('الهامش', 'Margin', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground"><PieChart className="size-10 mx-auto mb-2 text-muted-foreground/40" />{t('لا توجد طلبات', 'No orders', lang)}</TableCell></TableRow>
              ) : rows.map(r => {
                const st = PROJECT_STATUS[r.status] || PROJECT_STATUS.PLANNING;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                    <TableCell className="text-end">{formatCurrency(r.revenue, lang)}</TableCell>
                    <TableCell className="text-end">{formatCurrency(r.cost, lang)}</TableCell>
                    <TableCell className={`text-end font-medium ${r.profit >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(r.profit, lang)}</TableCell>
                    <TableCell className={`text-end ${r.margin >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{r.margin.toFixed(1)}%</TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>
    </ModuleLayout>
  );
}