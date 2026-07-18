import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, CheckCircle, XCircle, Undo2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const emptyLine = { accountCode: '', accountName: '', debit: '', credit: '', description: '' };
const empty = { entryNo: '', date: '', description: '', isPosted: false, sourceType: '', lines: [{ ...emptyLine }, { ...emptyLine }] };

export default function JournalEntries() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPosted, setFilterPosted] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const [accounts, setAccounts] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [je, acc] = await Promise.all([
        base44.entities.JournalEntry.list('-date', 200),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setItems(je);
      setAccounts((acc || []).filter(a => a.isPostable !== false));
    }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.entryNo?.toLowerCase().includes(search.toLowerCase()) || i.description?.toLowerCase().includes(search.toLowerCase());
    const isReversed = items.some(je => je.entryNo?.startsWith(`${i.entryNo}-REV`));
    const isReversal = i.sourceType === 'Reversal' || (i.entryNo || '').includes('-REV');
    let matchPosted;
    if (filterPosted === 'ALL') matchPosted = true;
    else if (filterPosted === 'POSTED') matchPosted = i.isPosted && !isReversal;
    else if (filterPosted === 'DRAFT') matchPosted = !i.isPosted;
    else if (filterPosted === 'REVERSED') matchPosted = isReversal || isReversed;
    return match && matchPosted;
  });

  const openNew = () => {
    setEditing(null);
    setForm({
      ...empty,
      entryNo: nextCodeFromList(items, 'JE', 'entryNo'),
      date: new Date().toISOString().slice(0, 10),
      lines: [{ ...emptyLine }, { ...emptyLine }],
    });
    setDialogOpen(true);
  };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item, lines: item.lines?.length ? item.lines : [{ ...emptyLine }, { ...emptyLine }] }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const updateLine = (idx, field, val) => setForm(f => { const lines = [...f.lines]; lines[idx] = { ...lines[idx], [field]: val }; return { ...f, lines }; });
  const pickAccount = (idx, code) => {
    const acc = accounts.find(a => a.code === code);
    setForm(f => { const lines = [...f.lines]; lines[idx] = { ...lines[idx], accountCode: code, accountName: acc?.name || '' }; return { ...f, lines }; });
  };
  const addLine = () => setForm(f => ({ ...f, lines: [...f.lines, { ...emptyLine }] }));
  const removeLine = (idx) => { if (form.lines.length <= 2) return; setForm(f => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) })); };

  // نُقرّب لخانتين لتجنب تراكم أخطاء الكسور العشرية التي تُظهر قيداً متوازناً كغير متوازن.
  const totalDebit = +form.lines.reduce((s, l) => s + (parseFloat(l.debit) || 0), 0).toFixed(2);
  const totalCredit = +form.lines.reduce((s, l) => s + (parseFloat(l.credit) || 0), 0).toFixed(2);
  const isBalanced = Math.abs(totalDebit - totalCredit) < 0.01 && totalDebit > 0;

  const save = async () => {
    if (!form.entryNo || !form.date) return toast.error(t('رقم القيد والتاريخ مطلوبان', 'Entry No. and date required', lang));
    if (!isBalanced) return toast.error(t('القيد غير متوازن — المدين يجب أن يساوي الدائن', 'Entry not balanced — Debit must equal Credit', lang));
    // كل بند فعّال (له مبلغ) يجب أن يرتبط بحساب — لا يُقبل بند بمبلغ بلا حساب.
    const activeLines = form.lines.filter(l => (parseFloat(l.debit) || 0) !== 0 || (parseFloat(l.credit) || 0) !== 0);
    if (activeLines.some(l => !l.accountCode)) return toast.error(t('كل بند بمبلغ يجب أن يُحدَّد له حساب', 'Every line with an amount must have an account', lang));
    // لا يُسمح ببند فيه مدين ودائن معاً — كل بند إما مدين أو دائن.
    if (activeLines.some(l => (parseFloat(l.debit) || 0) !== 0 && (parseFloat(l.credit) || 0) !== 0)) {
      return toast.error(t('البند لا يكون مديناً ودائناً معاً', 'A line cannot be both debit and credit', lang));
    }
    setSaving(true);
    try {
      // نحفظ البنود الفعّالة فقط (بمبلغ وحساب) ونُقرّب مبالغها لخانتين.
      const lines = activeLines.map(l => ({ ...l, debit: +(parseFloat(l.debit) || 0).toFixed(2), credit: +(parseFloat(l.credit) || 0).toFixed(2) }));
      const data = { ...form, lines, totalDebit, totalCredit };
      if (editing) { await base44.entities.JournalEntry.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.JournalEntry.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  // القيود المرحّلة لا يُلغى ترحيلها ولا تُعدّل — يُسمح فقط بترحيل المسودة.
  const togglePost = async (item) => {
    if (item.isPosted) return;
    try {
      await base44.entities.JournalEntry.update(item.id, { isPosted: true });
      toast.success(t('تم الترحيل', 'Posted', lang));
      load();
    } catch { toast.error(t('فشل العملية', 'Operation failed', lang)); }
  };

  // عكس القيد المرحّل: إنشاء قيد مضاد (مدين↔دائن) بدل تعديل القيد الأصلي أو حذفه.
  // رقم القيد العكسي يُولّد ب_suffix فريد لمنع التكرار: -REV, -REV-2, -REV-3, ...
  const [reversing, setReversing] = useState(false);
  const [reverseTarget, setReverseTarget] = useState(null);
  const reverseEntry = async () => {
    const item = reverseTarget;
    if (!item) return;
    setReversing(true);
    try {
      // البحث عن رقم قيد عكسي فريد لمنع التكرار — نزيد العدّاد حتى نجد رقماً غير مستخدم فعلياً.
      const baseRevNo = `${item.entryNo}-REV`;
      const used = new Set(items.map(je => je.entryNo));
      let revNo = baseRevNo;
      let n = 2;
      while (used.has(revNo)) { revNo = `${baseRevNo}-${n}`; n += 1; }

      const lines = (item.lines || []).map(l => ({
        accountCode: l.accountCode, accountName: l.accountName,
        debit: l.credit || 0, credit: l.debit || 0,
        description: t('عكس', 'Reversal', lang) + (l.description ? ` — ${l.description}` : ''),
      }));
      await base44.entities.JournalEntry.create({
        entryNo: revNo,
        date: new Date().toISOString().slice(0, 10),
        description: t('عكس القيد', 'Reversal of', lang) + ` ${item.entryNo}`,
        sourceType: 'Reversal', isPosted: true,
        totalDebit: item.totalCredit || 0, totalCredit: item.totalDebit || 0,
        lines,
      });
      toast.success(t('تم عكس القيد', 'Entry reversed', lang));
      setReverseTarget(null);
      load();
    } catch { toast.error(t('فشل عكس القيد', 'Reversal failed', lang)); }
    setReversing(false);
  };

  const remove = async () => {
    // حماية: لا يُحذف قيد مرحّل — التصحيح يكون بالعكس لا بالحذف.
    const target = items.find(i => i.id === deleteId);
    if (target?.isPosted) { toast.error(t('لا يمكن حذف قيد مرحّل — استخدم العكس', 'Cannot delete a posted entry — use reversal', lang)); return; }
    try { await base44.entities.JournalEntry.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalPostedDebit = items.filter(i => i.isPosted).reduce((s, i) => s + (i.totalDebit || 0), 0);
  const totalPostedCredit = items.filter(i => i.isPosted).reduce((s, i) => s + (i.totalCredit || 0), 0);
  const globalBalanced = Math.abs(totalPostedDebit - totalPostedCredit) < 0.01;

  const exportColumns = [
    { header: { ar: 'رقم القيد', en: 'Entry No' }, value: (r) => r.entryNo },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الوصف', en: 'Description' }, value: (r) => r.description },
    { header: { ar: 'إجمالي المدين', en: 'Total Debit' }, value: (r) => r.totalDebit || 0 },
    { header: { ar: 'إجمالي الدائن', en: 'Total Credit' }, value: (r) => r.totalCredit || 0 },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => r.isPosted ? t('مرحّل', 'Posted', lang) : t('مسودة', 'Draft', lang) },
  ];

  return (
    <ModuleLayout
      title={t('دفتر اليومية', 'Journal Entries', lang)}
      subtitle={t('القيود المحاسبية اليومية', 'Daily accounting entries', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'دفتر اليومية', en: 'Journal Entries' }} />
          <Button onClick={openNew} className="gap-2 bg-teal-600 hover:bg-teal-700"><Plus className="size-4" />{t('قيد جديد', 'New Entry', lang)}</Button>
        </div>
      }
    >
      {/* Balance Summary */}
      <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${globalBalanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
        {globalBalanced ? <CheckCircle className="size-4 text-emerald-600 shrink-0" /> : <XCircle className="size-4 text-rose-600 shrink-0" />}
        <span className={globalBalanced ? 'text-emerald-700' : 'text-rose-700'}>
          {t('المرحّل', 'Posted', lang)}: {t('مدين', 'Dr', lang)} {formatCurrency(totalPostedDebit, lang)} | {t('دائن', 'Cr', lang)} {formatCurrency(totalPostedCredit, lang)}
          {globalBalanced ? ` — ${t('✓ متوازن', '✓ Balanced', lang)}` : ` — ${t('⚠ غير متوازن', '⚠ Unbalanced', lang)}`}
        </span>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <div className="flex gap-1">
          {[['ALL', t('الكل', 'All', lang)], ['POSTED', t('مرحّلة', 'Posted', lang)], ['DRAFT', t('مسودة', 'Draft', lang)], ['REVERSED', t('معكوسة', 'Reversed', lang)]].map(([v, l]) => (
            <button key={v} onClick={() => setFilterPosted(v)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${filterPosted === v ? 'bg-teal-600 text-white' : 'bg-muted hover:bg-muted/80'}`}>
              {l}
            </button>
          ))}
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم القيد', 'Entry No.', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('إجمالي المدين', 'Total Debit', lang)}</TableHead>
                <TableHead>{t('إجمالي الدائن', 'Total Credit', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد قيود', 'No entries', lang)}</TableCell></TableRow>
                : filtered.map(item => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs font-medium">{item.entryNo}</TableCell>
                    <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                    <TableCell className="font-medium">{item.description}</TableCell>
                    <TableCell className="tabular-nums">{Number(item.totalDebit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell className="tabular-nums">{Number(item.totalCredit || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</TableCell>
                    <TableCell>
                      <button onClick={() => togglePost(item)}
                        className={`flex items-center gap-1 text-xs font-medium px-2 py-1 rounded-full transition-colors ${item.isPosted ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                        {item.isPosted ? <CheckCircle className="size-3" /> : null}
                        {item.isPosted ? t('مرحّل', 'Posted', lang) : t('مسودة', 'Draft', lang)}
                      </button>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {item.isPosted ? (
                          item.sourceType === 'Reversal' || (item.entryNo || '').includes('-REV') ? (
                            <span className="text-xs text-amber-600 font-medium px-2 py-1 bg-amber-50 rounded-full">{t('قيد عكسي', 'Reversal Entry', lang)}</span>
                          ) : items.some(je => je.entryNo?.startsWith(`${item.entryNo}-REV`)) ? (
                            <span className="text-xs text-rose-600 font-medium px-2 py-1 bg-rose-50 rounded-full">{t('تم عكسه', 'Reversed', lang)}</span>
                          ) : (
                            <Button variant="ghost" size="sm" className="h-8 gap-1 text-amber-600 hover:text-amber-700" onClick={() => setReverseTarget(item)}>
                              <Undo2 className="size-3.5" />{t('عكس', 'Reverse', lang)}
                            </Button>
                          )
                        ) : (
                          <>
                            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                            <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل القيد', 'Edit Entry', lang) : t('قيد جديد', 'New Journal Entry', lang)}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5"><Label>{t('رقم القيد', 'Entry No.', lang)} *</Label><Input value={form.entryNo} readOnly className="bg-muted font-mono" /></div>
              <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)} *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div className="space-y-1.5"><Label>{t('المصدر', 'Source', lang)}</Label><Input value={form.sourceType} onChange={e => setForm(f => ({ ...f, sourceType: e.target.value }))} /></div>
              <div className="col-span-3 space-y-1.5"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} rows={2} /></div>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label>{t('بنود القيد', 'Entry Lines', lang)}</Label>
                <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="size-3.5 me-1" />{t('إضافة بند', 'Add Line', lang)}</Button>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs" colSpan={2}>{t('الحساب', 'Account', lang)}</TableHead>
                      <TableHead className="text-xs">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-xs">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-xs">{t('بيان', 'Note', lang)}</TableHead>
                      <TableHead className="w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {form.lines.map((line, idx) => (
                      <TableRow key={idx}>
                        <TableCell className="p-1" colSpan={2}>
                          {accounts.length > 0 ? (
                            <Select value={line.accountCode} onValueChange={v => pickAccount(idx, v)}>
                              <SelectTrigger className="h-8 text-xs"><SelectValue placeholder={t('اختر الحساب', 'Select account', lang)} /></SelectTrigger>
                              <SelectContent>
                                {accounts.map(a => (
                                  <SelectItem key={a.code} value={a.code} className="text-xs">
                                    <span className="font-mono text-muted-foreground me-1">{a.code}</span> {a.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          ) : (
                            <div className="flex gap-1">
                              <Input value={line.accountCode} onChange={e => updateLine(idx, 'accountCode', e.target.value)} className="h-8 text-xs w-20" placeholder={t('كود', 'Code', lang)} />
                              <Input value={line.accountName} onChange={e => updateLine(idx, 'accountName', e.target.value)} className="h-8 text-xs" placeholder={t('اسم الحساب', 'Name', lang)} />
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="p-1"><Input type="number" value={line.debit} onChange={e => { updateLine(idx, 'debit', e.target.value); if (e.target.value) updateLine(idx, 'credit', ''); }} className="h-8 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input type="number" value={line.credit} onChange={e => { updateLine(idx, 'credit', e.target.value); if (e.target.value) updateLine(idx, 'debit', ''); }} className="h-8 text-xs" /></TableCell>
                        <TableCell className="p-1"><Input value={line.description} onChange={e => updateLine(idx, 'description', e.target.value)} className="h-8 text-xs" /></TableCell>
                        <TableCell className="p-1"><Button type="button" variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => removeLine(idx)} disabled={form.lines.length <= 2}><Trash2 className="size-3" /></Button></TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/30 font-medium">
                      <TableCell colSpan={2} className="text-xs font-semibold">{t('الإجمالي', 'Total', lang)}</TableCell>
                      <TableCell className="text-xs font-bold text-emerald-700">{formatCurrency(totalDebit, lang)}</TableCell>
                      <TableCell className="text-xs font-bold text-blue-700">{formatCurrency(totalCredit, lang)}</TableCell>
                      <TableCell colSpan={2} className="text-xs">
                        {isBalanced
                          ? <span className="text-emerald-600 font-semibold">{t('✓ متوازن', '✓ Balanced', lang)}</span>
                          : <span className="text-rose-600">{t('غير متوازن', 'Not balanced', lang)} ({formatCurrency(Math.abs(totalDebit - totalCredit), lang)})</span>}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving || !isBalanced} className="bg-teal-600 hover:bg-teal-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف القيد', 'Delete Entry', lang)}
        description={t('سيتم حذف القيد المحاسبي نهائياً.', 'This journal entry will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <ConfirmDialog open={!!reverseTarget} onOpenChange={(o) => !o && setReverseTarget(null)}
        title={t('عكس القيد', 'Reverse Entry', lang)}
        description={reverseTarget && items.some(je => je.entryNo?.startsWith(`${reverseTarget.entryNo}-REV`))
          ? t('⚠ هذا القيد سبق عكسه. سيتم إنشاء قيد عكسي إضافي برقم فريد. متابعة؟', '⚠ This entry has already been reversed. An additional reversing entry will be created with a unique number. Continue?', lang)
          : t('سيتم إنشاء قيد عكسي مضاد للقيد المرحّل دون تعديل الأصل. متابعة؟', 'A reversing entry will be created against the posted entry without altering the original. Continue?', lang)}
        onConfirm={reverseEntry} confirmLabel={reversing ? t('جاري...', 'Working...', lang) : t('عكس', 'Reverse', lang)} />
    </ModuleLayout>
  );
}