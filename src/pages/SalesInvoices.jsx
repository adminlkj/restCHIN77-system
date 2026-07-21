import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, Printer, CheckCircle2, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { t, formatCurrency, formatDate, genInvoiceNo, INVOICE_STATUS } from '@/lib/utils-binaa';
import { calcVAT, resolveVatRate, OperationEngine } from '@/lib/businessEngine';
import { audit, AUDIT_ACTIONS } from '@/lib/auditLogger';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import ReceiptPrintDialog from '@/components/shared/ReceiptPrintDialog';
import { toast } from 'sonner';

// Escape a literal string for safe use as a RegExp source (prevents regex injection
// from user-entered invoice numbers when filtering JournalEntry.entryNo via $regex).
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const TYPES = {
  CONSTRUCTION: { ar: 'صالة',     en: 'Dine-in' },
  SERVICE:      { ar: 'توصيل',  en: 'Delivery' },
  RENTAL:       { ar: 'حجز',    en: 'Reservation' },
};
const empty = {
  invoiceNo: '', invoiceType: 'CONSTRUCTION',
  projectId: '', projectName: '', clientId: '', clientName: '',
  date: '', dueDate: '', subtotal: '', vatRate: '0.15',
  paidAmount: '', status: 'DRAFT', description: '', notes: '',
};

