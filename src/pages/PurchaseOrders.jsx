import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle2, XCircle, Printer } from 'lucide-react';
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
import { t, formatCurrency, STATUS_TONE, nextCodeFromList } from '@/lib/utils-binaa';
import QuickSupplierDialog from '@/components/purchase/QuickSupplierDialog';
import { calcVAT, OperationEngine } from '@/lib/businessEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import OrderLinesEditor from '@/components/purchase/OrderLinesEditor';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import PurchaseOrderDocument from '@/components/shared/PurchaseOrderDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { canTransition } from '@/lib/workflowEngine';
import { toast } from 'sonner';

const STATUSES = {
  DRAFT:     { ar: 'مسودة', en: 'Draft', color: STATUS_TONE.NEUTRAL },
  APPROVED:  { ar: 'موافق عليه', en: 'Approved', color: STATUS_TONE.INFO },
  ORDERED:   { ar: 'مطلوب', en: 'Ordered', color: STATUS_TONE.PENDING },
  RECEIVED:  { ar: 'مستلم', en: 'Received', color: STATUS_TONE.SUCCESS },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: STATUS_TONE.MUTED },
};
const RECEIPT = {
  PENDING:  { ar: 'لم يُستلم', en: 'Not received', color: STATUS_TONE.NEUTRAL },
  PARTIAL:  { ar: 'استلام جزئي', en: 'Partial', color: STATUS_TONE.PENDING },
  RECEIVED: { ar: 'مكتمل', en: 'Complete', color: STATUS_TONE.SUCCESS },
};
const empty = {
  orderNo: '', purchaseRequestId: '', requestNo: '', supplierId: '', supplierName: '',
  projectId: '', projectName: '', warehouseId: '', warehouseName: '',
  date: '', expectedDelivery: '', items: [], status: 'DRAFT', description: '', notes: '',
};

