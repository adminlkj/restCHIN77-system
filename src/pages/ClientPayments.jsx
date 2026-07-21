import React, { useState, useEffect } from 'react';
import { Plus, Search, RefreshCw, Printer, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatDate, formatCurrency, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import DocumentPreviewDialog from '@/components/shared/DocumentPreviewDialog';
import VoucherDocument from '@/components/shared/VoucherDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { loadAccounts, selectCashAccounts } from '@/lib/postingEngine';
import { OperationEngine } from '@/lib/businessEngine';
import { toast } from 'sonner';

// Escape a literal string for safe use as a RegExp source (prevents regex injection
// from user-entered payment numbers when filtering JournalEntry.entryNo via $regex).
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const METHODS = {
  CASH:          { ar: 'نقدي', en: 'Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  CHEQUE:        { ar: 'شيك', en: 'Cheque' },
  CARD:          { ar: 'بطاقة', en: 'Card' },
};
const empty = { paymentNo: '', clientId: '', projectId: '', date: '', amount: '', method: 'BANK_TRANSFER', cashAccountCode: '', cashAccountName: '', reference: '', notes: '' };

export default function ClientPayments() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [preview, setPreview] = useState(null);
  const [items, setItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterMethod, setFilterMethod] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, cl, pr, accts] = await Promise.all([
        base44.entities.ClientPayment.list('-date', 300),
        base44.entities.Client.list(),
        base44.entities.Project.list(),
        loadAccounts(true),
      ]);
      setItems(p); setClients(cl); setProjects(pr);
      setCashAccounts(selectCashAccounts(accts));
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const clientName = (id) => clients.find(c => c.id === id)?.name || '—';

  const filtered = items.filter(i => {
    const match = !search || clientName(i.clientId).toLowerCase().includes(search.toLowerCase()) || (i.paymentNo || '').toLowerCase().includes(search.toLowerCase());
    return match && (filterMethod === 'ALL' || i.method === filterMethod);
  });

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, date: new Date().toISOString().slice(0, 10), paymentNo: nextCodeFromList(items, 'RCV', 'paymentNo') });
    setDialogOpen(true);
  };
  const _openEdit = () => toast.error(t('لا يمكن تعديل سند قبض مُرحّل — استخدم العكس', 'Cannot edit a posted receipt — use reverse', lang));
  const _askDelete = () => toast.error(t('لا يمكن حذف سند قبض مُرحّل — استخدم العكس', 'Cannot delete a posted receipt — use reverse', lang));

  const [reversingId, setReversingId] = useState(null);
  const reverse = async (item) => {
    setReversingId(item.id);
    try {
      // Server-side filter by sourceType + entryNo $regex replaces the prior unbounded
      // `filter({ isPosted: true })` (N+1 fix: cuts payload from "all posted JEs" to
      // just the ClientPayment JEs whose entryNo contains this paymentNo).
      const jes = await base44.entities.JournalEntry.filter({
        isPosted: true,
        sourceType: 'ClientPayment',
        entryNo: { $regex: escapeRegex(item.paymentNo) },
      }, '-date', 50);
      if (jes.length === 0) throw new Error(t('لا يوجد قيد مرتبط', 'No linked entry', lang));
      // مطابقة دقيقة لتفادي عكس قيد خاطئ (PMT-1 قد يُطابق PMT-10 عبر $regex).
      const exactSuffix = `-${item.paymentNo}`;
      let orig = jes.find(j => j.entryNo && j.entryNo.endsWith(exactSuffix));
      if (!orig) orig = jes[0];
      const revLines = (orig.lines || []).map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));
      await base44.entities.JournalEntry.create({
        entryNo: `${orig.entryNo}-REV-1`,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس ${orig.entryNo} — سند قبض ${item.paymentNo}`,
        lines: revLines, totalDebit: orig.totalCredit, totalCredit: orig.totalDebit,
        isPosted: true, sourceType: 'REVERSAL',
      });
      await base44.entities.ClientPayment.update(item.id, { status: 'CANCELLED' });
      toast.success(t('تم عكس السند وإنشاء قيد عكسي', 'Receipt reversed & reversal entry created', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل العكس', 'Reversal failed', lang)); }
    setReversingId(null);
  };

  const save = async () => {
    if (!form.clientId || !form.date || !form.amount)
      return toast.error(t('الزبون والتاريخ والمبلغ مطلوبة', 'Customer, date and amount required', lang));
    if (!form.cashAccountCode)
      return toast.error(t('اختيار الحساب النقدي (صندوق/بنك) مطلوب — كل تحصيل يُنشئ قيداً محاسبياً', 'A cash/bank account is required — every receipt posts a journal entry', lang));
    setSaving(true);
    try {
      const data = {
        paymentNo: form.paymentNo,
        clientId: form.clientId,
        clientName: clientName(form.clientId),
        projectId: form.projectId || undefined,
        projectName: projects.find(p => p.id === form.projectId)?.name || undefined,
        date: form.date,
        amount: Number(form.amount) || 0,
        method: form.method,
        cashAccountCode: form.cashAccountCode,
        cashAccountName: form.cashAccountName,
        reference: form.reference,
        notes: form.notes,
      };
      if (editing) { await OperationEngine.updateClientPayment(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await OperationEngine.createClientPayment(data); toast.success(t('تمت الإضافة + قيد التحصيل', 'Added + receipt entry', lang)); }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const total = filtered.reduce((s, i) => s + (i.amount || 0), 0);

  const exportColumns = [
    { header: { ar: 'رقم السند', en: 'Receipt No' }, value: (r) => r.paymentNo },
    { header: { ar: 'الزبون', en: 'Customer' }, value: (r) => clientName(r.clientId) },
    { header: { ar: 'الطلب', en: 'Order' }, value: (r) => r.projectName },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الطريقة', en: 'Method' }, value: (r) => { const m = METHODS[r.method]; return m ? (lang === 'ar' ? m.ar : m.en) : r.method; } },
    { header: { ar: 'المبلغ', en: 'Amount' }, value: (r) => r.amount || 0 },
  ];

  return (
    <ModuleLayout
      title={t('التحصيلات', 'Collections', lang)}
      subtitle={t('سندات قبض وتحصيلات الزبائن', 'Customer receipts and collections', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'التحصيلات', en: 'Collections' }} />
          <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('سند قبض', 'New Receipt', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالزبون أو رقم السند...', 'Search customer or receipt no...', lang)} className="ps-9" />
        </div>
        <Select value={filterMethod} onValueChange={setFilterMethod}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الطرق', 'All Methods', lang)}</SelectItem>
            {Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم السند', 'Receipt No', lang)}</TableHead>
                <TableHead>{t('الزبون', 'Customer', lang)}</TableHead>
                <TableHead>{t('الطلب', 'Order', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الطريقة', 'Method', lang)}</TableHead>
                <TableHead className="text-end">{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد تحصيلات', 'No collections', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const m = METHODS[item.method] || METHODS.BANK_TRANSFER;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.paymentNo || '—'}</TableCell>
                      <TableCell className="font-medium">{clientName(item.clientId)}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.projectName || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(item.date, lang)}</TableCell>
                      <TableCell className="text-sm">{lang === 'ar' ? m.ar : m.en}</TableCell>
                      <TableCell className="text-end text-sm font-medium text-emerald-700">{formatCurrency(item.amount, lang)}</TableCell>
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
      <p className="text-sm text-muted-foreground">
        {filtered.length} {t('سند', 'receipts', lang)} | {t('إجمالي التحصيل', 'Total Collected', lang)}: <strong className="text-emerald-700">{formatCurrency(total, lang)}</strong>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل السند', 'Edit Receipt', lang) : t('سند قبض جديد', 'New Receipt', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('رقم السند', 'Receipt No', lang)}</Label><Input value={form.paymentNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)} *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الزبون', 'Customer', lang)} *</Label>
              <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر زبون', 'Select customer', lang)} /></SelectTrigger>
                <SelectContent>{clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الطلب (اختياري)', 'Order (optional)', lang)}</Label>
              <Select value={form.projectId || 'NONE'} onValueChange={v => setForm(f => ({ ...f, projectId: v === 'NONE' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder={t('بدون', 'None', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">{t('بدون', 'None', lang)}</SelectItem>
                  {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('المبلغ', 'Amount', lang)} *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>{t('الطريقة', 'Method', lang)}</Label>
              <Select value={form.method} onValueChange={v => setForm(f => ({ ...f, method: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الحساب النقدي (صندوق / بنك)', 'Cash / Bank Account', lang)} *</Label>
              <Select
                value={form.cashAccountCode || ''}
                onValueChange={v => {
                  const a = cashAccounts.find(x => x.code === v);
                  setForm(f => ({ ...f, cashAccountCode: v, cashAccountName: a?.name || '' }));
                }}
              >
                <SelectTrigger><SelectValue placeholder={t('اختر حساب التحصيل', 'Select collection account', lang)} /></SelectTrigger>
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
            <div className="space-y-1 col-span-2"><Label>{t('المرجع / رقم الشيك', 'Reference', lang)}</Label><Input value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <DocumentPreviewDialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)} title={{ ar: 'سند قبض', en: 'Receipt Voucher' }}>
        {preview && <VoucherDocument kind="RECEIPT" voucher={{ ...preview, clientName: clientName(preview.clientId) }} settings={settings} lang={lang} />}
      </DocumentPreviewDialog>
    </ModuleLayout>
  );
}