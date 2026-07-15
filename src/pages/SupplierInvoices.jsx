import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle2, Paperclip, RotateCcw, Printer } from 'lucide-react';
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
import { t, formatCurrency, formatDate, STATUS_TONE, genInvoiceNo } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import SupplierInvoiceDocument from '@/components/shared/SupplierInvoiceDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import TableToolbar from '@/components/shared/TableToolbar';
import InvoiceAttachmentField from '@/components/shared/InvoiceAttachmentField';
import FilePreviewDialog from '@/components/shared/FilePreviewDialog';
import { OperationEngine } from '@/lib/businessEngine';
import { toast } from 'sonner';

const STATUS = {
  DRAFT:          { ar: 'مسودة',       en: 'Draft',        color: STATUS_TONE.NEUTRAL },
  APPROVED:       { ar: 'معتمدة',      en: 'Approved',     color: STATUS_TONE.INFO },
  PARTIALLY_PAID: { ar: 'مدفوعة جزئياً', en: 'Partly Paid', color: STATUS_TONE.PENDING },
  PAID:           { ar: 'مدفوعة',      en: 'Paid',         color: STATUS_TONE.SUCCESS },
  OVERDUE:        { ar: 'متأخرة',      en: 'Overdue',      color: STATUS_TONE.DANGER },
  CANCELLED:      { ar: 'ملغاة',       en: 'Cancelled',    color: STATUS_TONE.MUTED },
};

const empty = {
  invoiceNo: '', supplierId: '', supplierName: '', purchaseOrderId: '', orderNo: '',
  goodsReceiptId: '', receiptNo: '', warehouseId: '', warehouseName: '',
  projectId: '', projectName: '', date: '', dueDate: '',
  baseAmount: '', vatRate: '0.15', paidAmount: '', status: 'DRAFT',
  description: '', notes: '', invoiceAttachmentUrl: '', invoiceAttachmentName: '', invoiceAttachmentType: '',
};

