import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, Pencil, Trash2, RefreshCw, Bike, FileText, DollarSign,
  TrendingUp, Calculator, Eye, Search,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// شاشة منصات التوصيل — إدارة المنصات (هنقرستيشن، كيتا، جاهز…) + كشوفاتها.
// ═══════════════════════════════════════════════════════════════════════

const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

const EMPTY_FORM = {
  code: '', name: '', nameEn: '', commissionRate: 0,
  phone: '', isActive: true, notes: '',
};

export default function DeliveryPlatforms() {
  const { lang } = useStore();

  const [view, setView] = useState('platforms'); // 'platforms' | 'statements'
  const [items, setItems] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  // كشوفات: فلتر نطاق التاريخ + المنصة المختارة لكشف تفصيلي
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [detailPlatform, setDetailPlatform] = useState(null); // { ...platform }
  const [detailOpen, setDetailOpen] = useState(false);
  const [settling, setSettling] = useState(false);

  // ─── تحميل المنصات + الإيصالات ─────────────────────────────────────
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [plats, invs] = await Promise.all([
        base44.entities.DeliveryPlatform.list('-created_date', 500),
        base44.entities.SalesInvoice.list('-created_date', 1000),
      ]);
      setItems(plats || []);
      setInvoices(invs || []);
    } catch (err) {
      console.warn('DeliveryPlatform load failed:', err);
      setItems([]);
      setInvoices([]);
      toast.error(errorMessage(err, t('فشل تحميل البيانات', 'Failed to load', lang)));
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => { load(); }, [load]);

  // ─── فلترة المنصات بالبحث ──────────────────────────────────────────
  const filtered = useMemo(() => {
    if (!search) return items;
    const q = search.toLowerCase();
    return items.filter(p =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.nameEn || '').toLowerCase().includes(q) ||
      (p.code || '').toLowerCase().includes(q)
    );
  }, [items, search]);

  // ─── إجراءات CRUD ──────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      code: nextCodeFromList(items, 'PL'),
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({ ...EMPTY_FORM, ...item });
    setDialogOpen(true);
  };

  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error(t('الرجاء إدخال اسم المنصة', 'Please enter platform name', lang));
      return;
    }
    setSaving(true);
    try {
      const data = {
        code: form.code || nextCodeFromList(items, 'PL'),
        name: form.name.trim(),
        nameEn: (form.nameEn || '').trim(),
        commissionRate: Number(form.commissionRate) || 0,
        phone: form.phone || '',
        isActive: form.isActive !== false,
        notes: form.notes || '',
      };
      if (editing) {
        await base44.entities.DeliveryPlatform.update(editing.id, data);
        toast.success(t('تم تحديث المنصة', 'Platform updated', lang));
      } else {
        await base44.entities.DeliveryPlatform.create(data);
        toast.success(t('تمت إضافة المنصة', 'Platform added', lang));
      }
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang)));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await base44.entities.DeliveryPlatform.delete(deleteId);
      toast.success(t('تم حذف المنصة', 'Platform deleted', lang));
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang)));
    }
  };

  // ─── حسابات كشف المنصة ─────────────────────────────────────────────
  // تطبيق فلتر نطاق التاريخ على الإيصالات (إن وُجد).
  const filterByDate = useCallback((list) => {
    if (!dateFrom && !dateTo) return list;
    return list.filter(inv => {
      const d = inv.date || inv.created_date || '';
      const day = String(d).slice(0, 10);
      if (!day) return false;
      if (dateFrom && day < dateFrom) return false;
      if (dateTo && day > dateTo) return false;
      return true;
    });
  }, [dateFrom, dateTo]);

  // ملخّص كل منصة: { orders, revenue, commission, net, paid, pending }
  const statements = useMemo(() => {
    return items.map(p => {
      const list = filterByDate(
        invoices.filter(i => i.platformId === p.id || i.platformName === p.name)
      );
      const revenue = list.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0);
      const commission = list.reduce((s, i) => s + (Number(i.platformCommission) || 0), 0);
      const net = revenue - commission;
      const paid = list.reduce((s, i) => s + (Number(i.paidAmount) || 0), 0);
      // المعلّق = ما لم يُسدّد بعد (net - paid لكن بحد أدنى 0)
      // نلاحظ: paidAmount قد تشمل قيمة الإيصال كامل (الزبون دفع) لكن العمولة تبقى معلّقة.
      // هنا نعتبر "المعلّق" = صافي المستحق للمطعم - المسدّد من المنصة.
      const pending = Math.max(0, net - paid);
      return {
        platform: p,
        invoices: list,
        orders: list.length,
        revenue,
        commission,
        net,
        paid,
        pending,
      };
    });
  }, [items, invoices, filterByDate]);

  // ملخّص شامل لكل المنصات
  const totals = useMemo(() => {
    return statements.reduce((acc, s) => ({
      orders: acc.orders + s.orders,
      revenue: acc.revenue + s.revenue,
      commission: acc.commission + s.commission,
      net: acc.net + s.net,
      paid: acc.paid + s.paid,
      pending: acc.pending + s.pending,
    }), { orders: 0, revenue: 0, commission: 0, net: 0, paid: 0, pending: 0 });
  }, [statements]);

  // ─── كشف تفصيلي للمنصة ─────────────────────────────────────────────
  const openDetail = (platform) => {
    setDetailPlatform(platform);
    setDetailOpen(true);
  };

  const detailRows = useMemo(() => {
    if (!detailPlatform) return [];
    return filterByDate(
      invoices.filter(i => i.platformId === detailPlatform.id || i.platformName === detailPlatform.name)
    );
  }, [detailPlatform, invoices, filterByDate]);

  // ─── تسوية المنصة: تعليم الإيصالات بأنها مُسدّدة (paidAmount = totalAmount, status PAID) ──
  const settlePlatform = async (platform) => {
    setSettling(true);
    try {
      const list = invoices.filter(i =>
        (i.platformId === platform.id || i.platformName === platform.name) &&
        Number(i.paidAmount || 0) < Number(i.totalAmount || 0)
      );
      if (list.length === 0) {
        toast.info(t('لا توجد إيصالات معلّقة للتسوية', 'No pending invoices to settle', lang));
        return;
      }
      await Promise.all(list.map(inv =>
        base44.entities.SalesInvoice.update(inv.id, {
          paidAmount: Number(inv.totalAmount) || 0,
          status: 'PAID',
          notes: (inv.notes || '') + (inv.notes ? ' | ' : '') + `تمت التسوية مع منصة ${platform.name} بتاريخ ${new Date().toISOString().slice(0, 10)}`,
        })
      ));
      toast.success(t(`تمت تسوية ${list.length} إيصال`, `Settled ${list.length} invoices`, lang));
      load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل التسوية', 'Settlement failed', lang)));
    } finally {
      setSettling(false);
    }
  };

  // ─── أعمدة الطباعة/التصدير للكشوفات ─────────────────────────────────
  const statementExportColumns = [
    { header: { ar: 'المنصة', en: 'Platform' }, value: (r) => r.platform.name },
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.platform.code },
    { header: { ar: 'عدد الطلبات', en: 'Orders' }, value: (r) => r.orders },
    { header: { ar: 'الإيرادات', en: 'Revenue' }, value: (r) => Number(r.revenue).toFixed(2) },
    { header: { ar: 'العمولة', en: 'Commission' }, value: (r) => Number(r.commission).toFixed(2) },
    { header: { ar: 'الصافي', en: 'Net' }, value: (r) => Number(r.net).toFixed(2) },
    { header: { ar: 'المسدّد', en: 'Paid' }, value: (r) => Number(r.paid).toFixed(2) },
    { header: { ar: 'المعلّق', en: 'Pending' }, value: (r) => Number(r.pending).toFixed(2) },
  ];

  return (
    <ModuleLayout
      title={t('منصات التوصيل', 'Delivery Platforms', lang)}
      subtitle={t('إدارة منصات التوصيل وكشوفات العمولات', 'Manage delivery platforms and commission statements', lang)}
      actions={
        <div className="flex items-center gap-2">
          {view === 'platforms' && (
            <Button onClick={openNew} className="gap-2 bg-rose-600 hover:bg-rose-700">
              <Plus className="size-4" /> {t('إضافة منصة', 'Add Platform', lang)}
            </Button>
          )}
          <Button variant="outline" size="icon" onClick={load}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      }
    >
      {/* مبدّل العرض */}
      <div className="inline-flex rounded-lg border bg-muted/40 p-1 gap-1">
        <button
          onClick={() => setView('platforms')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'platforms' ? 'bg-background shadow text-rose-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <Bike className="size-4" /> {t('المنصات', 'Platforms', lang)}
        </button>
        <button
          onClick={() => setView('statements')}
          className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition ${view === 'statements' ? 'bg-background shadow text-rose-700' : 'text-muted-foreground hover:text-foreground'}`}
        >
          <FileText className="size-4" /> {t('كشوفات المنصات', 'Platform Statements', lang)}
        </button>
      </div>

      {/* ══════════════ القسم 1: المنصات (CRUD) ══════════════ */}
      {view === 'platforms' && (
        <>
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder={t('بحث باسم أو كود المنصة...', 'Search by name or code...', lang)}
                className="ps-9"
              />
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Card key={i} className="h-44 bg-muted animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <Card className="py-14 text-center text-muted-foreground">
              <Bike className="size-10 mx-auto mb-3 opacity-40" />
              {t('لا توجد منصات توصيل', 'No delivery platforms', lang)}
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {filtered.map(p => (
                <Card key={p.id} className="overflow-hidden border-t-4 border-t-rose-500">
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="size-9 rounded-lg bg-rose-100 flex items-center justify-center shrink-0">
                          <Bike className="size-5 text-rose-600" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-foreground truncate">{p.name}</div>
                          <div className="text-xs text-muted-foreground" dir="ltr">{p.nameEn || '—'}</div>
                        </div>
                      </div>
                      <Badge variant={p.isActive === false ? 'secondary' : 'default'}
                        className={p.isActive === false
                          ? 'bg-slate-100 text-slate-600 border border-slate-200'
                          : 'bg-emerald-100 text-emerald-700 border border-emerald-200'}>
                        {p.isActive === false
                          ? t('معطّلة', 'Inactive', lang)
                          : t('نشطة', 'Active', lang)}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-muted-foreground">{t('الكود', 'Code', lang)}</div>
                        <div className="font-mono font-semibold" dir="ltr">{p.code}</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('نسبة العمولة', 'Commission', lang)}</div>
                        <div className="font-semibold text-rose-700">{Number(p.commissionRate || 0).toFixed(2)}%</div>
                      </div>
                      <div>
                        <div className="text-muted-foreground">{t('الهاتف', 'Phone', lang)}</div>
                        <div className="font-mono" dir="ltr">{p.phone || '—'}</div>
                      </div>
                    </div>

                    {p.notes && (
                      <p className="text-xs text-muted-foreground bg-muted/40 rounded p-2 line-clamp-2">{p.notes}</p>
                    )}

                    <div className="flex items-center justify-end gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={() => openDetail(p)}>
                        <Eye className="size-3.5" /> {t('كشف', 'Statement', lang)}
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(p)}>
                        <Pencil className="size-3.5" />
                      </Button>
                      <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(p.id)}>
                        <Trash2 className="size-3.5" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
          <p className="text-sm text-muted-foreground">
            {filtered.length} {t('منصة', 'platforms', lang)}
          </p>
        </>
      )}

      {/* ══════════════ القسم 2: كشوفات المنصات ══════════════ */}
      {view === 'statements' && (
        <>
          {/* فلتر نطاق التاريخ */}
          <Card>
            <CardContent className="p-3 flex flex-col sm:flex-row gap-3 sm:items-end">
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">{t('من تاريخ', 'From Date', lang)}</Label>
                <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
              </div>
              <div className="space-y-1.5 flex-1">
                <Label className="text-xs">{t('إلى تاريخ', 'To Date', lang)}</Label>
                <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => { setDateFrom(''); setDateTo(''); }}>
                  {t('مسح الفلتر', 'Clear', lang)}
                </Button>
                <TableToolbar
                  columns={statementExportColumns}
                  rows={statements}
                  title={{ ar: 'كشوفات منصات التوصيل', en: 'Delivery Platform Statements' }}
                  subheading={dateFrom || dateTo
                    ? `${dateFrom || '…'} → ${dateTo || '…'}`
                    : { ar: 'كل الفترات', en: 'All periods' }}
                />
              </div>
            </CardContent>
          </Card>

          {/* بطاقات الملخّص الشامل */}
          <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
            <SummaryCard icon={<FileText className="size-4" />} label={t('إجمالي الطلبات', 'Total Orders', lang)} value={totals.orders} tone="slate" />
            <SummaryCard icon={<TrendingUp className="size-4" />} label={t('الإيرادات', 'Revenue', lang)} value={formatCurrency(totals.revenue, lang)} tone="emerald" />
            <SummaryCard icon={<Calculator className="size-4" />} label={t('العمولات', 'Commissions', lang)} value={formatCurrency(totals.commission, lang)} tone="rose" />
            <SummaryCard icon={<DollarSign className="size-4" />} label={t('الصافي للمطعم', 'Net Payable', lang)} value={formatCurrency(totals.net, lang)} tone="teal" />
            <SummaryCard icon={<DollarSign className="size-4" />} label={t('المسدّد', 'Paid', lang)} value={formatCurrency(totals.paid, lang)} tone="blue" />
            <SummaryCard icon={<DollarSign className="size-4" />} label={t('المعلّق', 'Pending', lang)} value={formatCurrency(totals.pending, lang)} tone="amber" />
          </div>

          {/* جدول الكشوفات */}
          <Card>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('المنصة', 'Platform', lang)}</TableHead>
                  <TableHead className="text-center">{t('الطلبات', 'Orders', lang)}</TableHead>
                  <TableHead className="text-end">{t('الإيرادات', 'Revenue', lang)}</TableHead>
                  <TableHead className="text-end">{t('العمولة', 'Commission', lang)}</TableHead>
                  <TableHead className="text-end">{t('الصافي', 'Net', lang)}</TableHead>
                  <TableHead className="text-end">{t('المسدّد', 'Paid', lang)}</TableHead>
                  <TableHead className="text-end">{t('المعلّق', 'Pending', lang)}</TableHead>
                  <TableHead className="text-center">{t('إجراءات', 'Actions', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t('جاري التحميل...', 'Loading...', lang)}
                    </TableCell>
                  </TableRow>
                ) : statements.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                      {t('لا توجد منصات', 'No platforms', lang)}
                    </TableCell>
                  </TableRow>
                ) : (
                  statements.map(s => (
                    <TableRow key={s.platform.id}>
                      <TableCell>
                        <div className="font-medium">{s.platform.name}</div>
                        <div className="text-[10px] text-muted-foreground font-mono" dir="ltr">{s.platform.code}</div>
                      </TableCell>
                      <TableCell className="text-center font-semibold">{s.orders}</TableCell>
                      <TableCell className="text-end font-mono" dir="ltr">{formatCurrency(s.revenue, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-rose-700" dir="ltr">{formatCurrency(s.commission, lang)}</TableCell>
                      <TableCell className="text-end font-mono font-semibold text-emerald-700" dir="ltr">{formatCurrency(s.net, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-blue-700" dir="ltr">{formatCurrency(s.paid, lang)}</TableCell>
                      <TableCell className={`text-end font-mono ${s.pending > 0 ? 'text-amber-700 font-bold' : 'text-muted-foreground'}`} dir="ltr">
                        {formatCurrency(s.pending, lang)}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="sm" className="gap-1 text-xs" onClick={() => openDetail(s.platform)}>
                            <Eye className="size-3.5" /> {t('كشف', 'Detail', lang)}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="gap-1 text-xs"
                            disabled={settling || s.pending <= 0}
                            onClick={() => settlePlatform(s.platform)}
                          >
                            <DollarSign className="size-3.5" /> {t('تسوية', 'Settle', lang)}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </Card>
        </>
      )}

      {/* ══════════════ نافذة إضافة/تعديل منصة ══════════════ */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>
              {editing ? t('تعديل المنصة', 'Edit Platform', lang) : t('إضافة منصة توصيل', 'Add Delivery Platform', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('الكود', 'Code', lang)}</Label>
              <Input
                value={form.code}
                readOnly
                className="bg-muted font-mono"
                onChange={e => setForm(f => ({ ...f, code: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('نسبة العمولة %', 'Commission Rate %', lang)}</Label>
              <Input
                type="number" min="0" max="100" step="0.01"
                value={form.commissionRate}
                onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('مثال: هنقرستيشن', 'e.g. HungerStation', lang)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label>
              <Input
                value={form.nameEn}
                onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))}
                placeholder="HungerStation"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الهاتف', 'Phone', lang)}</Label>
              <Input
                value={form.phone}
                onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                placeholder="920000001"
                dir="ltr"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch
                  checked={form.isActive !== false}
                  onCheckedChange={(checked) => setForm(f => ({ ...f, isActive: checked }))}
                />
                <span className="text-sm">
                  {form.isActive !== false ? t('نشطة', 'Active', lang) : t('معطّلة', 'Inactive', lang)}
                </span>
              </div>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('ملاحظات', 'Notes', lang)}</Label>
              <Textarea
                value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={2}
                placeholder={t('ملاحظات حول المنصة، شروط العمولة...', 'Platform notes, commission terms...', lang)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={save} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ══════════════ نافذة الكشف التفصيلي ══════════════ */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bike className="size-5 text-rose-600" />
              {t('كشف تفصيلي', 'Detailed Statement', lang)}
              {detailPlatform && (
                <span className="text-muted-foreground font-normal">— {detailPlatform.name}</span>
              )}
            </DialogTitle>
          </DialogHeader>

          {detailPlatform && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
              <DetailStat label={t('عدد الطلبات', 'Orders', lang)} value={detailRows.length} />
              <DetailStat label={t('الإيرادات', 'Revenue', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.totalAmount) || 0), 0), lang)} />
              <DetailStat label={t('العمولة', 'Commission', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.platformCommission) || 0), 0), lang)} />
              <DetailStat label={t('الصافي', 'Net', lang)} value={formatCurrency(detailRows.reduce((s, i) => s + (Number(i.totalAmount) || 0) - (Number(i.platformCommission) || 0), 0), lang)} />
            </div>
          )}

          <div className="max-h-[55vh] overflow-auto border rounded-md">
            <Table>
              <TableHeader className="sticky top-0 bg-background">
                <TableRow>
                  <TableHead>{t('رقم الإيصال', 'Invoice No.', lang)}</TableHead>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                  <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                  <TableHead className="text-end">{t('العمولة', 'Commission', lang)}</TableHead>
                  <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detailRows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      {t('لا توجد إيصالات لهذه المنصة', 'No invoices for this platform', lang)}
                    </TableCell>
                  </TableRow>
                ) : (
                  detailRows.map(inv => (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs" dir="ltr">{inv.invoiceNo || '—'}</TableCell>
                      <TableCell className="text-xs">{formatDate(inv.date || inv.created_date, lang)}</TableCell>
                      <TableCell className="text-xs">{inv.clientName || '—'}</TableCell>
                      <TableCell className="text-end font-mono text-xs" dir="ltr">{formatCurrency(Number(inv.totalAmount) || 0, lang)}</TableCell>
                      <TableCell className="text-end font-mono text-xs text-rose-700" dir="ltr">{formatCurrency(Number(inv.platformCommission) || 0, lang)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary"
                          className={inv.status === 'PAID'
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : inv.status === 'PARTIALLY_PAID'
                              ? 'bg-amber-100 text-amber-700 border border-amber-200'
                              : 'bg-slate-100 text-slate-600 border border-slate-200'}>
                          {inv.status === 'PAID' ? t('مدفوع', 'Paid', lang)
                            : inv.status === 'PARTIALLY_PAID' ? t('جزئي', 'Partial', lang)
                            : inv.status || '—'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOpen(false)}>
              {t('إغلاق', 'Close', lang)}
            </Button>
            {detailPlatform && (
              <Button
                onClick={() => settlePlatform(detailPlatform)}
                disabled={settling}
                className="gap-2 bg-rose-600 hover:bg-rose-700"
              >
                <DollarSign className="size-4" />
                {settling ? t('جاري التسوية...', 'Settling...', lang) : t('تسوية الإيصالات المعلّقة', 'Settle Pending', lang)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('حذف المنصة', 'Delete Platform', lang)}
        description={t(
          'سيتم حذف المنصة نهائياً. لن تُحذف الإيصالات المرتبطة بها. هل أنت متأكد؟',
          'This platform will be permanently deleted. Linked invoices will not be deleted. Are you sure?',
          lang
        )}
        onConfirm={remove}
        confirmLabel={t('حذف', 'Delete', lang)}
      />
    </ModuleLayout>
  );
}

// ─── مكوّنات مساعدة محلية ──────────────────────────────────────────────
function SummaryCard({ icon, label, value, tone = 'slate' }) {
  const tones = {
    slate: 'bg-slate-50 text-slate-700 border-slate-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    rose: 'bg-rose-50 text-rose-700 border-rose-200',
    teal: 'bg-teal-50 text-teal-700 border-teal-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    amber: 'bg-amber-50 text-amber-700 border-amber-200',
  };
  return (
    <Card className={`border ${tones[tone] || tones.slate}`}>
      <CardContent className="p-3">
        <div className="flex items-center gap-1.5 text-[11px] opacity-80 mb-1">
          {icon}
          <span>{label}</span>
        </div>
        <div className="text-base font-bold" dir="ltr">{value}</div>
      </CardContent>
    </Card>
  );
}

function DetailStat({ label, value }) {
  return (
    <div className="rounded-md border bg-muted/30 p-2.5">
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-bold mt-0.5" dir="ltr">{value}</div>
    </div>
  );
}
