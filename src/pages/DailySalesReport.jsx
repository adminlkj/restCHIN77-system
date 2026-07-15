import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, CalendarDays, TrendingUp, ShoppingCart, Receipt as ReceiptIcon } from 'lucide-react';
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

// خريطة طرق الدفع إلى تسمية محلية — تتطابق مع PAYMENT_METHODS في POS.jsx
const PAYMENT_LABELS = {
  CASH:       { ar: 'نقداً',       en: 'Cash' },
  CARD_MADA:  { ar: 'مدى',         en: 'Mada' },
  CARD_VISA:  { ar: 'فيزا',        en: 'Visa' },
  CARD_MC:    { ar: 'ماستركارد',   en: 'Mastercard' },
  CARD_OTHER: { ar: 'بطاقة أخرى',  en: 'Other Card' },
};

function paymentLabel(key, lang) {
  const m = PAYMENT_LABELS[key] || { ar: key || 'أخرى', en: key || 'Other' };
  return lang === 'ar' ? m.ar : m.en;
}

// تقرير المبيعات اليومي: ملخص يوم محدد + توزيع الساعات + تفصيل طرق الدفع.
export default function DailySalesReport() {
  const { lang } = useStore();
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // نحمّل آخر 2000 إيصال ثم نفلتر محلياً حسب التاريخ (لا يوجد فلتر تاريخي على الخادم)
      const all = await base44.entities.SalesInvoice.list('-created_date', 2000);
      const list = (all || []).filter(inv => {
        const d = inv.date ? String(inv.date).slice(0, 10) : '';
        return d === date && inv.status !== 'CANCELLED' && inv.status !== 'DRAFT';
      });
      setInvoices(list);
    } catch (err) {
      console.warn('DailySalesReport load failed:', err);
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // إحصائيات مجمّعة
  const stats = useMemo(() => {
    const totalSales = invoices.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
    const totalVAT = invoices.reduce((s, i) => s + (Number(i.vatAmount) || 0), 0);
    const ordersCount = invoices.length;
    const avgOrder = ordersCount > 0 ? totalSales / ordersCount : 0;
    return { totalSales, totalVAT, ordersCount, avgOrder };
  }, [invoices]);

  // توزيع الساعات (0-23)
  const hourly = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, h) => ({ hour: h, orders: 0, revenue: 0 }));
    invoices.forEach(inv => {
      try {
        const d = inv.date ? new Date(inv.date) : null;
        if (!d || isNaN(d.getTime())) return;
        const h = d.getHours();
        buckets[h].orders += 1;
        buckets[h].revenue += Number(inv.totalAmount) || 0;
      } catch { /* ignore */ }
    });
    return buckets;
  }, [invoices]);

  const maxHourRevenue = Math.max(1, ...hourly.map(b => b.revenue));

  // تفصيل طرق الدفع (من notes.payments)
  const paymentBreakdown = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      let payments = [];
      try {
        const notes = inv.notes ? JSON.parse(inv.notes) : {};
        payments = Array.isArray(notes.payments) ? notes.payments : [];
      } catch { /* ignore */ }
      if (!payments.length) {
        // فاتورة بدون تفصيل دفع في notes — نسجّلها تحت "أخرى"
        const k = 'CARD_OTHER';
        if (!map[k]) map[k] = { key: k, count: 0, amount: 0 };
        map[k].count += 1;
        map[k].amount += Number(inv.paidAmount || inv.totalAmount) || 0;
        return;
      }
      payments.forEach(p => {
        const k = p.method || 'CARD_OTHER';
        if (!map[k]) map[k] = { key: k, count: 0, amount: 0 };
        map[k].count += 1;
        map[k].amount += Number(p.amount) || 0;
      });
    });
    const total = Object.values(map).reduce((s, m) => s + m.amount, 0);
    return Object.values(map)
      .sort((a, b) => b.amount - a.amount)
      .map(m => ({ ...m, percent: total > 0 ? (m.amount / total) * 100 : 0 }));
  }, [invoices]);

  const totalPayments = paymentBreakdown.reduce((s, m) => s + m.amount, 0);

  return (
    <ModuleLayout
      title={t('تقرير المبيعات اليومي', 'Daily Sales Report', lang)}
      subtitle={t('ملخص مبيعات يوم محدد مع توزيع الساعات وطرق الدفع', 'Daily sales summary with hourly breakdown and payment methods', lang)}
      actions={<Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>}
    >
      {/* اختيار التاريخ */}
      <Card className="p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="space-y-1">
            <Label className="text-xs">{t('التاريخ', 'Date', lang)}</Label>
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-44" />
          </div>
          <Button onClick={load} className="gap-2">
            <CalendarDays className="size-4" />
            {t('عرض', 'Show', lang)}
          </Button>
        </div>
      </Card>

      {/* بطاقات الملخص */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <StatCard
          icon={<TrendingUp className="size-5 text-emerald-600" />}
          label={t('إجمالي المبيعات', 'Total Sales', lang)}
          value={formatCurrency(stats.totalSales, lang)}
          tint="border-t-emerald-500"
        />
        <StatCard
          icon={<ShoppingCart className="size-5 text-blue-600" />}
          label={t('عدد الطلبات', 'Orders Count', lang)}
          value={stats.ordersCount}
          tint="border-t-blue-500"
        />
        <StatCard
          icon={<ReceiptIcon className="size-5 text-amber-600" />}
          label={t('متوسط قيمة الطلب', 'Avg. Order Value', lang)}
          value={formatCurrency(stats.avgOrder, lang)}
          tint="border-t-amber-500"
        />
        <StatCard
          icon={<ReceiptIcon className="size-5 text-purple-600" />}
          label={t('إجمالي الضريبة', 'Total VAT', lang)}
          value={formatCurrency(stats.totalVAT, lang)}
          tint="border-t-purple-500"
        />
      </div>

      {/* توزيع الساعات */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold mb-3">{t('توزيع المبيعات حسب الساعة', 'Hourly Sales Distribution', lang)}</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">{t('الساعة', 'Hour', lang)}</TableHead>
                  <TableHead className="text-center">{t('عدد الطلبات', 'Orders', lang)}</TableHead>
                  <TableHead className="text-end">{t('الإيراد', 'Revenue', lang)}</TableHead>
                  <TableHead>{t('النسبة', 'Share', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
                ) : hourly.every(b => b.orders === 0) ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('لا توجد مبيعات في هذا اليوم', 'No sales on this day', lang)}</TableCell></TableRow>
                ) : (
                  hourly.map(b => (
                    <TableRow key={b.hour} className={b.orders === 0 ? 'opacity-40' : ''}>
                      <TableCell className="font-mono font-medium">
                        {String(b.hour).padStart(2, '0')}:00 — {String(b.hour).padStart(2, '0')}:59
                      </TableCell>
                      <TableCell className="text-center">{b.orders}</TableCell>
                      <TableCell className="text-end font-medium">{formatCurrency(b.revenue, lang)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                            <div
                              className="h-full bg-amber-500"
                              style={{ width: `${(b.revenue / maxHourRevenue) * 100}%` }}
                            />
                          </div>
                          <span className="text-xs text-muted-foreground w-10 text-end">
                            {stats.totalSales > 0 ? ((b.revenue / stats.totalSales) * 100).toFixed(1) : '0.0'}%
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* طرق الدفع */}
      <Card>
        <CardContent className="p-4">
          <h3 className="text-sm font-bold mb-3">{t('تفصيل طرق الدفع', 'Payment Methods Breakdown', lang)}</h3>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('طريقة الدفع', 'Method', lang)}</TableHead>
                  <TableHead className="text-center">{t('عدد العمليات', 'Count', lang)}</TableHead>
                  <TableHead className="text-end">{t('المبلغ', 'Amount', lang)}</TableHead>
                  <TableHead className="text-end">{t('النسبة', 'Percent', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paymentBreakdown.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('لا توجد عمليات دفع', 'No payment transactions', lang)}</TableCell></TableRow>
                ) : paymentBreakdown.map(m => (
                  <TableRow key={m.key}>
                    <TableCell className="font-medium">{paymentLabel(m.key, lang)}</TableCell>
                    <TableCell className="text-center">{m.count}</TableCell>
                    <TableCell className="text-end font-medium">{formatCurrency(m.amount, lang)}</TableCell>
                    <TableCell className="text-end text-muted-foreground">{m.percent.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
                {paymentBreakdown.length > 0 && (
                  <TableRow className="bg-muted/30 font-semibold">
                    <TableCell>{t('الإجمالي', 'Total', lang)}</TableCell>
                    <TableCell className="text-center">{paymentBreakdown.reduce((s, m) => s + m.count, 0)}</TableCell>
                    <TableCell className="text-end">{formatCurrency(totalPayments, lang)}</TableCell>
                    <TableCell className="text-end">100%</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </ModuleLayout>
  );
}

function StatCard({ icon, label, value, tint }) {
  return (
    <Card className={`border-t-4 ${tint}`}>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>
        <p className="text-xl font-bold text-slate-800">{value}</p>
      </CardContent>
    </Card>
  );
}
