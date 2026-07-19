import React, { useState, useEffect } from 'react';
import { PackageCheck, Search, RefreshCw, Printer } from 'lucide-react';
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
import { t, formatCurrency, formatDate, genCode } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import GoodsReceiptDocument from '@/components/shared/GoodsReceiptDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { toast } from 'sonner';

const INV = {
  PENDING:  { ar: 'بانتظار الفوترة', en: 'Pending', color: 'bg-amber-100 text-amber-700' },
  INVOICED: { ar: 'تمت الفوترة',     en: 'Invoiced', color: 'bg-blue-100 text-blue-700' },
};

export default function GoodsReceipts() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [preview, setPreview] = useState(null);
  const [previewLines, setPreviewLines] = useState([]);
  const [items, setItems] = useState([]);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [saving, setSaving] = useState(false);

  // نموذج الاستلام: أمر الشراء المختار + سطور بالكمية المستلمة الآن لكل بند.
  const [receiptNo, setReceiptNo] = useState('');
  const [date, setDate] = useState('');
  const [poId, setPoId] = useState('');
  const [lines, setLines] = useState([]); // [{ boqItemId, description, unit, remaining, unitPrice, receivingQty }]
  const [notes, setNotes] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [g, po] = await Promise.all([
        base44.entities.GoodsReceipt.list('-created_date', 200),
        base44.entities.PurchaseOrder.list('-created_date', 200),
      ]);
      setItems(g); setOrders(po);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // أوامر الشراء القابلة للاستلام: لها مخزن وجهة وبنود ولم يكتمل استلامها.
  const receivableOrders = orders.filter(o => (o.items || []).length > 0 && o.receiptStatus !== 'RECEIVED' && o.status !== 'CANCELLED');

  const filtered = items.filter(i =>
    !search || i.receiptNo?.toLowerCase().includes(search.toLowerCase()) || i.supplierName?.toLowerCase().includes(search.toLowerCase()) || i.orderNo?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => {
    setReceiptNo(genCode('GRN', items.length + 1));
    setDate(new Date().toISOString().slice(0, 10));
    setPoId(''); setLines([]); setNotes('');
    setDialogOpen(true);
  };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  // عند اختيار أمر الشراء: تُبنى السطور من بنوده مع الكمية المتبقية لكل بند.
  const onPickPO = (id) => {
    setPoId(id);
    const po = orders.find(o => o.id === id);
    const rows = (po?.items || []).map(l => {
      const remaining = +((Number(l.orderedQty) || 0) - (Number(l.receivedQty) || 0)).toFixed(3);
      return { boqItemId: l.boqItemId || '', description: l.description, unit: l.unit || '', remaining, unitPrice: Number(l.unitPrice) || 0, receivingQty: remaining > 0 ? remaining : 0 };
    }).filter(r => r.remaining > 0);
    setLines(rows);
  };

  const setQty = (i, v) => setLines(ls => ls.map((l, idx) => idx === i ? { ...l, receivingQty: v } : l));

  const batchTotal = lines.reduce((s, l) => s + (Number(l.receivingQty) || 0) * (l.unitPrice || 0), 0);
  const selectedPO = orders.find(o => o.id === poId);

  const save = async () => {
    if (!poId) return toast.error(t('اختر أمر الشراء', 'Select a purchase order', lang));
    const payloadLines = lines
      .filter(l => (Number(l.receivingQty) || 0) > 0)
      .map(l => ({ boqItemId: l.boqItemId, description: l.description, receivingQty: Number(l.receivingQty) }));
    if (payloadLines.length === 0) return toast.error(t('أدخل الكمية المستلمة', 'Enter received quantities', lang));
    setSaving(true);
    try {
      await OperationEngine.createGoodsReceipt({ receiptNo, date, purchaseOrderId: poId, lines: payloadLines, notes });
      toast.success(t('تم تأكيد الاستلام وتحديث المخزون', 'Receipt confirmed — stock updated', lang));
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const target = items.find(i => i.id === deleteId);
      if (!target) throw new Error(t('السند غير موجود', 'Receipt not found', lang));
      if (target.invoicedStatus === 'INVOICED') {
        throw new Error(t('لا يمكن حذف سند تمت فوترة — اعكس فاتورة المورد أولاً', 'Cannot delete an invoiced receipt — reverse the supplier invoice first', lang));
      }
      const linked = await base44.entities.SupplierInvoice.filter({ goodsReceiptId: deleteId });
      if (linked && linked.length > 0) {
        throw new Error(t('لا يمكن الحذف — يوجد فاتورة مورد مرتبطة بهذا السند', 'Cannot delete — a supplier invoice is linked to this receipt', lang));
      }
      await base44.entities.GoodsReceipt.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalReceived = filtered.reduce((s, i) => s + (i.receivedAmount || 0), 0);

  // معاينة سند الاستلام: تُبنى بنوده من حركات المخزون المرتبطة برقم السند.
  const openPreview = async (item) => {
    setPreview(item);
    setPreviewLines([]);
    try {
      const movements = await base44.entities.StockMovement.filter({ reference: item.receiptNo });
      setPreviewLines(movements.map(m => ({ description: m.itemName, unit: m.unit, quantity: m.quantity, unitPrice: m.unitCost })));
    } catch { /* السند يُعرض بدون بنود إن تعذّر التحميل */ }
  };

  const exportColumns = [
    { header: { ar: 'رقم السند', en: 'Receipt No' }, value: (r) => r.receiptNo },
    { header: { ar: 'أمر الشراء', en: 'PO' }, value: (r) => r.orderNo },
    { header: { ar: 'المورد', en: 'Supplier' }, value: (r) => r.supplierName },
    { header: { ar: 'الطلب/المخزن', en: 'Order / Warehouse' }, value: (r) => r.projectName || r.warehouseName },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'القيمة', en: 'Amount' }, value: (r) => r.receivedAmount || 0 },
  ];

  return (
    <ModuleLayout
      title={t('سندات الاستلام', 'Goods Receipts', lang)}
      subtitle={t('أكّد ما استُلم من كل بند — النظام يزيد المخزون ويرحّل القيود تلقائياً', 'Confirm received quantities — stock and journals are updated automatically', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'سندات الاستلام', en: 'Goods Receipts' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><PackageCheck className="size-4" />{t('استلام', 'Receive', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم السند', 'Receipt No.', lang)}</TableHead>
                <TableHead>{t('أمر الشراء', 'PO', lang)}</TableHead>
                <TableHead>{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead>{t('الطلب/المخزن', 'Order / Warehouse', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Amount', lang)}</TableHead>
                <TableHead>{t('الفوترة', 'Invoicing', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد سندات استلام', 'No goods receipts', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const iv = INV[item.invoicedStatus] || INV.PENDING;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.receiptNo}</TableCell>
                        <TableCell className="font-mono text-xs">{item.orderNo || '—'}</TableCell>
                        <TableCell className="font-medium">{item.supplierName || '—'}</TableCell>
                        <TableCell className="text-sm">{item.projectName || item.warehouseName || '—'}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.receivedAmount, lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${iv.color}`}>{lang === 'ar' ? iv.ar : iv.en}</span></TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="size-8" title={t('معاينة السند', 'Preview', lang)} onClick={() => openPreview(item)}><Printer className="size-3.5" /></Button>
                            {/* زر الحذف محذوف عمداً: كل سند استلام له status='RECEIVED' وهي حالة
                                محمية (IMMUTABLE_STATUSES على الخادم)، فالخادم يرفض الحذف دائماً.
                                التصحيح المناسب هو عكس القيد عبر حذف/عكس فاتورة المورد المرتبطة. */}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">{filtered.length} {t('سند استلام', 'receipts', lang)} | {t('إجمالي المستلم', 'Total received', lang)}: <strong>{formatCurrency(totalReceived, lang)}</strong></p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{t('تأكيد استلام بضاعة', 'Confirm Goods Receipt', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم السند', 'Receipt No.', lang)}</Label><Input value={receiptNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={date} onChange={e => setDate(e.target.value)} /></div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('أمر الشراء', 'Purchase Order', lang)} *</Label>
              <Select value={poId || 'none'} onValueChange={v => v === 'none' ? (setPoId(''), setLines([])) : onPickPO(v)}>
                <SelectTrigger><SelectValue placeholder={t('اختر أمر شراء', 'Select a purchase order', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('اختر', 'Select', lang)}</SelectItem>
                  {receivableOrders.map(o => <SelectItem key={o.id} value={o.id}>{o.orderNo} — {o.supplierName || ''} {o.receiptStatus === 'PARTIAL' ? `(${t('جزئي', 'partial', lang)})` : ''}</SelectItem>)}
                </SelectContent>
              </Select>
              {receivableOrders.length === 0 && <p className="text-[11px] text-rose-600">{t('لا توجد أوامر شراء قابلة للاستلام (تحتاج بنوداً ولم تكتمل)', 'No receivable purchase orders (need items, not fully received)', lang)}</p>}
            </div>

            {selectedPO && (
              <div className="col-span-2 grid grid-cols-2 gap-x-4 text-sm bg-muted/40 rounded-lg p-3">
                <div>{t('المورد', 'Supplier', lang)}: <strong>{selectedPO.supplierName || '—'}</strong></div>
                <div>{t('المخزن', 'Warehouse', lang)}: <strong>{selectedPO.warehouseName || '—'}</strong></div>
              </div>
            )}

            {poId && (
              <div className="col-span-2 rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('البند', 'Item', lang)}</TableHead>
                      <TableHead className="w-24">{t('المتبقي', 'Remaining', lang)}</TableHead>
                      <TableHead className="w-28">{t('المستلم الآن', 'Receiving now', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lines.length === 0
                      ? <TableRow><TableCell colSpan={3} className="text-center py-6 text-muted-foreground text-sm">{t('اكتمل استلام كل البنود', 'All items already received', lang)}</TableCell></TableRow>
                      : lines.map((l, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-sm">{l.description}{l.unit ? ` (${l.unit})` : ''}</TableCell>
                          <TableCell className="text-sm">{l.remaining}</TableCell>
                          <TableCell><Input type="number" value={l.receivingQty} min={0} max={l.remaining} onChange={e => setQty(i, e.target.value)} className="w-24" /></TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            )}

            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></div>
            {poId && lines.length > 0 && <div className="col-span-2 text-end text-sm">{t('قيمة هذه الدفعة', 'This batch value', lang)}: <strong>{formatCurrency(batchTotal, lang)}</strong></div>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving || !poId} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('تأكيد الاستلام', 'Confirm Receipt', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف سند الاستلام', 'Delete Receipt', lang)}
        description={t('سيتم حذف السند نهائياً.', 'This receipt will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'سند استلام بضاعة', en: 'Goods Receipt' }}>
        {preview && <GoodsReceiptDocument receipt={preview} lines={previewLines} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}