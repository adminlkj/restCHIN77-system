import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, ClipboardList, CheckCircle2, AlertTriangle, Clock, Eye } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { MATCH_STATUS } from '@/lib/kitchenOrders';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// شاشة الطلبات — سجل طلبات المطبخ المطبوعة ومطابقتها بالفواتير.
// الهدف الرقابي: كشف التلاعب (طلب 6 أصناف ← فاتورة 3 أصناف) عبر مقارنة
// أصناف الطلب المطبوع بأصناف الفاتورة المرتبطة تلقائياً.
// ═══════════════════════════════════════════════════════════════════════

const STATUS_ICON = {
  PENDING: Clock,
  MATCHED: CheckCircle2,
  MISMATCH: AlertTriangle,
};

export default function Orders() {
  const { lang } = useStore();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [detail, setDetail] = useState(null); // order + linked invoice

  const load = async () => {
    setLoading(true);
    try {
      const list = await base44.entities.KitchenOrder.list('-printedAt', 300);
      setOrders(Array.isArray(list) ? list : []);
    } catch {
      toast.error(t('فشل تحميل الطلبات', 'Failed to load orders', lang));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => orders.filter(o => {
    const q = search.trim().toLowerCase();
    const matchSearch = !q ||
      String(o.orderNo || '').toLowerCase().includes(q) ||
      String(o.invoiceNo || '').toLowerCase().includes(q) ||
      String(o.tableName || '').toLowerCase().includes(q) ||
      String(o.cashier || '').toLowerCase().includes(q);
    return matchSearch && (filterStatus === 'ALL' || o.matchStatus === filterStatus);
  }), [orders, search, filterStatus]);

  const stats = useMemo(() => ({
    total: orders.length,
    pending: orders.filter(o => o.matchStatus === 'PENDING').length,
    matched: orders.filter(o => o.matchStatus === 'MATCHED').length,
    mismatch: orders.filter(o => o.matchStatus === 'MISMATCH').length,
  }), [orders]);

  const openDetail = async (order) => {
    let invoice = null;
    if (order.invoiceId) {
      try { invoice = await base44.entities.SalesInvoice.get(order.invoiceId); } catch { /* ignore */ }
    }
    setDetail({ order, invoice });
  };

  const exportColumns = [
    { header: { ar: 'رقم الطلب', en: 'Order No.' }, value: (r) => r.orderNo },
    { header: { ar: 'الطاولة', en: 'Table' }, value: (r) => r.tableName },
    { header: { ar: 'الكاشير', en: 'Cashier' }, value: (r) => r.cashier },
    { header: { ar: 'الأصناف', en: 'Items' }, value: (r) => r.itemsCount },
    { header: { ar: 'الكميات', en: 'Qty' }, value: (r) => r.totalQty },
    { header: { ar: 'رقم الفاتورة', en: 'Invoice No.' }, value: (r) => r.invoiceNo || '—' },
    { header: { ar: 'حالة المطابقة', en: 'Match Status' }, value: (r) => (MATCH_STATUS[r.matchStatus] ? (lang === 'ar' ? MATCH_STATUS[r.matchStatus].ar : MATCH_STATUS[r.matchStatus].en) : r.matchStatus) },
  ];

  const StatCard = ({ label, value, Icon, cls }) => (
    <Card className={`p-3 flex items-center gap-3 ${cls}`}>
      <Icon className="size-6 shrink-0" />
      <div>
        <div className="text-xl font-bold">{value}</div>
        <div className="text-xs opacity-80">{label}</div>
      </div>
    </Card>
  );

  return (
    <ModuleLayout
      title={t('الطلبات', 'Orders', lang)}
      subtitle={t('سجل طلبات المطبخ المطبوعة ومطابقتها بالفواتير للرقابة', 'Printed kitchen orders reconciled against invoices for control', lang)}
      actions={<TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الطلبات', en: 'Orders' }} />}
    >
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label={t('إجمالي الطلبات', 'Total Orders', lang)} value={stats.total} Icon={ClipboardList} cls="bg-slate-50 text-slate-700" />
        <StatCard label={t('بانتظار فاتورة', 'Awaiting Invoice', lang)} value={stats.pending} Icon={Clock} cls="bg-amber-50 text-amber-700" />
        <StatCard label={t('مطابق', 'Matched', lang)} value={stats.matched} Icon={CheckCircle2} cls="bg-emerald-50 text-emerald-700" />
        <StatCard label={t('متعارض', 'Mismatch', lang)} value={stats.mismatch} Icon={AlertTriangle} cls="bg-rose-50 text-rose-700" />
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث برقم الطلب/الفاتورة/الطاولة/الكاشير...', 'Search order/invoice/table/cashier...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الحالات', 'All Status', lang)}</SelectItem>
            {Object.entries(MATCH_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
        <ClipboardList className="size-4 shrink-0" />
        <span>{t('كل طلب مطبخ مطبوع يُسجَّل هنا برقم فريد، ويُطابَق تلقائياً بالفاتورة عند إتمام البيع لكشف أي فروق في الأصناف أو الكميات.', 'Every printed kitchen order is logged with a unique number and auto-reconciled against its invoice on checkout to expose any item or quantity differences.', lang)}</span>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الطلب', 'Order No.', lang)}</TableHead>
                <TableHead>{t('الوقت', 'Time', lang)}</TableHead>
                <TableHead>{t('الطاولة', 'Table', lang)}</TableHead>
                <TableHead>{t('الكاشير', 'Cashier', lang)}</TableHead>
                <TableHead>{t('الأصناف', 'Items', lang)}</TableHead>
                <TableHead>{t('الكميات', 'Qty', lang)}</TableHead>
                <TableHead>{t('رقم الفاتورة', 'Invoice No.', lang)}</TableHead>
                <TableHead>{t('المطابقة', 'Match', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد طلبات مطبوعة بعد', 'No printed orders yet', lang)}</TableCell></TableRow>
                : filtered.map(o => {
                  const st = MATCH_STATUS[o.matchStatus] || MATCH_STATUS.PENDING;
                  const StatusIcon = STATUS_ICON[o.matchStatus] || Clock;
                  return (
                    <TableRow key={o.id} className={`hover:bg-muted/30 ${o.matchStatus === 'MISMATCH' ? 'bg-rose-50/50' : ''}`}>
                      <TableCell className="font-mono text-xs font-medium">{o.orderNo}</TableCell>
                      <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                        {o.printedAt ? new Date(o.printedAt).toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'}
                      </TableCell>
                      <TableCell className="text-sm">{o.tableName || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{o.cashier || '—'}</TableCell>
                      <TableCell className="text-center">{o.itemsCount}</TableCell>
                      <TableCell className="text-center font-medium">{o.totalQty}</TableCell>
                      <TableCell className="font-mono text-xs">{o.invoiceNo || <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${st.color}`}>
                          <StatusIcon className="size-3" />
                          {lang === 'ar' ? st.ar : st.en}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button variant="ghost" size="sm" className="gap-1.5 h-8" onClick={() => openDetail(o)}>
                          <Eye className="size-3.5" />
                          {t('عرض', 'View', lang)}
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <OrderDetailDialog detail={detail} onClose={() => setDetail(null)} lang={lang} />
    </ModuleLayout>
  );
}

// ─── نافذة تفاصيل الطلب: مقارنة أصناف الطلب بأصناف الفاتورة ───────────────
function OrderDetailDialog({ detail, onClose, lang }) {
  if (!detail) return null;
  const { order, invoice } = detail;
  const st = MATCH_STATUS[order.matchStatus] || MATCH_STATUS.PENDING;

  // أصناف الفاتورة تُخزَّن ضمن notes (JSON) — نقرؤها للمقارنة.
  let invoiceItems = [];
  if (invoice) {
    try {
      const n = typeof invoice.notes === 'string' && invoice.notes.trim().startsWith('{') ? JSON.parse(invoice.notes) : {};
      invoiceItems = Array.isArray(n.items) ? n.items : [];
    } catch { invoiceItems = []; }
  }

  // خريطة كمية الفاتورة لكل صنف (بالمعرّف ثم الاسم)
  const invQtyOf = (it) => {
    const found = invoiceItems.find(x => (x.itemId && x.itemId === it.itemId) || (x.description || x.name) === it.name);
    return found ? (Number(found.qty) || 0) : 0;
  };

  return (
    <Dialog open={!!detail} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-2">
            <span className="font-mono text-base">{order.orderNo}</span>
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border ${st.color}`}>
              {lang === 'ar' ? st.ar : st.en}
            </span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 text-sm">
          <div className="grid grid-cols-2 gap-2 text-xs bg-muted/40 rounded-md p-3">
            <div><span className="text-muted-foreground">{t('الطاولة', 'Table', lang)}: </span>{order.tableName || '—'}</div>
            <div><span className="text-muted-foreground">{t('الكاشير', 'Cashier', lang)}: </span>{order.cashier || '—'}</div>
            <div><span className="text-muted-foreground">{t('وقت الطباعة', 'Printed', lang)}: </span>{order.printedAt ? formatDate(order.printedAt, lang) : '—'}</div>
            <div><span className="text-muted-foreground">{t('رقم الفاتورة', 'Invoice', lang)}: </span>{order.invoiceNo || '—'}</div>
          </div>

          {order.matchStatus === 'MISMATCH' && order.mismatchNote && (
            <div className="flex items-start gap-2 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2.5">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{order.mismatchNote}</span>
            </div>
          )}

          {/* جدول مقارنة الأصناف: كمية الطلب مقابل كمية الفاتورة */}
          <div className="border rounded-md overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('الصنف', 'Item', lang)}</TableHead>
                  <TableHead className="text-center">{t('طلب', 'Order', lang)}</TableHead>
                  <TableHead className="text-center">{t('فاتورة', 'Invoice', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(order.items || []).map((it, i) => {
                  const invQty = invoice ? invQtyOf(it) : null;
                  const diff = invoice && invQty !== it.qty;
                  return (
                    <TableRow key={i} className={diff ? 'bg-rose-50' : ''}>
                      <TableCell className="text-sm">{lang === 'ar' ? it.name : (it.nameEn || it.name)}</TableCell>
                      <TableCell className="text-center font-medium">{it.qty}</TableCell>
                      <TableCell className={`text-center font-medium ${diff ? 'text-rose-700' : ''}`}>
                        {invoice ? invQty : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
          {!invoice && order.invoiceId && (
            <p className="text-xs text-muted-foreground text-center">{t('تعذّر تحميل الفاتورة المرتبطة', 'Could not load linked invoice', lang)}</p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}