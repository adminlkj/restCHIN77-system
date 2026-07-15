import React, { useState, useEffect } from 'react';
import { Plus, Search, RefreshCw, Printer, RotateCcw } from 'lucide-react';
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
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import VoucherDocument from '@/components/shared/VoucherDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { loadAccounts, selectCashAccounts } from '@/lib/postingEngine';
import { OperationEngine } from '@/lib/businessEngine';
import { toast } from 'sonner';
import { requiredFields, missingFieldsMessage } from '@/lib/formValidation';

const METHODS = {
  CASH:          { ar: 'نقدي',       en: 'Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  CHEQUE:        { ar: 'شيك',        en: 'Cheque' },
  CARD:          { ar: 'بطاقة',      en: 'Card' },
};

const empty = {
  paymentNo: '', supplierId: '', supplierName: '', supplierInvoiceId: '',
  date: '', amount: '', method: 'BANK_TRANSFER', cashAccountCode: '', cashAccountName: '', reference: '', notes: '',
};

export default function SupplierPayments() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [suppliers, setSuppliers] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [pay, s, inv, accts] = await Promise.all([
        base44.entities.SupplierPayment.list('-created_date', 200),
        base44.entities.Supplier.list(),
        base44.entities.SupplierInvoice.list('-created_date', 200),
        loadAccounts(true),
      ]);
      setItems(pay); setSuppliers(s); setInvoices(inv);
      setCashAccounts(selectCashAccounts(accts));
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => !search || i.paymentNo?.toLowerCase().includes(search.toLowerCase()) || i.supplierName?.toLowerCase().includes(search.toLowerCase()));

  // السداد مرتبط حصراً بفواتير معتمدة (أو مدفوعة جزئياً) للمورد المختار
  const supplierInvoices = invoices.filter(inv => inv.supplierId === form.supplierId && ['APPROVED', 'PARTIALLY_PAID'].includes(inv.status));

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, paymentNo: nextCodeFromList(items, 'PMT', 'paymentNo') });
    setDialogOpen(true);
  };
  const openEdit = () => toast.error(t('لا يمكن تعديل سند صرف مُرحّل — استخدم العكس', 'Cannot edit a posted payment — use reverse', lang));
  const askDelete = () => toast.error(t('لا يمكن حذف سند صرف مُرحّل — استخدم العكس', 'Cannot delete a posted payment — use reverse', lang));

  const [reversingId, setReversingId] = useState(null);
  const reverse = async (item) => {
    setReversingId(item.id);
    try {
      const allJE = await base44.entities.JournalEntry.filter({ isPosted: true });
      const jes = allJE.filter(je => je.sourceType === 'SupplierPayment' && (je.entryNo || '').includes(item.paymentNo));
      if (jes.length === 0) throw new Error(t('لا يوجد قيد مرتبط', 'No linked entry', lang));
      const orig = jes[0];
      const revLines = (orig.lines || []).map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));
      await base44.entities.JournalEntry.create({
        entryNo: `${orig.entryNo}-REV-1`,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس ${orig.entryNo} — سند صرف ${item.paymentNo}`,
        lines: revLines, totalDebit: orig.totalCredit, totalCredit: orig.totalDebit,
        isPosted: true, sourceType: 'REVERSAL',
      });
      await base44.entities.SupplierPayment.update(item.id, { status: 'CANCELLED' });
      toast.success(t('تم عكس السند وإنشاء قيد عكسي', 'Payment reversed & reversal entry created', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل العكس', 'Reversal failed', lang)); }
    setReversingId(null);
  };

  const save = async () => {
    const missing = requiredFields(form, [
      { key: 'supplierId', label: t('المورد', 'Supplier', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
      { key: 'amount', label: t('المبلغ', 'Amount', lang) },
      { key: 'cashAccountCode', label: t('الحساب النقدي', 'Cash / Bank Account', lang) },
      { key: 'supplierInvoiceId', label: t('الفاتورة المرتبطة', 'Linked Invoice', lang) },
    ]);
    if (missing.length) return toast.error(missingFieldsMessage(missing, lang));
    setSaving(true);
    try {
      const data = { ...form, amount: parseFloat(form.amount) || 0 };
      if (editing) { await OperationEngine.updateSupplierPayment(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await OperationEngine.createSupplierPayment(data); toast.success(t('تمت الإضافة + قيد السداد', 'Added + payment entry', lang)); }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const totalPaid = filtered.reduce((s, i) => s + (i.amount || 0), 0);

  const exportColumns = [
    { header: { ar: 'رقم السند', en: 'Voucher No' }, value: (r) => r.paymentNo },
    { header: { ar: 'المورد', en: 'Supplier' }, value: (r) => r.supplierName },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'المبلغ', en: 'Amount' }, value: (r) => r.amount || 0 },
    { header: { ar: 'طريقة الدفع', en: 'Method' }, value: (r) => { const m = METHODS[r.method]; return m ? (lang === 'ar' ? m.ar : m.en) : r.method; } },
    { header: { ar: 'المرجع', en: 'Reference' }, value: (r) => r.reference },
  ];

  return (
    <ModuleLayout
      title={t('سداد الموردين', 'Supplier Payments', lang)}
      subtitle={t('سندات صرف ومدفوعات الموردين', 'Supplier payment vouchers', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'سداد الموردين', en: 'Supplier Payments' }} />
          <Button onClick={openNew} className="gap-2 bg-amber-600 hover:bg-amber-700"><Plus className="size-4" />{t('سند صرف جديد', 'New Payment', lang)}</Button>
        </div>
      }
    >
      <div className="flex gap-3">
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
                <TableHead>{t('رقم السند', 'Voucher No.', lang)}</TableHead>
                <TableHead>{t('المورد', 'Supplier', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead>{t('طريقة الدفع', 'Method', lang)}</TableHead>
                <TableHead>{t('المرجع', 'Reference', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد سندات صرف', 'No payments', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const m = METHODS[item.method] || METHODS.BANK_TRANSFER;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-mono text-xs font-medium">{item.paymentNo || '—'}</TableCell>
                        <TableCell className="font-medium">{item.supplierName || '—'}</TableCell>
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.amount, lang)}</TableCell>
                        <TableCell><span className="text-xs bg-slate-100 text-slate-600 rounded-full px-2 py-0.5">{lang === 'ar' ? m.ar : m.en}</span></TableCell>
                        <TableCell className="text-sm">{item.reference || '—'}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="size-8" title={t('معاينة السند', 'Preview', lang)} onClick={() => setPreview(item)}><Printer className="size-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="size-8 text-amber-600" title={t('عكس', 'Reverse', lang)} disabled={reversingId === item.id} onClick={() => reverse(item)}><RotateCcw className="size-3.5" /></Button>
                            {item.status === 'CANCELLED' && <span className="text-xs text-rose-600 font-medium px-2">{t('ملغي', 'Cancelled', lang)}</span>}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <p className="text-sm text-muted-foreground">{filtered.length} {t('سند', 'payments', lang)} | {t('إجمالي المدفوع', 'Total Paid', lang)}: <strong className="text-amber-600">{formatCurrency(totalPaid, lang)}</strong></p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing ? t('تعديل سند الصرف', 'Edit Payment', lang) : t('سند صرف جديد', 'New Payment', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5"><Label>{t('رقم السند', 'Voucher No.', lang)}</Label><Input value={form.paymentNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1.5">
              <Label>{t('المورد', 'Supplier', lang)} *</Label>
              <Select value={form.supplierId} onValueChange={v => { const s = suppliers.find(s => s.id === v); setForm(f => ({ ...f, supplierId: v, supplierName: s?.name || '', supplierInvoiceId: '' })); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر مورد', 'Select supplier', lang)} /></SelectTrigger>
                <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('الفاتورة المرتبطة (إلزامي)', 'Linked Invoice (required)')} *</Label>
              {!form.supplierId ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {t('اختر المورد أولاً لعرض فواتيره المعتمدة', 'Select a supplier first to see their approved invoices', lang)}
                </div>
              ) : supplierInvoices.length === 0 ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  {t('لا توجد فواتير معتمدة لهذا المورد — يجب اعتماد فاتورة مورد أولاً قبل إنشاء سند الصرف', 'No approved invoices for this supplier — approve a supplier invoice first before creating a payment', lang)}
                </div>
              ) : (
                <Select value={form.supplierInvoiceId || ''} onValueChange={v => {
                  const inv = supplierInvoices.find(i => i.id === v);
                  setForm(f => ({ ...f, supplierInvoiceId: v, amount: f.amount || String((inv?.totalAmount || 0) - (inv?.paidAmount || 0)) }));
                }}>
                  <SelectTrigger><SelectValue placeholder={t('اختر فاتورة معتمدة', 'Select an approved invoice', lang)} /></SelectTrigger>
                  <SelectContent>
                    {supplierInvoices.map(inv => (
                      <SelectItem key={inv.id} value={inv.id}>
                        {inv.invoiceNo} — {formatCurrency(inv.totalAmount, lang)} ({t('متبقي', 'remaining')}: {formatCurrency((inv.totalAmount || 0) - (inv.paidAmount || 0), lang)})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)} *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('المبلغ', 'Amount', lang)} *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('طريقة الدفع', 'Method', lang)}</Label>
              <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('الحساب النقدي (صندوق / بنك)', 'Cash / Bank Account', lang)} *</Label>
              <Select
                value={form.cashAccountCode || ''}
                onValueChange={v => {
                  const a = cashAccounts.find(x => x.code === v);
                  setForm(f => ({ ...f, cashAccountCode: v, cashAccountName: a?.name || '' }));
                }}
              >
                <SelectTrigger><SelectValue placeholder={t('اختر حساب الدفع', 'Select payment account', lang)} /></SelectTrigger>
                <SelectContent>
                  {cashAccounts.length === 0
                    ? <SelectItem value="none" disabled>{t('لا توجد حسابات نقدية في الدليل', 'No cash accounts in the chart', lang)}</SelectItem>
                    : cashAccounts.map(a => (
                        <SelectItem key={a.code} value={a.code}>
                          <span className="font-mono text-xs me-2 text-muted-foreground">{a.code}</span>{lang === 'ar' ? a.name : (a.nameEn || a.name)}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('المرجع / رقم الشيك', 'Reference', lang)}</Label><Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'سند صرف', en: 'Payment Voucher' }}>
        {preview && <VoucherDocument kind="PAYMENT" voucher={preview} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}