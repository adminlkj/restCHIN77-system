import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, PieChart as PieChartIcon, Store } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { toast } from 'sonner';

// تقرير مقارنة الفروع ضمن فترة محددة — عدد الطلبات والإيراد ومتوسط الطلب لكل فرع.
export default function BranchReport() {
  const { lang } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [from, setFrom] = useState(monthAgo);
  const [to, setTo] = useState(today);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const all = await base44.entities.SalesInvoice.list('-created_date', 3000);
      const list = (all || []).filter(inv => {
        if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return false;
        const d = inv.date ? String(inv.date).slice(0, 10) : '';
        if (!d) return false;
        if (from && d < from) return false;
        if (to && d > to) return false;
        return true;
      });
      setInvoices(list);
    } catch (err) {
      console.warn('BranchReport load failed:', err);
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      const id = inv.projectId || '__none__';
      const name = inv.projectName || t('غير محدد', 'Unspecified', lang);
      if (!map[id]) map[id] = { id, name, orders: 0, revenue: 0 };
      map[id].orders += 1;
      map[id].revenue += Number(inv.totalAmount) || 0;
    });
    return Object.values(map)
      .map(r => ({
        ...r,
        avgOrder: r.orders > 0 ? r.revenue / r.orders : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [invoices, lang]);

  const totalOrders = rows.reduce((s, r) => s + r.orders, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const avgOrder = totalOrders > 0 ? totalRevenue / totalOrders : 0;

  const chartData = rows.map(r => ({
    name: r.name,
    revenue: +r.revenue.toFixed(2),
    orders: r.orders,
  }));

  return (
    <ModuleLayout
      title={t('تقرير الفروع', 'Branch Comparison Report', lang)}
      subtitle={t('مقارنة الإيرادات وعدد الطلبات بين الفروع', 'Revenue and order count comparison across branches', lang)}
      actions={<Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>}
    >
      {/* اختيار الفترة */}
      <Card className="p-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="space-y-1">
            <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
            <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
            <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
          </div>
          <Button onClick={load} className="gap-2">
            <Store className="size-4" />
            {t('تطبيق', 'Apply', lang)}
          </Button>
        </div>
      </Card>

      {/* بطاقات ملخصة */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('عدد الفروع', 'Branches', lang)} value={rows.length} tint="border-t-emerald-500" />
        <StatCard label={t('إجمالي الطلبات', 'Total Orders', lang)} value={totalOrders} tint="border-t-blue-500" />
        <StatCard label={t('إجمالي الإيراد', 'Total Revenue', lang)} value={formatCurrency(totalRevenue, lang)} tint="border-t-amber-500" />
      </div>

      {/* رسم بياني: الإيراد حسب الفرع */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold mb-3">{t('الإيراد حسب الفرع', 'Revenue by Branch', lang)}</h3>
            <div dir="ltr" className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip formatter={(val) => formatCurrency(val, lang)} />
                  <Bar dataKey="revenue" fill="#6366f1" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      )}

      {/* جدول التفصيل */}
      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                <TableHead>{t('الفرع', 'Branch', lang)}</TableHead>
                <TableHead className="text-center">{t('عدد الطلبات', 'Orders', lang)}</TableHead>
                <TableHead className="text-end">{t('الإيراد', 'Revenue', lang)}</TableHead>
                <TableHead className="text-end">{t('متوسط الطلب', 'Avg. Order', lang)}</TableHead>
                <TableHead className="text-end">{t('نسبة الإيراد', 'Revenue Share', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <PieChartIcon className="size-10 mx-auto mb-2 text-muted-foreground/40" />
                    {t('لا توجد مبيعات في الفترة المحددة', 'No sales in the selected period', lang)}
                  </TableCell>
                </TableRow>
              ) : rows.map((r, idx) => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="text-center font-mono text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell className="text-center">{r.orders}</TableCell>
                  <TableCell className="text-end font-medium">{formatCurrency(r.revenue, lang)}</TableCell>
                  <TableCell className="text-end text-muted-foreground">{formatCurrency(r.avgOrder, lang)}</TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%
                  </TableCell>
                </TableRow>
              ))}
              {rows.length > 0 && (
                <TableRow className="bg-muted/30 font-semibold">
                  <TableCell></TableCell>
                  <TableCell>{t('الإجمالي', 'Total', lang)}</TableCell>
                  <TableCell className="text-center">{totalOrders}</TableCell>
                  <TableCell className="text-end">{formatCurrency(totalRevenue, lang)}</TableCell>
                  <TableCell className="text-end">{formatCurrency(avgOrder, lang)}</TableCell>
                  <TableCell className="text-end">100%</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </ModuleLayout>
  );
}

function StatCard({ label, value, tint }) {
  return (
    <Card className={`border-t-4 ${tint}`}>
      <CardContent className="p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-xl font-bold text-slate-800 mt-1">{value}</p>
      </CardContent>
    </Card>
  );
}
