import React, { useEffect, useMemo, useState } from 'react';
import { RefreshCw, Wallet, CreditCard, Banknote } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
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

// خريطة طرق الدفع — تتطابق مع PAYMENT_METHODS في POS.jsx
const PAYMENT_META = {
  CASH:       { ar: 'نقداً',       en: 'Cash',       color: '#10b981', Icon: Banknote },
  CARD_MADA:  { ar: 'مدى',         en: 'Mada',       color: '#22c55e', Icon: CreditCard },
  CARD_VISA:  { ar: 'فيزا',        en: 'Visa',       color: '#3b82f6', Icon: CreditCard },
  CARD_MC:    { ar: 'ماستركارد',   en: 'Mastercard', color: '#f97316', Icon: CreditCard },
  CARD_OTHER: { ar: 'بطاقة أخرى',  en: 'Other Card', color: '#64748b', Icon: CreditCard },
};

function methodMeta(key) {
  return PAYMENT_META[key] || { ar: key || 'أخرى', en: key || 'Other', color: '#94a3b8', Icon: Wallet };
}

// تقرير طرق الدفع ضمن فترة محددة — يجمع المبالغ من notes.payments.
export default function PaymentsReport() {
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
      console.warn('PaymentsReport load failed:', err);
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const breakdown = useMemo(() => {
    const map = {};
    invoices.forEach(inv => {
      let payments = [];
      try {
        const notes = inv.notes ? JSON.parse(inv.notes) : {};
        payments = Array.isArray(notes.payments) ? notes.payments : [];
      } catch { /* ignore */ }
      if (!payments.length) {
        // فاتورة بلا تفصيل دفع في notes — نُسجّلها تحت CARD_OTHER كقيمة احتياطية
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

  const totalAmount = breakdown.reduce((s, m) => s + m.amount, 0);
  const totalCount = breakdown.reduce((s, m) => s + m.count, 0);

  // بيانات الرسم البياني الدائري
  const pieData = breakdown.map(m => ({
    name: lang === 'ar' ? methodMeta(m.key).ar : methodMeta(m.key).en,
    value: +m.amount.toFixed(2),
    color: methodMeta(m.key).color,
  }));

  return (
    <ModuleLayout
      title={t('تقرير طرق الدفع', 'Payment Methods Report', lang)}
      subtitle={t('توزيع التحصيلات حسب طريقة الدفع (نقداً / مدى / فيزا / ماستركارد)', 'Payments breakdown by method (Cash / Mada / Visa / Mastercard)', lang)}
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
            <Wallet className="size-4" />
            {t('تطبيق', 'Apply', lang)}
          </Button>
        </div>
      </Card>

      {/* بطاقات ملخصة */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <StatCard label={t('إجمالي التحصيل', 'Total Collected', lang)} value={formatCurrency(totalAmount, lang)} tint="border-t-emerald-500" />
        <StatCard label={t('عدد العمليات', 'Transactions', lang)} value={totalCount} tint="border-t-blue-500" />
        <StatCard label={t('عدد طرق الدفع المستخدمة', 'Methods Used', lang)} value={breakdown.length} tint="border-t-amber-500" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* الرسم الدائري */}
        <Card>
          <CardContent className="p-4">
            <h3 className="text-sm font-bold mb-3">{t('توزيع المبالغ', 'Amount Distribution', lang)}</h3>
            {pieData.length === 0 ? (
              <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
                {t('لا توجد بيانات', 'No data', lang)}
              </div>
            ) : (
              <div dir="ltr" className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      innerRadius={40}
                      label={({ percent }) => `${(percent * 100).toFixed(0)}%`}
                      labelLine={false}
                    >
                      {pieData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(val) => formatCurrency(val, lang)} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            )}
          </CardContent>
        </Card>

        {/* جدول التفصيل */}
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('طريقة الدفع', 'Method', lang)}</TableHead>
                  <TableHead className="text-center">{t('العمليات', 'Count', lang)}</TableHead>
                  <TableHead className="text-end">{t('المبلغ', 'Amount', lang)}</TableHead>
                  <TableHead className="text-end">{t('النسبة', 'Percent', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
                ) : breakdown.length === 0 ? (
                  <TableRow><TableCell colSpan={4} className="py-12 text-center text-muted-foreground">{t('لا توجد عمليات دفع في الفترة', 'No payments in the period', lang)}</TableCell></TableRow>
                ) : (
                  <>
                    {breakdown.map(m => {
                      const meta = methodMeta(m.key);
                      const MIcon = meta.Icon;
                      return (
                        <TableRow key={m.key} className="hover:bg-muted/30">
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <span
                                className="size-7 rounded-full flex items-center justify-center text-white"
                                style={{ background: meta.color }}
                              >
                                <MIcon className="size-3.5" />
                              </span>
                              <span className="font-medium">{lang === 'ar' ? meta.ar : meta.en}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-center">{m.count}</TableCell>
                          <TableCell className="text-end font-medium">{formatCurrency(m.amount, lang)}</TableCell>
                          <TableCell className="text-end text-muted-foreground">{m.percent.toFixed(1)}%</TableCell>
                        </TableRow>
                      );
                    })}
                    <TableRow className="bg-muted/30 font-semibold">
                      <TableCell>{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell className="text-center">{totalCount}</TableCell>
                      <TableCell className="text-end">{formatCurrency(totalAmount, lang)}</TableCell>
                      <TableCell className="text-end">100%</TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
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
