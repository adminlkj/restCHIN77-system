import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, TrendingUp, UtensilsCrossed } from 'lucide-react';
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

// تقرير الأصناف الأكثر مبيعاً ضمن فترة زمنية محددة.
// يقرأ قائمة الإيصالات ثم يحلّل notes.items لاستخراج (الكمية، الإيراد، متوسط السعر).
export default function TopItemsReport() {
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
      console.warn('TopItemsReport load failed:', err);
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // تجميع الأصناف من notes.items
  const items = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      let lineItems = [];
      try {
        const notes = inv.notes ? JSON.parse(inv.notes) : {};
        lineItems = Array.isArray(notes.items) ? notes.items : [];
      } catch { /* ignore */ }
      // احتياط: إن لم توجد items في notes نستخدم lineItems على مستوى الفاتورة نفسها
      if (!lineItems.length && Array.isArray(inv.lineItems)) lineItems = inv.lineItems;
      lineItems.forEach(it => {
        const name = it.description || it.name || t('صنف غير مسمى', 'Unnamed item', lang);
        const nameEn = it.descriptionEn || it.nameEn || '';
        const qty = Number(it.qty) || 0;
        const revenue = Number(it.total) || (Number(it.qty) || 0) * (Number(it.unitPrice) || 0);
        if (!map[name]) map[name] = { name, nameEn, qty: 0, revenue: 0 };
        map[name].qty += qty;
        map[name].revenue += revenue;
      });
    });
    return Object.values(map)
      .map(r => ({
        ...r,
        avgPrice: r.qty > 0 ? r.revenue / r.qty : 0,
      }))
      .sort((a, b) => b.qty - a.qty);
  }, [invoices, lang]);

  const totalQty = items.reduce((s, r) => s + r.qty, 0);
  const totalRevenue = items.reduce((s, r) => s + r.revenue, 0);

  // أعلى 10 أصناف للرسم البياني
  const top10 = items.slice(0, 10);
  const chartData = top10.map(r => ({
    name: lang === 'ar' ? r.name : (r.nameEn || r.name),
    qty: r.qty,
    revenue: +r.revenue.toFixed(2),
  }));

  return (
    <ModuleLayout
      title={t('الأصناف الأكثر مبيعاً', 'Top Selling Items', lang)}
      subtitle={t('ترتيب أصناف القائمة حسب الكمية المباعة والإيراد', 'Menu items ranked by quantity sold and revenue', lang)}
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
            <TrendingUp className="size-4" />
            {t('تطبيق', 'Apply', lang)}
          </Button>
        </div>
      </Card>

      {/* بطاقات ملخصة */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('عدد الأصناف المباعة', 'Items Sold', lang)} value={items.length} tint="border-t-emerald-500" />
        <StatCard label={t('إجمالي الكمية', 'Total Quantity', lang)} value={totalQty} tint="border-t-blue-500" />
        <StatCard label={t('إجمالي الإيراد', 'Total Revenue', lang)} value={formatCurrency(totalRevenue, lang)} tint="border-t-amber-500" />
      </div>

      {/* رسم بياني: أعلى 10 أصناف */}
      {chartData.length > 0 && (
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold mb-3">{t('أعلى 10 أصناف (كمية)', 'Top 10 Items (by quantity)', lang)}</h3>
            <div dir="ltr" className="w-full h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} layout="vertical" margin={{ left: 20, right: 20, top: 10, bottom: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                  <Tooltip
                    formatter={(val, name) => name === 'qty' ? [val, t('الكمية', 'Quantity', lang)] : [formatCurrency(val, lang), t('الإيراد', 'Revenue', lang)]}
                  />
                  <Bar dataKey="qty" fill="#f59e0b" radius={[0, 4, 4, 0]} />
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
                <TableHead>{t('الصنف', 'Item', lang)}</TableHead>
                <TableHead className="text-center">{t('الكمية', 'Quantity', lang)}</TableHead>
                <TableHead className="text-end">{t('الإيراد', 'Revenue', lang)}</TableHead>
                <TableHead className="text-end">{t('متوسط السعر', 'Avg. Price', lang)}</TableHead>
                <TableHead className="text-end">{t('نسبة الإيراد', 'Revenue Share', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="py-8 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-12 text-center text-muted-foreground">
                    <UtensilsCrossed className="size-10 mx-auto mb-2 text-muted-foreground/40" />
                    {t('لا توجد مبيعات في الفترة المحددة', 'No sales in the selected period', lang)}
                  </TableCell>
                </TableRow>
              ) : items.map((r, idx) => (
                <TableRow key={`${r.name}-${idx}`} className="hover:bg-muted/30">
                  <TableCell className="text-center font-mono text-muted-foreground">{idx + 1}</TableCell>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    {r.nameEn && <div className="text-xs text-muted-foreground" dir="ltr">{r.nameEn}</div>}
                  </TableCell>
                  <TableCell className="text-center font-semibold">{r.qty}</TableCell>
                  <TableCell className="text-end font-medium">{formatCurrency(r.revenue, lang)}</TableCell>
                  <TableCell className="text-end text-muted-foreground">{formatCurrency(r.avgPrice, lang)}</TableCell>
                  <TableCell className="text-end text-muted-foreground">
                    {totalRevenue > 0 ? ((r.revenue / totalRevenue) * 100).toFixed(1) : '0.0'}%
                  </TableCell>
                </TableRow>
              ))}
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
