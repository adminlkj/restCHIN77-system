import React, { useState, useEffect, useMemo } from 'react';
import {
  TrendingUp, Receipt, UtensilsCrossed, Wallet,
  RefreshCw, ShoppingBag, Users,
  CreditCard, Banknote, Building2,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import { toBusinessDayDate } from '@/lib/businessDay';
import { getBranchTableStats } from '@/lib/tables';

// ─── KPI Card ────────────────────────────────────────────────────────────────
function KPICard({ title, value, subtitle, icon: Icon, tint, onClick }) {
  return (
    <Card
      className={`group relative overflow-hidden border-border/60 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg ${onClick ? 'cursor-pointer' : ''}`}
      onClick={onClick}
    >
      <div className={`absolute -end-6 -top-6 size-20 rounded-full opacity-10 blur-2xl transition-opacity group-hover:opacity-20 ${tint.glow}`} />
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold truncate">{title}</p>
            <p className="text-xl font-bold mt-1.5 text-foreground tabular-nums">{value}</p>
            {subtitle && <p className="text-[11px] text-muted-foreground mt-1">{subtitle}</p>}
          </div>
          <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${tint.bg}`}>
            <Icon className={`size-[18px] ${tint.icon}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Restaurant Dashboard ───────────────────────────────────────────────────
export default function Dashboard() {
  const { lang, setActiveItem, activeProjectId } = useStore();
  const [data, setData] = useState({ invoices: [], menuItems: [], branches: [] });
  const [loading, setLoading] = useState(true);
  const [tableStats, setTableStats] = useState({ total: 0, available: 0, occupied: 0, reserved: 0, cleaning: 0 });

  const load = async () => {
    setLoading(true);
    try {
      const [invoices, menuItems, branches] = await Promise.all([
        base44.entities.SalesInvoice.list('-created_date', 500).catch(() => []),
        base44.entities.InventoryItem.filter({ isActive: true }).catch(() => []),
        base44.entities.Project.filter({ status: 'ACTIVE' }).catch(() => []),
      ]);
      setData({ invoices, menuItems, branches });
      // إحصائيات الطاولات للفرع النشط
      if (activeProjectId) {
        setTableStats(getBranchTableStats(activeProjectId));
      }
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, [activeProjectId]);

  // ─── مشتقات من البيانات ─────────────────────────────────────────────────
  // يوم العمل الحالي (محلي، لا UTC) — فاتورة بعد منتصف الليل تُحتسب في اليوم الصحيح.
  const today = toBusinessDayDate(new Date().toISOString());
  const todayInvoices = useMemo(() => {
    return (data.invoices || []).filter(inv => {
      if (inv.status === 'CANCELLED' || inv.status === 'DRAFT') return false;
      return toBusinessDayDate(inv.date) === today;
    });
  }, [data.invoices, today]);

  const todayRevenue = todayInvoices.reduce((s, i) => s + (i.totalAmount || 0), 0);
  const todayOrdersCount = todayInvoices.length;
  const avgOrderValue = todayOrdersCount > 0 ? todayRevenue / todayOrdersCount : 0;

  // إجمالي الإيرادات (كل الفترة)
  const totalRevenue = (data.invoices || [])
    .filter(i => i.status === 'PAID' || i.status === 'PARTIALLY_PAID')
    .reduce((s, i) => s + (i.totalAmount || 0), 0);

  // أكثر الأصناف مبيعاً (من notes الإيصالات اليوم)
  const topItems = useMemo(() => {
    const itemMap = {};
    todayInvoices.forEach(inv => {
      try {
        const notes = inv.notes ? JSON.parse(inv.notes) : {};
        const items = notes.items || [];
        items.forEach(it => {
          // POS يخزّن الأصناف تحت description (مع name الآن بعد الإصلاح).
          // نأخذ الاسم من أي حقل متاح لتفادي بطاقات بلا اسم.
          const name = it.name || it.description || '—';
          if (!itemMap[name]) itemMap[name] = { name, qty: 0, revenue: 0 };
          itemMap[name].qty += (it.qty || 1);
          itemMap[name].revenue += (it.total || 0);
        });
      } catch { /* ignore */ }
    });
    return Object.values(itemMap).sort((a, b) => b.qty - a.qty).slice(0, 5);
  }, [todayInvoices]);

  // إيرادات حسب طريقة الدفع (اليوم)
  const paymentBreakdown = useMemo(() => {
    const methods = { cash: 0, card_mada: 0, card_visa: 0, card_mc: 0, card_other: 0 };
    todayInvoices.forEach(inv => {
      try {
        const notes = inv.notes ? JSON.parse(inv.notes) : {};
        const payments = notes.payments || [];
        payments.forEach(p => {
          if (methods[p.method] !== undefined) methods[p.method] += (p.amount || 0);
        });
      } catch { /* ignore */ }
    });
    return methods;
  }, [todayInvoices]);

  // إيرادات حسب الفرع
  const branchRevenue = useMemo(() => {
    const branchMap = {};
    todayInvoices.forEach(inv => {
      const name = inv.projectName || 'غير محدد';
      if (!branchMap[name]) branchMap[name] = { name, count: 0, revenue: 0 };
      branchMap[name].count++;
      branchMap[name].revenue += (inv.totalAmount || 0);
    });
    return Object.values(branchMap).sort((a, b) => b.revenue - a.revenue);
  }, [todayInvoices]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t('صباح الخير', 'Good morning', lang);
    if (h < 18) return t('مساء الخير', 'Good afternoon', lang);
    return t('مساء الخير', 'Good evening', lang);
  })();
  const todayLabel = new Date().toLocaleDateString(lang === 'ar' ? 'ar-SA' : 'en-US', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  if (loading) {
    return (
      <div className="p-4 md:p-6 space-y-5">
        <div className="h-32 bg-muted animate-pulse rounded-2xl" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <Card key={i}><CardContent className="p-4"><div className="h-16 bg-muted animate-pulse rounded" /></CardContent></Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* ─── Hero ─────────────────────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-amber-900 text-white shadow-xl">
        <div className="absolute -end-16 -top-16 size-64 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="absolute -start-10 -bottom-20 size-56 rounded-full bg-orange-400/10 blur-3xl" />
        <div className="relative p-5 md:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs text-amber-300/90 font-medium">{greeting} · {todayLabel}</p>
              <h1 className="text-2xl md:text-3xl font-bold mt-1">{t('لوحة المبيعات', 'Sales Dashboard', lang)}</h1>
              <p className="text-sm text-slate-300 mt-1">{t('نظرة فورية على مبيعات المطعم اليوم', "Today's restaurant sales overview", lang)}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={load} className="text-white hover:bg-white/10 hover:text-white shrink-0">
              <RefreshCw className="size-4" />
            </Button>
          </div>

          {/* Live sales strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            <div className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3">
              <p className="text-[11px] text-slate-300">{t('مبيعات اليوم', "Today's Sales", lang)}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{formatCurrency(todayRevenue, lang)}</p>
            </div>
            <div className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3">
              <p className="text-[11px] text-slate-300">{t('عدد الإيصالات', 'Receipts Count', lang)}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{todayOrdersCount}</p>
            </div>
            <div className="rounded-xl bg-white/5 backdrop-blur-sm border border-white/10 p-3">
              <p className="text-[11px] text-slate-300">{t('متوسط الإيصال', 'Avg Receipt', lang)}</p>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{formatCurrency(avgOrderValue, lang)}</p>
            </div>
            <div className="rounded-xl bg-amber-500/15 backdrop-blur-sm border border-amber-400/30 p-3">
              <div className="flex items-center justify-between">
                <p className="text-[11px] text-amber-200">{t('طاولات نشطة', 'Active Tables', lang)}</p>
                <UtensilsCrossed className="size-3.5 text-amber-300" />
              </div>
              <p className="text-lg font-bold mt-0.5 tabular-nums">{tableStats.occupied} / {tableStats.total}</p>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Quick Actions ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {[
          { key: 'pos', ar: 'نقطة البيع', en: 'POS', icon: ShoppingBag, color: 'bg-amber-100 text-amber-700' },
          { key: 'tables', ar: 'الطاولات', en: 'Tables', icon: UtensilsCrossed, color: 'bg-emerald-100 text-emerald-700' },
          { key: 'branches', ar: 'الفروع', en: 'Branches', icon: Building2, color: 'bg-blue-100 text-blue-700' },
          { key: 'sales', ar: 'الإيصالات', en: 'Receipts', icon: Receipt, color: 'bg-teal-100 text-teal-700' },
          { key: 'clients', ar: 'الزبائن', en: 'Customers', icon: Users, color: 'bg-violet-100 text-violet-700' },
          { key: 'reports-cycle', ar: 'التقارير', en: 'Reports', icon: TrendingUp, color: 'bg-rose-100 text-rose-700' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setActiveItem(item.key)}
            className="flex flex-col items-center gap-2 p-4 rounded-xl border border-border/60 bg-card hover:bg-muted/40 transition-all hover:-translate-y-0.5 hover:shadow-md"
          >
            <div className={`size-12 rounded-xl flex items-center justify-center ${item.color}`}>
              <item.icon className="size-6" />
            </div>
            <span className="text-sm font-semibold">{lang === 'ar' ? item.ar : item.en}</span>
          </button>
        ))}
      </div>

      {/* ─── KPI Grid ──────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KPICard
          title={t('مبيعات اليوم', "Today's Sales", lang)}
          value={formatCurrency(todayRevenue, lang)}
          subtitle={`${todayOrdersCount} ${t('إيصال', 'receipts', lang)}`}
          icon={Wallet} tint={{ bg: 'bg-emerald-100', icon: 'text-emerald-600', glow: 'bg-emerald-500' }}
          onClick={() => setActiveItem('sales')}
        />
        <KPICard
          title={t('إجمالي الإيرادات', 'Total Revenue', lang)}
          value={formatCurrency(totalRevenue, lang)}
          subtitle={t('كل الفترات', 'All time', lang)}
          icon={TrendingUp} tint={{ bg: 'bg-teal-100', icon: 'text-teal-600', glow: 'bg-teal-500' }}
        />
        <KPICard
          title={t('طاولات مشغولة', 'Occupied Tables', lang)}
          value={`${tableStats.occupied} / ${tableStats.total}`}
          subtitle={`${tableStats.available} ${t('متاحة', 'available', lang)}`}
          icon={UtensilsCrossed} tint={{ bg: 'bg-amber-100', icon: 'text-amber-600', glow: 'bg-amber-500' }}
          onClick={() => setActiveItem('tables')}
        />
        <KPICard
          title={t('أصناف القائمة', 'Menu Items', lang)}
          value={data.menuItems.length}
          subtitle={t('نشطة', 'active', lang)}
          icon={Receipt} tint={{ bg: 'bg-rose-100', icon: 'text-rose-600', glow: 'bg-rose-500' }}
          onClick={() => setActiveItem('inventory')}
        />
      </div>

      {/* ─── Today's breakdown ─────────────────────────────────────────────── */}
      <div className="grid lg:grid-cols-3 gap-4">

        {/* Top selling items today */}
        <Card className="lg:col-span-2 border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-amber-100 flex items-center justify-center">
                  <Receipt className="size-4 text-amber-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('الأكثر مبيعاً اليوم', 'Top Selling Today', lang)}</p>
                  <p className="text-[11px] text-muted-foreground">{topItems.length} {t('أصناف', 'items', lang)}</p>
                </div>
              </div>
              <button onClick={() => setActiveItem('inventory')} className="text-xs font-medium text-amber-600 hover:text-amber-700">
                {t('عرض الكل', 'View all', lang)}
              </button>
            </div>

            {topItems.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                {t('لا توجد مبيعات اليوم بعد', 'No sales yet today', lang)}
              </div>
            ) : (
              <div className="space-y-2">
                {topItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 bg-card px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <div className="size-8 rounded-lg bg-amber-50 flex items-center justify-center text-amber-700 font-bold text-xs">
                        #{i + 1}
                      </div>
                      <div>
                        <p className="font-medium text-sm">{item.name}</p>
                        <p className="text-[11px] text-muted-foreground">{item.qty} {t('قطعة', 'pcs', lang)}</p>
                      </div>
                    </div>
                    <span className="font-semibold text-sm tabular-nums">{formatCurrency(item.revenue, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Payment methods breakdown */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="size-8 rounded-lg bg-emerald-100 flex items-center justify-center">
                <CreditCard className="size-4 text-emerald-600" />
              </div>
              <p className="text-sm font-semibold">{t('طرق الدفع اليوم', "Today's Payments", lang)}</p>
            </div>
            <div className="space-y-2">
              {[
                { key: 'cash', ar: 'نقداً', en: 'Cash', icon: Banknote, color: 'text-emerald-600 bg-emerald-50' },
                { key: 'card_mada', ar: 'مدى', en: 'Mada', icon: CreditCard, color: 'text-green-600 bg-green-50' },
                { key: 'card_visa', ar: 'فيزا', en: 'Visa', icon: CreditCard, color: 'text-blue-600 bg-blue-50' },
                { key: 'card_mc', ar: 'ماستركارد', en: 'Mastercard', icon: CreditCard, color: 'text-orange-600 bg-orange-50' },
                { key: 'card_other', ar: 'أخرى', en: 'Other', icon: CreditCard, color: 'text-slate-600 bg-slate-50' },
              ].map(m => (
                <div key={m.key} className="flex items-center justify-between rounded-lg px-3 py-2 bg-muted/30">
                  <div className="flex items-center gap-2">
                    <div className={`size-7 rounded-md flex items-center justify-center ${m.color}`}>
                      <m.icon className="size-3.5" />
                    </div>
                    <span className="text-xs font-medium">{lang === 'ar' ? m.ar : m.en}</span>
                  </div>
                  <span className="font-semibold text-sm tabular-nums">{formatCurrency(paymentBreakdown[m.key] || 0 || 0, lang)}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ─── Branch revenue + recent receipts ──────────────────────────────── */}
      <div className="grid lg:grid-cols-2 gap-4">

        {/* Branch revenue today */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-blue-100 flex items-center justify-center">
                  <Building2 className="size-4 text-blue-600" />
                </div>
                <p className="text-sm font-semibold">{t('مبيعات الفروع اليوم', 'Branch Sales Today', lang)}</p>
              </div>
              <button onClick={() => setActiveItem('branches')} className="text-xs font-medium text-blue-600 hover:text-blue-700">
                {t('الفروع', 'Branches', lang)}
              </button>
            </div>
            {branchRevenue.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {t('لا توجد مبيعات اليوم', 'No sales today', lang)}
              </div>
            ) : (
              <div className="space-y-2">
                {branchRevenue.map((b, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="size-2 rounded-full bg-emerald-500" />
                      <span className="font-medium text-sm">{b.name}</span>
                      <span className="text-[11px] text-muted-foreground">({b.count} {t('إيصال', 'rec', lang)})</span>
                    </div>
                    <span className="font-semibold text-sm tabular-nums">{formatCurrency(b.revenue, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent receipts */}
        <Card className="border-border/60">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <div className="size-8 rounded-lg bg-teal-100 flex items-center justify-center">
                  <Receipt className="size-4 text-teal-600" />
                </div>
                <p className="text-sm font-semibold">{t('أحدث الإيصالات', 'Recent Receipts', lang)}</p>
              </div>
              <button onClick={() => setActiveItem('sales')} className="text-xs font-medium text-teal-600 hover:text-teal-700">
                {t('الكل', 'All', lang)}
              </button>
            </div>
            {(data.invoices || []).slice(0, 5).length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">
                {t('لا توجد إيصالات', 'No receipts', lang)}
              </div>
            ) : (
              <div className="space-y-1.5">
                {(data.invoices || []).slice(0, 5).map(inv => (
                  <div key={inv.id} className="flex items-center justify-between text-xs rounded-lg px-3 py-2 bg-muted/30">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-semibold">{inv.invoiceNo}</span>
                      <span className="text-muted-foreground">{inv.clientName || (lang === 'ar' ? 'زبون' : 'Customer')}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold tabular-nums">{formatCurrency(inv.totalAmount || 0, lang)}</span>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${inv.status === 'PAID' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'}`}>
                        {inv.status === 'PAID' ? (lang === 'ar' ? 'مدفوع' : 'Paid') : (lang === 'ar' ? 'مسودة' : 'Draft')}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
