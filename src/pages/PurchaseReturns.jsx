import React, { useState, useEffect } from 'react';
import { Search, RotateCcw, RefreshCw, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { toast } from 'sonner';

// شاشة مرتجع المشتريات — بسيطة، بلا منطق محاسبي. كل شيء في Return Engine.
export default function PurchaseReturns() {
  const { lang, activeProjectId } = useStore();
  const { user } = useAuth();
  const [invoices, setInvoices] = useState([]);
  const [returns, setReturns] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selectedInvoice, setSelectedInvoice] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isFullReturn, setIsFullReturn] = useState(false);
  const [returnQtys, setReturnQtys] = useState({});
  const [reason, setReason] = useState('');
  const [warehouseId, setWarehouseId] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [inv, ret, wh] = await Promise.all([
        base44.entities.SupplierInvoice.list('-date', 500),
        base44.entities.PurchaseReturn.list('-date', 200).catch(() => []),
        base44.entities.Warehouse.list().catch(() => []),
      ]);
      setInvoices((inv || []).filter(i => i.status !== 'CANCELLED' && i.status !== 'DRAFT' && i.status !== 'RETURNED'));
      setReturns(ret || []);
      setWarehouses(wh || []);
    } catch (e) { toast.error(e?.message || t('فشل التحميل', 'Load failed', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = invoices.filter(i => {
    if (!search) return true;
    const q = search.toLowerCase();
    return String(i.invoiceNo || '').toLowerCase().includes(q)
      || String(i.supplierName || '').toLowerCase().includes(q);
  });

  const openReturn = (inv) => {
    setSelectedInvoice(inv);
    setIsFullReturn(false);
    setReturnQtys({});
    setReason('');
    setWarehouseId(inv.warehouseId || (warehouses[0]?.id || ''));
    setDialogOpen(true);
  };

  const submitReturn = async () => {
    if (!selectedInvoice) return;
    if (saving) return;
    setSaving(true);
    try {
      const lines = isFullReturn ? [] : Object.entries(returnQtys)
        .filter(([, q]) => Number(q) > 0)
        .map(([key, q]) => {
          const [itemId, name, unitPrice] = key.split('||');
          return { itemId, name: name || '', qty: Number(q), unitPrice: Number(unitPrice) || 0 };
        });
      if (!isFullReturn && lines.length === 0) {
        toast.error(t('حدّد صنفاً واحداً على الأقل أو فعّل المرتجع الكامل', 'Select at least one item or enable full return', lang));
        setSaving(false);
        return;
      }
      const wh = warehouses.find(w => w.id === warehouseId);
      await OperationEngine.createPurchaseReturn({
        originalInvoiceId: selectedInvoice.id,
        date: new Date().toISOString().slice(0, 10),
        isFullReturn,
        lines,
        reason,
        warehouseId,
        warehouseName: wh?.name || '',
        userId: user?.id || '',
        userName: user?.full_name || user?.email || '',
      });
      toast.success(t('تم إنشاء مرتجع المشتريات وترحيل القيد', 'Purchase return created & entry posted', lang));
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل المرتجع', 'Return failed', lang));
    }
    setSaving(false);
  };

  return (
    <ModuleLayout
      title={t('مرتجع المشتريات', 'Purchase Returns', lang)}
      subtitle={t('إنشاء مرتجع لفاتورة مورد — كل المنطق المحاسبي يتم على الخادم', 'Create a return for a supplier invoice — all accounting logic runs server-side', lang)}
      actions={<Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>}
    >
      <div className="relative mb-4">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('ابحث برقم الفاتورة أو المورد...', 'Search by invoice no or supplier...', lang)} className="ps-9" />
      </div>

      <Card className="mb-6">
        <div className="p-4 border-b bg-muted/30">
          <h3 className="font-semibold">{t('فواتير الموردين القابلة للمرتجع', 'Returnable Supplier Invoices', lang)}</h3>
        </div>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم الفاتورة', 'Invoice No', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">{t('لا توجد فواتير قابلة للمرتجع', 'No returnable invoices', lang)}</TableCell></TableRow>
              ) : filtered.map(inv => (
                <TableRow key={inv.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{inv.invoiceNo}</TableCell>
                  <TableCell className="text-xs">{formatDate(inv.date, lang)}</TableCell>
                  <TableCell className="text-sm">{inv.supplierName || '—'}</TableCell>
                  <TableCell className="text-end text-sm font-medium">{formatCurrency(inv.totalAmount, lang)}</TableCell>
                  <TableCell>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${inv.status === 'PARTIALLY_RETURNED' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}`}>
                      {inv.status === 'PARTIALLY_RETURNED' ? t('مرتجعة جزئياً', 'Partially returned', lang) : t('سليمة', 'Active', lang)}
                    </span>
                  </TableCell>
                  <TableCell className="text-end">
                    <Button size="sm" variant="outline" onClick={() => openReturn(inv)} className="gap-1.5">
                      <RotateCcw className="size-3.5" /> {t('مرتجع', 'Return', lang)}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {returns.length > 0 && (
        <Card>
          <div className="p-4 border-b bg-muted/30">
            <h3 className="font-semibold">{t('سجل مرتجعات المشتريات', 'Purchase Returns History', lang)}</h3>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('رقم المرتجع', 'Return No', lang)}</TableHead>
                  <TableHead>{t('الفاتورة الأصلية', 'Original Invoice', lang)}</TableHead>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead className="text-end">{t('المبلغ', 'Amount', lang)}</TableHead>
                  <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {returns.map(r => (
                  <TableRow key={r.id}>
                    <TableCell className="font-mono text-xs">{r.returnNo}</TableCell>
                    <TableCell className="font-mono text-xs">{r.originalInvoiceNo}</TableCell>
                    <TableCell className="text-xs">{formatDate(r.date, lang)}</TableCell>
                    <TableCell className="text-end text-sm">{formatCurrency(r.totalAmount, lang)}</TableCell>
                    <TableCell>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${r.isFullReturn ? 'bg-rose-100 text-rose-700' : 'bg-amber-100 text-amber-700'}`}>
                        {r.isFullReturn ? t('كامل', 'Full', lang) : t('جزئي', 'Partial', lang)}
                      </span>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <RotateCcw className="size-5 text-rose-600" />
              {t('مرتجع مشتريات', 'Purchase Return', lang)} — {selectedInvoice?.invoiceNo}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {selectedInvoice && (
              <div className="grid grid-cols-3 gap-3 text-sm bg-muted/40 rounded-md p-3">
                <div><span className="text-muted-foreground">{t('المورد', 'Supplier', lang)}:</span> <strong>{selectedInvoice.supplierName || '—'}</strong></div>
                <div><span className="text-muted-foreground">{t('الإجمالي', 'Total', lang)}:</span> <strong>{formatCurrency(selectedInvoice.totalAmount, lang)}</strong></div>
                <div><span className="text-muted-foreground">{t('التاريخ', 'Date', lang)}:</span> <strong>{formatDate(selectedInvoice.date, lang)}</strong></div>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('المخزن (الذي ستُعاد منه الأصناف للمورد)', 'Warehouse (items returned to supplier from)', lang)} *</Label>
              <Select value={warehouseId} onValueChange={setWarehouseId}>
                <SelectTrigger><SelectValue placeholder={t('اختر المخزن', 'Select warehouse', lang)} /></SelectTrigger>
                <SelectContent>
                  {warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>

            <label className="flex items-center gap-2 cursor-pointer">
              <Switch checked={isFullReturn} onCheckedChange={setIsFullReturn} />
              <span className="text-sm font-medium">{t('مرتجع كامل (كل الأصناف)', 'Full return (all items)', lang)}</span>
            </label>

            {!isFullReturn && selectedInvoice && (
              <div className="space-y-2">
                <Label className="text-sm">{t('بنود المرتجع', 'Return items', lang)}</Label>
                <div className="text-xs text-muted-foreground bg-muted/40 rounded-md p-2">
                  {t('أدخل الأصناف والكميات المرتجعة يدوياً (إن لم تحتوِ الفاتورة على بنود مفصّلة).', 'Enter returned items and quantities manually (if invoice has no detailed lines).', lang)}
                </div>
                {Object.entries(returnQtys).map(([key, q], idx) => (
                  <div key={idx} className="flex gap-2 items-center">
                    <Input
                      placeholder={t('اسم الصنف', 'Item name', lang)}
                      value={key.split('||')[1] || ''}
                      onChange={e => {
                        const newKey = `||${e.target.value}||0`;
                        setReturnQtys(prev => {
                          const next = { ...prev };
                          delete next[key];
                          next[newKey] = q;
                          return next;
                        });
                      }}
                      className="flex-1 h-8"
                    />
                    <Input
                      type="number" min="0" step="1"
                      placeholder={t('الكمية', 'Qty', lang)}
                      value={q}
                      onChange={e => setReturnQtys(prev => ({ ...prev, [key]: e.target.value }))}
                      className="w-24 h-8"
                    />
                    <Button size="icon" variant="ghost" className="size-8 text-destructive" onClick={() => setReturnQtys(prev => { const n = { ...prev }; delete n[key]; return n; })}>
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </div>
                ))}
                <Button variant="outline" size="sm" onClick={() => setReturnQtys(prev => ({ ...prev, [`||${t('صنف', 'Item', lang)} ${Object.keys(prev).length + 1}||0`]: '' }))}>
                  + {t('إضافة صنف', 'Add item', lang)}
                </Button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('سبب المرتجع (اختياري)', 'Return reason (optional)', lang)}</Label>
              <Textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} />
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-xs text-blue-700 flex items-start gap-2">
              <AlertTriangle className="size-4 shrink-0 mt-0.5" />
              <span>{t('سيقوم المحرك تلقائياً بـ: سحب الأصناف من المخزون + عكس VAT المدخلة + تخفيض ذمم المورد + تحديث حالة الفاتورة. لا يمكنك التراجع بعد التأكيد.', 'The engine will automatically: withdraw items from inventory + reverse input VAT + reduce supplier payables + update invoice status. You cannot undo after confirmation.', lang)}</span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={submitReturn} disabled={saving || !warehouseId} className="gap-2 bg-rose-600 hover:bg-rose-700">
              {saving ? <RefreshCw className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              {saving ? t('جاري...', '...', lang) : t('تأكيد المرتجع', 'Confirm Return', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}