export default function SalesInvoices() {
  const { lang, activeProjectId, activeProjectName, activeClientId, activeClientName } = useStore();
  const { user } = useAuth();
  const [items, setItems]       = useState([]);
  const [projects, setProjects] = useState([]);
  const [clients, setClients]   = useState([]);
  const [printInvoice, setPrintInvoice] = useState(null);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteId, setDeleteId]         = useState(null);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(empty);
  const [saving, setSaving]             = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, p, c] = await Promise.all([
        base44.entities.SalesInvoice.list('-created_date', 200),
        base44.entities.Project.list(),
        base44.entities.Client.list(),
      ]);
      setItems(inv); setProjects(p); setClients(c);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // تطبيق سياق الطلب/الزبون تلقائياً عند فتح نموذج جديد + ترقيم تلقائي INV-YYYY-0001
  const buildDefaultForm = () => ({
    ...empty,
    invoiceNo:   genInvoiceNo('INV', new Date().getFullYear(), items.length + 1),
    projectId:   activeProjectId   || '',
    projectName: activeProjectName || '',
    clientId:    activeClientId    || '',
    clientName:  activeClientName  || '',
  });

  // معاينة وطباعة الإيصال.
  const openPrint = (item) => {
    setPrintInvoice(item);
  };

  const filtered = items.filter(i => {
    const match = !search || i.invoiceNo?.toLowerCase().includes(search.toLowerCase()) || i.clientName?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew  = () => { setEditing(null); setForm(buildDefaultForm()); setDialogOpen(true); };
  const openEdit = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن تعديل إيصال معتمد', 'Cannot edit an approved receipt', lang));
    setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true);
  };
  const askDelete = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن حذف إيصال معتمد — قيده مُرحّل', 'Cannot delete an approved receipt — its entry is posted', lang));
    setDeleteId(item.id); setConfirmOpen(true);
  };

  // اعتماد الفاتورة: يرحّل قيد الإيراد ويحوّلها من مسودة إلى معتمدة.
  const [approvingId, setApprovingId] = useState(null);
  const [reversingId, setReversingId] = useState(null);

  const approve = async (item) => {
    setApprovingId(item.id);
    try {
      await OperationEngine.approveSalesInvoice(item.id);
      toast.success(t('تم اعتماد الإيصال وترحيل قيد الإيراد', 'Receipt approved & revenue posted', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل الاعتماد', 'Approval failed', lang)); }
    setApprovingId(null);
  };

  const reverse = async (item) => {
    if (item.paidAmount && Number(item.paidAmount) > 0)
      return toast.error(t('لا يمكن عكس إيصال عليه مدفوعات — اعكس المدفوعات أولاً', 'Cannot reverse a receipt with payments — reverse payments first', lang));
    setReversingId(item.id);
    try {
      // Server-side filter by sourceType + entryNo $regex replaces the prior unbounded
      // `filter({ isPosted: true })` (N+1 fix: cuts payload from "all posted JEs" to
      // just the SalesInvoice JEs whose entryNo contains this invoiceNo).
      const jes = await base44.entities.JournalEntry.filter({
        isPosted: true,
        sourceType: 'SalesInvoice',
        entryNo: { $regex: escapeRegex(item.invoiceNo) },
      }, '-date', 50);
      if (jes.length === 0) throw new Error(t('لا يوجد قيد مرتبط بهذا الإيصال', 'No linked journal entry found', lang));
      // مطابقة دقيقة لتفادي عكس قيد خاطئ (INV-1 قد يُطابق INV-10 عبر $regex).
      const exactSuffix = `-${item.invoiceNo}`;
      let orig = jes.find(j => j.entryNo && j.entryNo.endsWith(exactSuffix));
      if (!orig) orig = jes[0];
      const revNo = `${orig.entryNo}-REV-1`;
      const revLines = (orig.lines || []).map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));
      await base44.entities.JournalEntry.create({
        entryNo: revNo,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس ${orig.entryNo} — إيصال ${item.invoiceNo}`,
        lines: revLines,
        totalDebit: orig.totalCredit, totalCredit: orig.totalDebit,
        isPosted: true,
        sourceType: 'REVERSAL',
      });
      await base44.entities.SalesInvoice.update(item.id, { status: 'CANCELLED' });
      // سجّل العكس في سجل التدقيق — هذا حدث مالي حسّاس يجب توثيقه بـ who/what/when.
      await audit.sale(
        user,
        { id: item.id, invoiceNo: item.invoiceNo, totalAmount: item.totalAmount, projectId: item.projectId, projectName: item.projectName },
        { id: item.projectId, name: item.projectName },
        AUDIT_ACTIONS.SALE_REVERSE,
        'WARNING',
        { reversedEntry: revNo, originalEntry: orig.entryNo, amount: Number(item.totalAmount) || 0 }
      ).catch(() => {});
      toast.success(t('تم عكس الإيصال وإنشاء قيد عكسي', 'Receipt reversed & reversal entry created', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل العكس', 'Reversal failed', lang)); }
    setReversingId(null);
  };

  // الحسابات تأتي من Business Engine — SSOT.
  // resolveVatRate تحترم نسبة 0% (صفرية الضريبة) بدلاً من إسقاطها إلى 0.15.
  const { vat: vatAmount, total: totalAmount } = calcVAT(form.subtotal, resolveVatRate(form.vatRate));

  const save = async () => {
    if (!form.invoiceNo || !form.clientId)
      return toast.error(t('رقم الإيصال والزبون مطلوبان', 'Receipt No. and customer required', lang));
    if (form.date && form.dueDate && form.dueDate < form.date)
      return toast.error(t('تاريخ الاستحقاق يجب أن يكون بعد تاريخ الإيصال', 'Due date must be after receipt date', lang));
    setSaving(true);
    try {
      if (editing) {
        await OperationEngine.updateSalesInvoice(editing.id, form, projects, clients, editing.status);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await OperationEngine.createSalesInvoice({ ...form, status: 'DRAFT' }, projects, clients);
        toast.success(t('تمت الإضافة كمسودة — اعتمدها لاحقاً لترحيل القيد', 'Added as draft — approve later to post', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.SalesInvoice.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  // الإيراد = صافي المبيعات قبل الضريبة لكل الفواتير المعتمدة (وليست المدفوعة فقط)
  const recognizedStatuses = ['APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
  const totalRevenue = filtered.filter(i => recognizedStatuses.includes(i.status)).reduce((s, i) => s + (i.subtotal || 0), 0);
  const totalPending = filtered.filter(i => ['SENT','PARTIALLY_PAID','OVERDUE'].includes(i.status)).reduce((s, i) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0);

  const exportColumns = [
    { header: { ar: 'رقم الإيصال', en: 'Receipt No' }, value: (r) => r.invoiceNo },
    { header: { ar: 'الزبون', en: 'Customer' }, value: (r) => r.clientName },
    { header: { ar: 'الطلب', en: 'Order' }, value: (r) => r.projectName },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الإجمالي', en: 'Total' }, value: (r) => r.totalAmount || 0 },
    { header: { ar: 'المدفوع', en: 'Paid' }, value: (r) => r.paidAmount || 0 },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = INVOICE_STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('إيصالات البيع', 'Sales Receipts', lang)}
      subtitle={t('إدارة إيصالات الصالة والتوصيل والحجوزات', 'Manage dine-in, delivery and reservation receipts', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'إيصالات البيع', en: 'Sales Receipts' }} />
          <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('إيصال جديد', 'New Receipt', lang)}</Button>
        </div>
      }
    >
      {/* Status cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(INVOICE_STATUS).map(([s, cfg]) => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'ALL' : s)}
            className={`p-3 rounded-xl border text-center transition-all ${filterStatus === s ? 'ring-2 ring-primary' : 'hover:bg-muted/50'}`}>
            <p className="text-xl font-bold">{items.filter(i => i.status === s).length}</p>
            <p className={`text-xs font-medium mt-0.5 inline-flex px-1.5 py-0.5 rounded-full ${cfg.color}`}>{lang === 'ar' ? cfg.ar : cfg.en}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
            {Object.entries(INVOICE_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الإيصال', 'Receipt No.', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('المدفوع', 'Paid', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد إيصالات', 'No receipts', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = INVOICE_STATUS[item.status] || INVOICE_STATUS.DRAFT;
                    // استخراج نوع البيع من notes (saleType) لعرض شارة واضحة
                    let saleType = '';
                    let platformName = '';
                    try {
                      const notes = item.notes ? JSON.parse(item.notes) : {};
                      saleType = notes.saleType || '';
                      platformName = notes.platform?.platformName || item.platformName || '';
                    } catch { /* ignore */ }
                    // القاعدة الثابتة: البيع الآجل حصري للمنصات فقط. لا يوجد نوع بيع "CREDIT"
                    // للصالة — الفواتير القديمة الموسومة CREDIT هي مبيعات صالة مدفوعة فوراً،
                    // فتُعرض كـ"صالة" (لا "آجل").
                    const SALE_TYPE_BADGE = {
                      DINE_IN:          { ar: 'صالة',          en: 'Dine-in',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                      CREDIT:           { ar: 'صالة',          en: 'Dine-in',          cls: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
                      TAKEAWAY:         { ar: 'استلام',        en: 'Takeaway',          cls: 'bg-blue-100 text-blue-700 border-blue-200' },
                      DIRECT_DELIVERY:  { ar: 'توصيل مباشر',   en: 'Direct Delivery',   cls: 'bg-cyan-100 text-cyan-700 border-cyan-200' },
                      PLATFORM:         { ar: platformName || 'منصة', en: platformName || 'Platform', cls: 'bg-rose-100 text-rose-700 border-rose-200' },
                    };
                    const badge = saleType ? (SALE_TYPE_BADGE[saleType] || null) : null;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.invoiceNo}</TableCell>
                        <TableCell>
                          {badge ? (
                            <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}>
                              {lang === 'ar' ? badge.ar : badge.en}
                            </span>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="font-medium">{item.clientName || '—'}</TableCell>
                        <TableCell className="text-sm">{item.projectName || '—'}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.totalAmount, lang)}</TableCell>
                        <TableCell className="text-sm">{formatCurrency(item.paidAmount, lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            {item.status === 'DRAFT' && (
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={approvingId === item.id} onClick={() => approve(item)}>
                                <CheckCircle2 className="size-3.5" />{approvingId === item.id ? t('جارٍ...', '...', lang) : t('اعتماد', 'Approve', lang)}
                              </Button>
                            )}
                            {['APPROVED','SENT','PARTIALLY_PAID','OVERDUE'].includes(item.status) && (
                              <Button variant="ghost" size="icon" className="size-8 text-amber-600" title={t('عكس', 'Reverse', lang)} disabled={reversingId === item.id} onClick={() => reverse(item)}>
                                <RotateCcw className="size-3.5" />
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="size-8" title={t('معاينة وطباعة', 'Preview & Print', lang)} onClick={() => openPrint(item)}><Printer className="size-3.5" /></Button>
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item)}><Trash2 className="size-3.5" /></Button>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <div className="flex gap-4 text-sm text-muted-foreground">
        <span>{t('محصل', 'Collected', lang)}: <strong className="text-emerald-600">{formatCurrency(totalRevenue, lang)}</strong></span>
        <span>{t('معلق', 'Pending', lang)}: <strong className="text-amber-600">{formatCurrency(totalPending, lang)}</strong></span>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل الإيصال', 'Edit Receipt', lang) : t('إيصال جديد', 'New Receipt', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم الإيصال', 'Receipt No.', lang)} *</Label><Input value={form.invoiceNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('نوع الإيصال', 'Receipt Type', lang)}</Label>
              <Select value={form.invoiceType} onValueChange={v => setForm(f => ({ ...f, invoiceType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الزبون', 'Customer', lang)} *</Label>
              <Select value={form.clientId} onValueChange={v => { const c = clients.find(c => c.id === v); setForm(f => ({ ...f, clientId: v, clientName: c?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر زبون', 'Select customer', lang)} /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الطلب', 'Order', lang)}</Label>
              <Select value={form.projectId} onValueChange={v => { const p = projects.find(p => p.id === v); setForm(f => ({ ...f, projectId: v, projectName: p?.name || '', clientId: p?.clientId || f.clientId, clientName: p?.clientName || f.clientName })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر طلب', 'Select order', lang)} /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5"><Label>{t('تاريخ الإيصال', 'Receipt Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الاستحقاق', 'Due Date', lang)}</Label><Input type="date" value={form.dueDate} min={form.date || undefined} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ قبل الضريبة', 'Subtotal', lang)}</Label><Input type="number" value={form.subtotal} onChange={e => setForm(f => ({ ...f, subtotal: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('نسبة الضريبة', 'VAT Rate', lang)}</Label>
              <Select value={String(form.vatRate)} onValueChange={v => setForm(f => ({ ...f, vatRate: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="0">0%</SelectItem>
                  <SelectItem value="0.05">5%</SelectItem>
                  <SelectItem value="0.15">15%</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('مبلغ الضريبة', 'VAT Amount', lang)}</Label><Input readOnly value={vatAmount.toFixed(2)} className="bg-muted" /></div>
            <div className="space-y-1.5"><Label>{t('الإجمالي', 'Total Amount', lang)}</Label><Input readOnly value={totalAmount.toFixed(2)} className="bg-muted font-bold" /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ المدفوع', 'Paid Amount', lang)}</Label><Input type="number" value={form.paidAmount} readOnly className="bg-muted" /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ كمسودة', 'Save as Draft', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الإيصال', 'Delete Receipt', lang)}
        description={t('سيتم حذف الإيصال نهائياً.', 'This receipt will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      {printInvoice && (
        <ReceiptPrintDialog
          key={printInvoice.id}
          open={true}
          onOpenChange={o => !o && setPrintInvoice(null)}
          invoice={printInvoice}
        />
      )}
    </ModuleLayout>
  );
}