export default function SupplierInvoices() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [projects, setProjects] = useState([]);
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [previewFile, setPreviewFile] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [inv, s, p, po, gr] = await Promise.all([
        base44.entities.SupplierInvoice.list('-created_date', 200),
        base44.entities.Supplier.list(),
        base44.entities.Project.list(),
        base44.entities.PurchaseOrder.list('-created_date', 200),
        base44.entities.GoodsReceipt.list('-created_date', 200),
      ]);
      setItems(inv); setSuppliers(s); setProjects(p); setOrders(po); setReceipts(gr);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.invoiceNo?.toLowerCase().includes(search.toLowerCase()) || i.supplierName?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, invoiceNo: genInvoiceNo('SUP-INV', new Date().getFullYear(), items.length + 1) });
    setDialogOpen(true);
  };
  const openEdit = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن تعديل فاتورة معتمدة — قيدها مُرحّل', 'Cannot edit an approved invoice — its entry is posted', lang));
    setEditing(item);
    const rate = item.baseAmount ? (item.vatAmount || 0) / item.baseAmount : 0.15;
    setForm({ ...empty, ...item, vatRate: String([0, 0.05, 0.15].find(r => Math.abs(r - rate) < 0.001) ?? 0.15) });
    setDialogOpen(true);
  };
  const askDelete = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن حذف فاتورة معتمدة — قيدها مُرحّل', 'Cannot delete an approved invoice — its entry is posted', lang));
    setDeleteId(item.id); setConfirmOpen(true);
  };

  // سندات الاستلام المعلّقة (لم تُفوتر بعد) — منها تُنشأ الفاتورة عبر السلسلة.
  const pendingReceipts = receipts.filter(r => r.status === 'RECEIVED' && r.invoicedStatus !== 'INVOICED');

  // اختيار سند الاستلام يملأ المورد وأمر الشراء والمشروع والمخزن والقيمة تلقائياً.
  const onReceipt = (v) => {
    if (v === 'none') { setForm(f => ({ ...f, goodsReceiptId: '', receiptNo: '' })); return; }
    const r = receipts.find(x => x.id === v);
    setForm(f => ({
      ...f,
      goodsReceiptId: v,
      receiptNo: r?.receiptNo || '',
      purchaseOrderId: r?.purchaseOrderId || '',
      orderNo: r?.orderNo || '',
      supplierId: r?.supplierId || '',
      supplierName: r?.supplierName || '',
      projectId: r?.projectId || '',
      projectName: r?.projectName || '',
      warehouseId: r?.warehouseId || '',
      warehouseName: r?.warehouseName || '',
      baseAmount: f.baseAmount || r?.receivedAmount || '',
      description: f.description || r?.description || '',
    }));
  };

  const base = parseFloat(form.baseAmount) || 0;
  const vatAmount = base * (parseFloat(form.vatRate) || 0);
  const totalAmount = base + vatAmount;

  const save = async () => {
    if (!form.invoiceNo || !form.supplierId)
      return toast.error(t('رقم الفاتورة والمورد مطلوبان', 'Invoice No. and supplier required', lang));
    if (!form.goodsReceiptId)
      return toast.error(t('يجب ربط الفاتورة بسند استلام معتمد — لا يمكن إنشاء فاتورة مورد بدون سند استلام', 'Invoice must be linked to an approved goods receipt', lang));
    if (form.date && form.dueDate && form.dueDate < form.date)
      return toast.error(t('تاريخ الاستحقاق يجب أن يكون بعد تاريخ الفاتورة', 'Due date must be after invoice date', lang));
    setSaving(true);
    try {
      const data = {
        ...form,
        baseAmount: base, vatAmount, totalAmount,
        paidAmount: parseFloat(form.paidAmount) || 0,
        status: 'DRAFT',
      };
      delete data.vatRate;
      if (editing) { await OperationEngine.updateSupplierInvoice(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else {
        await OperationEngine.createSupplierInvoice(data);
        // الخادم يوسم سند الاستلام كمفوتَر تلقائياً داخل ترانسكشن العملية
        toast.success(t('تمت الإضافة كمسودة', 'Added as draft', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.SupplierInvoice.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const [approvingId, setApprovingId] = useState(null);
  const [reversingId, setReversingId] = useState(null);
  const approve = async (item) => {
    setApprovingId(item.id);
    try {
      await OperationEngine.approveSupplierInvoice(item.id);
      toast.success(t('تم اعتماد الفاتورة وترحيل القيد', 'Invoice approved & posted', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل الاعتماد', 'Approval failed', lang)); }
    setApprovingId(null);
  };

  const reverse = async (item) => {
    if (item.paidAmount && Number(item.paidAmount) > 0)
      return toast.error(t('لا يمكن عكس فاتورة عليها مدفوعات — اعكس المدفوعات أولاً', 'Cannot reverse an invoice with payments — reverse payments first', lang));
    setReversingId(item.id);
    try {
      const allJE = await base44.entities.JournalEntry.filter({ isPosted: true });
      const jes = allJE.filter(je => je.sourceType === 'SupplierInvoice' && (je.entryNo || '').includes(item.invoiceNo));
      if (jes.length === 0) throw new Error(t('لا يوجد قيد مرتبط', 'No linked entry', lang));
      const orig = jes[0];
      const revLines = (orig.lines || []).map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));
      await base44.entities.JournalEntry.create({
        entryNo: `${orig.entryNo}-REV-1`,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس ${orig.entryNo} — فاتورة مورد ${item.invoiceNo}`,
        lines: revLines, totalDebit: orig.totalCredit, totalCredit: orig.totalDebit,
        isPosted: true, sourceType: 'REVERSAL',
      });
      await base44.entities.SupplierInvoice.update(item.id, { status: 'CANCELLED' });
      toast.success(t('تم عكس الفاتورة وإنشاء قيد عكسي', 'Invoice reversed & reversal entry created', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل العكس', 'Reversal failed', lang)); }
    setReversingId(null);
  };

  const totalPayable = filtered.filter(i => i.status !== 'CANCELLED').reduce((s, i) => s + ((i.totalAmount || 0) - (i.paidAmount || 0)), 0);

  const exportColumns = [
    { header: { ar: 'رقم الفاتورة', en: 'Invoice No' }, value: (r) => r.invoiceNo },
    { header: { ar: 'المورد', en: 'Supplier' }, value: (r) => r.supplierName },
    { header: { ar: 'الطلب', en: 'Order' }, value: (r) => r.projectName },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الإجمالي', en: 'Total' }, value: (r) => r.totalAmount || 0 },
    { header: { ar: 'المسدد', en: 'Paid' }, value: (r) => r.paidAmount || 0 },
    { header: { ar: 'المرفق', en: 'Attachment' }, value: (r) => r.invoiceAttachmentName || '' },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('فواتير الموردين', 'Supplier Invoices', lang)}
      subtitle={t('تسجيل فواتير المشتريات ومتابعة المستحقات', 'Track purchase invoices and payables', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'فواتير الموردين', en: 'Supplier Invoices' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="size-4" />{t('فاتورة جديدة', 'New Invoice', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {Object.entries(STATUS).map(([s, cfg]) => (
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
            {Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الفاتورة', 'Invoice No.', lang)}</TableHead>
                <TableHead>{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('المسدد', 'Paid', lang)}</TableHead>
                <TableHead>{t('المرفق', 'Attachment', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد فواتير', 'No invoices', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUS[item.status] || STATUS.DRAFT;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.invoiceNo}</TableCell>
                        <TableCell className="font-medium">{item.supplierName || '—'}</TableCell>
                        <TableCell className="text-sm">{item.projectName || '—'}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.totalAmount, lang)}</TableCell>
                        <TableCell className="text-sm">{formatCurrency(item.paidAmount, lang)}</TableCell>
                        <TableCell>
                          {item.invoiceAttachmentUrl ? (
                            <Button type="button" variant="outline" size="sm" className="h-8 gap-1" onClick={() => setPreviewFile({ url: item.invoiceAttachmentUrl, name: item.invoiceAttachmentName || item.invoiceNo })}>
                              <Paperclip className="size-3.5" />{t('عرض', 'View', lang)}
                            </Button>
                          ) : <span className="text-xs text-muted-foreground">—</span>}
                        </TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1 items-center">
                            {item.status === 'DRAFT' && (
                              <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={approvingId === item.id} onClick={() => approve(item)}>
                                <CheckCircle2 className="size-3.5" />{approvingId === item.id ? t('جارٍ...', '...', lang) : t('اعتماد', 'Approve', lang)}
                              </Button>
                            )}
                            {['APPROVED','PARTIALLY_PAID','OVERDUE'].includes(item.status) && (<Button variant="ghost" size="icon" className="size-8 text-amber-600" title={t('عكس', 'Reverse', lang)} disabled={reversingId === item.id} onClick={() => reverse(item)}><RotateCcw className="size-3.5" /></Button>)}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item)}><Trash2 className="size-3.5" /></Button>}
                            <Button variant="ghost" size="icon" className="size-8" title={t('معاينة وطباعة', 'Preview & Print', lang)} onClick={() => setPreview(item)}><Printer className="size-3.5" /></Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-sm text-muted-foreground">{filtered.length} {t('فاتورة', 'invoices', lang)} | {t('المستحق للموردين', 'Payable', lang)}: <strong className="text-amber-600">{formatCurrency(totalPayable, lang)}</strong></p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل الفاتورة', 'Edit Invoice', lang) : t('فاتورة جديدة', 'New Invoice', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم الفاتورة', 'Invoice No.', lang)} *</Label><Input value={form.invoiceNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('سند الاستلام (إلزامي — السلسلة)', 'Goods Receipt (required — chain)')} *</Label>
              {pendingReceipts.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {t('لا توجد سندات استلام معتمدة ومعلّقة للفوترة. يجب إنشاء طلب شراء ← أمر شراء ← سند استلام معتمد أولاً قبل إنشاء فاتورة المورد.', 'No approved goods receipts pending invoicing. Create a purchase request → purchase order → approved goods receipt first before creating a supplier invoice.', lang)}
                </div>
              ) : (
                <Select value={form.goodsReceiptId || ''} onValueChange={onReceipt} disabled={!!editing}>
                  <SelectTrigger><SelectValue placeholder={t('اختر سند استلام معتمد', 'Select an approved goods receipt', lang)} /></SelectTrigger>
                  <SelectContent>
                    {pendingReceipts.map(r => <SelectItem key={r.id} value={r.id}>{r.receiptNo} — {r.supplierName || ''} ({formatCurrency(r.receivedAmount, lang)})</SelectItem>)}
                  </SelectContent>
                </Select>
              )}
              {form.goodsReceiptId && form.receiptNo && (
                <p className="text-xs text-muted-foreground">{t('مرتبط بسند', 'Linked to receipt')}: <span className="font-mono">{form.receiptNo}</span></p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>{t('المورد', 'Supplier', lang)}</Label>
              <Input value={form.supplierName || ''} readOnly disabled className="bg-muted" placeholder={t('يُملأ تلقائياً من سند الاستلام', 'Auto-filled from goods receipt', lang)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('أمر الشراء', 'Purchase Order', lang)}</Label>
              <Input value={form.orderNo || ''} readOnly disabled className="bg-muted" placeholder={t('يُملأ تلقائياً من سند الاستلام', 'Auto-filled from goods receipt', lang)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الطلب', 'Order', lang)}</Label>
              <Input value={form.projectName || ''} readOnly disabled className="bg-muted" placeholder={t('يُملأ تلقائياً من سند الاستلام', 'Auto-filled from goods receipt', lang)} />
            </div>
            <div className="space-y-1.5"><Label>{t('تاريخ الفاتورة', 'Invoice Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ الاستحقاق', 'Due Date', lang)}</Label><Input type="date" value={form.dueDate} min={form.date || undefined} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ قبل الضريبة', 'Base Amount', lang)}</Label><Input type="number" value={form.baseAmount} onChange={e => setForm(f => ({ ...f, baseAmount: e.target.value }))} /></div>
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
            <div className="space-y-1.5"><Label>{t('المبلغ المسدد', 'Paid Amount', lang)}</Label><Input type="number" value={form.paidAmount} readOnly className="bg-muted" /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
            <InvoiceAttachmentField
              className="col-span-2"
              label={t('مرفق فاتورة المورد', 'Supplier invoice attachment', lang)}
              url={form.invoiceAttachmentUrl}
              name={form.invoiceAttachmentName}
              onChange={(file) => setForm(f => ({ ...f, invoiceAttachmentUrl: file.url, invoiceAttachmentName: file.name, invoiceAttachmentType: file.type }))}
            />
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الفاتورة', 'Delete Invoice', lang)}
        description={t('سيتم حذف الفاتورة نهائياً.', 'This invoice will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <FilePreviewDialog
        open={!!previewFile}
        onOpenChange={(open) => !open && setPreviewFile(null)}
        url={previewFile?.url}
        name={previewFile?.name}
      />

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'فاتورة مورد', en: 'Supplier Invoice' }}>
        {preview && <SupplierInvoiceDocument invoice={preview} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}