export default function PurchaseOrders() {
  const { lang, activeProjectId, activeProjectName } = useStore();
  const { settings } = useCompanySettings();
  const [items, setItems]         = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [projects, setProjects]   = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [requests, setRequests]   = useState([]);
  const [boqItems, setBoqItems]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen]     = useState(false);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen]   = useState(false);
  const [deleteId, setDeleteId]         = useState(null);
  const [editing, setEditing]           = useState(null);
  const [form, setForm]                 = useState(empty);
  const [saving, setSaving]             = useState(false);
  const [preview, setPreview]           = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [o, s, p, w, r] = await Promise.all([
        base44.entities.PurchaseOrder.list('-created_date', 200),
        base44.entities.Supplier.list(),
        base44.entities.Project.list(),
        base44.entities.Warehouse.list(),
        base44.entities.PurchaseRequest.list('-created_date', 200),
      ]);
      setItems(o); setSuppliers(s); setProjects(p); setWarehouses(w); setRequests(r);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // أصناف المخزون المتاحة للاختيار في بنود أمر الشراء.
  useEffect(() => {
    base44.entities.InventoryItem.filter({ isActive: true }).then(setBoqItems).catch(() => setBoqItems([]));
  }, []);

  const buildDefaultForm = () => ({
    ...empty,
    orderNo: nextCodeFromList(items, 'PO', 'orderNo'),
    date: new Date().toISOString().slice(0, 10),
    projectId:   activeProjectId   || '',
    projectName: activeProjectName || '',
  });

  const filtered = items.filter(i => {
    const match = !search || i.orderNo?.toLowerCase().includes(search.toLowerCase()) || i.supplierName?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew   = () => { setEditing(null); setForm(buildDefaultForm()); setDialogOpen(true); };
  const openEdit  = (item) => { setEditing(item); setForm({ ...empty, ...item, items: item.items || [] }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  // الإجمالي يُحسب من البنود (البنود هي الأساس).
  const linesTotal = (form.items || []).reduce((s, l) => s + (Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0), 0);
  const { vat: vatAmt, total: grandTotal } = calcVAT(linesTotal);

  const save = async () => {
    if (!form.supplierId)
      return toast.error(t('المورد مطلوب', 'Supplier required', lang));
    if (!(form.items || []).some(l => (Number(l.orderedQty) || 0) > 0 && l.description))
      return toast.error(t('أضف بنداً واحداً على الأقل بكمية', 'Add at least one item with a quantity', lang));
    if (!form.warehouseId && !form.projectId)
      return toast.error(t('اختر مخزن الوجهة أو طلب التسليم المباشر', 'Select a destination warehouse or direct-to-order delivery', lang));
    setSaving(true);
    try {
      const data = { ...form, orderNo: form.orderNo || nextCodeFromList(items, 'PO', 'orderNo') };
      if (editing) {
        await OperationEngine.updatePurchaseOrder(editing.id, data, suppliers, projects, editing.status, warehouses);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await OperationEngine.createPurchaseOrder(data, suppliers, projects, warehouses);
        toast.success(t('تمت الإضافة', 'Added', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const gr = await base44.entities.GoodsReceipt.filter({ purchaseOrderId: deleteId });
      if (gr.length > 0) {
        toast.error(t('لا يمكن حذف أمر شراء له إذونات استلام', 'Cannot delete a purchase order with linked goods receipts', lang));
        return;
      }
      await base44.entities.PurchaseOrder.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const setStatus = async (item, newStatus) => {
    if (!canTransition('PURCHASE_ORDER', item.status, newStatus))
      return toast.error(t('لا يمكن تغيير الحالة', 'This status change is not allowed', lang));
    try {
      await base44.entities.PurchaseOrder.update(item.id, { status: newStatus });
      toast.success(t('تم تحديث الحالة', 'Status updated', lang)); load();
    } catch { toast.error(t('فشل التحديث', 'Update failed', lang)); }
  };

  const totalValue = filtered.reduce((s, i) => s + (i.totalAmount || 0) + (i.vatAmount || 0), 0);

  const exportColumns = [
    { header: { ar: 'رقم الأمر', en: 'Order No' }, value: (r) => r.orderNo },
    { header: { ar: 'المورد', en: 'Supplier' }, value: (r) => r.supplierName },
    { header: { ar: 'الطلب', en: 'Order' }, value: (r) => r.projectName },
    { header: { ar: 'عدد البنود', en: 'Items' }, value: (r) => (r.items || []).length },
    { header: { ar: 'الإجمالي', en: 'Grand Total' }, value: (r) => (r.totalAmount || 0) + (r.vatAmount || 0) },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('أوامر الشراء', 'Purchase Orders', lang)}
      subtitle={t('أمر الشراء هو الأساس — تُبنى عليه سندات الاستلام تلقائياً', 'The purchase order is the base — receipts build on it automatically', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'أوامر الشراء', en: 'Purchase Orders' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="size-4" />{t('أمر شراء جديد', 'New Order', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
            {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الأمر', 'Order No.', lang)}</TableHead>
                <TableHead>{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('البنود', 'Items', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Grand Total', lang)}</TableHead>
                <TableHead>{t('الاستلام', 'Receipt', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد أوامر شراء', 'No purchase orders', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUSES[item.status] || STATUSES.DRAFT;
                    const rc = RECEIPT[item.receiptStatus] || RECEIPT.PENDING;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.orderNo}</TableCell>
                        <TableCell className="font-medium">{item.supplierName || '—'}</TableCell>
                        <TableCell className="text-sm">{item.projectName || '—'}</TableCell>
                        <TableCell className="text-sm">{(item.items || []).length}</TableCell>
                        <TableCell className="font-medium">{formatCurrency((item.totalAmount || 0) + (item.vatAmount || 0), lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${rc.color}`}>{lang === 'ar' ? rc.ar : rc.en}</span></TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-emerald-700" title={t('اعتماد', 'Approve', lang)} onClick={() => setStatus(item, 'APPROVED')}><CheckCircle2 className="size-3.5" /></Button>}
                            {(item.status === 'DRAFT' || item.status === 'APPROVED' || item.status === 'ORDERED') && <Button variant="ghost" size="icon" className="size-8 text-rose-700" title={t('إلغاء', 'Cancel', lang)} onClick={() => setStatus(item, 'CANCELLED')}><XCircle className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                            {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>}
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
      <p className="text-sm text-muted-foreground">{filtered.length} {t('أمر شراء', 'orders', lang)} | {t('الإجمالي', 'Total', lang)}: <strong>{formatCurrency(totalValue, lang)}</strong></p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل أمر الشراء', 'Edit Order', lang) : t('أمر شراء جديد', 'New Purchase Order', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم الأمر', 'Order No.', lang)} *</Label><Input value={form.orderNo} readOnly className="bg-muted" /></div>
            <div className="space-y-1.5">
              <Label>{t('المورد', 'Supplier', lang)} *</Label>
              <div className="flex gap-2">
                <Select value={form.supplierId} onValueChange={v => { const s = suppliers.find(s => s.id === v); setForm(f => ({ ...f, supplierId: v, supplierName: s?.name || '' })); }}>
                  <SelectTrigger><SelectValue placeholder={t('اختر مورد', 'Select supplier', lang)} /></SelectTrigger>
                  <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
                <Button type="button" variant="outline" className="shrink-0 gap-1" onClick={() => setSupplierDialogOpen(true)}><Plus className="size-4" />{t('جديد', 'New', lang)}</Button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الطلب', 'Order', lang)}</Label>
              <Select value={form.projectId} onValueChange={v => { const p = projects.find(p => p.id === v); setForm(f => ({ ...f, projectId: v, projectName: p?.name || '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر طلب', 'Select order', lang)} /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('مخزن الوجهة (أو طلب للتسليم المباشر)', 'Destination Warehouse (or order for direct delivery)')}</Label>
              <Select value={form.warehouseId || 'none'} onValueChange={v => { if (v === 'none') { setForm(f => ({ ...f, warehouseId: '', warehouseName: '' })); return; } const w = warehouses.find(w => w.id === v); setForm(f => ({ ...f, warehouseId: v, warehouseName: w?.name || '', projectId: w?.projectId || f.projectId, projectName: w?.projectName || f.projectName })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر مخزن', 'Select warehouse', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('بدون', 'None', lang)}</SelectItem>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('تاريخ التسليم المتوقع', 'Expected Delivery', lang)}</Label><Input type="date" value={form.expectedDelivery} min={form.date || undefined} onChange={e => setForm(f => ({ ...f, expectedDelivery: e.target.value }))} /></div>

            <div className="col-span-2">
              <OrderLinesEditor lines={form.items} onChange={(l) => setForm(f => ({ ...f, items: l }))} boqItems={boqItems} />
            </div>

            <div className="space-y-1.5"><Label>{t('ضريبة 15% (محسوبة)', 'VAT 15% (auto)', lang)}</Label><Input readOnly value={vatAmt.toFixed(2)} className="bg-muted" /></div>
            <div className="space-y-1.5"><Label>{t('الإجمالي شامل الضريبة', 'Grand Total incl. VAT', lang)}</Label><Input readOnly value={grandTotal.toFixed(2)} className="bg-muted font-bold" /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <QuickSupplierDialog
        open={supplierDialogOpen}
        onOpenChange={setSupplierDialogOpen}
        suppliers={suppliers}
        lang={lang}
        onCreated={(supplier) => {
          setSuppliers(prev => [supplier, ...prev]);
          setForm(f => ({ ...f, supplierId: supplier.id, supplierName: supplier.name }));
        }}
      />

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف أمر الشراء', 'Delete Purchase Order', lang)}
        description={t('سيتم حذف أمر الشراء نهائياً.', 'This purchase order will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'أمر شراء', en: 'Purchase Order' }}>
        {preview && <PurchaseOrderDocument order={preview} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}