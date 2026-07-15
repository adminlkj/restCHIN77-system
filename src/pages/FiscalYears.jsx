import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, Lock, LockOpen, Star } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { OperationEngine } from '@/lib/businessEngine';
import { useStore } from '@/lib/store';
import { t, formatDate, STATUS_TONE } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const STATUSES = {
  OPEN:   { ar: 'مفتوحة', en: 'Open', color: STATUS_TONE.SUCCESS, Icon: LockOpen },
  CLOSED: { ar: 'مغلقة', en: 'Closed', color: STATUS_TONE.PENDING, Icon: Lock },
  LOCKED: { ar: 'مقفلة نهائياً', en: 'Locked', color: STATUS_TONE.DANGER, Icon: Lock },
};
const empty = { name: '', year: new Date().getFullYear(), startDate: '', endDate: '', status: 'OPEN', isCurrent: false, notes: '' };

export default function FiscalYears() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.FiscalYear.list('-year', 100)); }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => {
    const y = new Date().getFullYear();
    setEditing(null);
    setForm({ ...empty, name: `السنة المالية ${y}`, year: y, startDate: `${y}-01-01`, endDate: `${y}-12-31` });
    setDialogOpen(true);
  };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name || !form.year || !form.startDate || !form.endDate)
      return toast.error(t('جميع الحقول الأساسية مطلوبة', 'All main fields required', lang));
    if (form.endDate < form.startDate)
      return toast.error(t('تاريخ النهاية يجب أن يكون بعد البداية', 'End date must be after start', lang));
    setSaving(true);
    try {
      const data = { name: form.name, year: Number(form.year), startDate: form.startDate, endDate: form.endDate, status: form.status, isCurrent: form.isCurrent, notes: form.notes };
      // Only one current year at a time
      if (data.isCurrent) {
        const others = items.filter(i => i.isCurrent && i.id !== editing?.id);
        await Promise.all(others.map(o => base44.entities.FiscalYear.update(o.id, { isCurrent: false })));
      }
      if (editing) { await base44.entities.FiscalYear.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.FiscalYear.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const fy = items.find(i => i.id === deleteId);
      if (fy && fy.status === 'CLOSED') {
        toast.error(t('لا يمكن حذف سنة مالية مغلقة', 'Cannot delete a closed fiscal year', lang));
        return;
      }
      const jes = await base44.entities.JournalEntry.list('-date', 5000);
      const hasInPeriod = jes.some(je => je.date >= fy?.startDate && je.date <= fy?.endDate);
      if (hasInPeriod) {
        toast.error(t('لا يمكن حذف سنة مالية بها قيود', 'Cannot delete a fiscal year with journal entries', lang));
        return;
      }
      await base44.entities.FiscalYear.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const [closingId, setClosingId] = useState(null);
  const toggleStatus = async (item) => {
    // الإغلاق يمرّ عبر المحرك ليولّد قيد ترحيل الأرباح المحتجزة؛ إعادة الفتح تغيير حالة مباشر.
    if (item.status === 'OPEN') {
      setClosingId(item.id);
      try {
        await OperationEngine.closeFiscalYear(item.id);
        toast.success(t('تم إقفال السنة وترحيل الأرباح المحتجزة', 'Year closed & retained earnings posted', lang));
        load();
      } catch (e) { toast.error(e?.message || t('فشل الإقفال', 'Close failed', lang)); }
      setClosingId(null);
    } else {
      try { await base44.entities.FiscalYear.update(item.id, { status: 'OPEN' }); toast.success(t('تم إعادة فتح السنة', 'Year re-opened', lang)); load(); }
      catch { toast.error(t('فشل العملية', 'Operation failed', lang)); }
    }
  };

  const exportColumns = [
    { header: { ar: 'الاسم', en: 'Name' }, value: (r) => r.name },
    { header: { ar: 'السنة', en: 'Year' }, value: (r) => r.year },
    { header: { ar: 'من', en: 'From' }, value: (r) => r.startDate },
    { header: { ar: 'إلى', en: 'To' }, value: (r) => r.endDate },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('السنوات المالية', 'Fiscal Years', lang)}
      subtitle={t('تعريف الفترات المحاسبية وإغلاقها', 'Define and close accounting periods', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={items} title={{ ar: 'السنوات المالية', en: 'Fiscal Years' }} />
          <Button onClick={openNew} className="gap-2 bg-teal-600 hover:bg-teal-700"><Plus className="size-4" />{t('سنة مالية جديدة', 'New Fiscal Year', lang)}</Button>
        </div>
      }
    >
      <div className="flex justify-end">
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead>{t('السنة', 'Year', lang)}</TableHead>
                <TableHead>{t('من', 'From', lang)}</TableHead>
                <TableHead>{t('إلى', 'To', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : items.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد سنوات مالية', 'No fiscal years', lang)}</TableCell></TableRow>
                : items.map(item => {
                  const st = STATUSES[item.status] || STATUSES.OPEN;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-medium flex items-center gap-2">
                        {item.name}
                        {item.isCurrent && <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-700 border border-teal-200"><Star className="size-2.5" />{t('جارية', 'Current', lang)}</span>}
                      </TableCell>
                      <TableCell className="font-mono text-sm">{item.year}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(item.startDate, lang)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(item.endDate, lang)}</TableCell>
                      <TableCell><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}><st.Icon className="size-3" />{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {item.status !== 'LOCKED' && <Button variant="ghost" size="sm" className="h-8 text-xs" disabled={closingId === item.id} onClick={() => toggleStatus(item)}>{closingId === item.id ? t('جارٍ...', '...', lang) : item.status === 'OPEN' ? t('إقفال', 'Close', lang) : t('فتح', 'Open', lang)}</Button>}
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل السنة المالية', 'Edit Fiscal Year', lang) : t('سنة مالية جديدة', 'New Fiscal Year', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1 col-span-2"><Label>{t('الاسم', 'Name', lang)} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('السنة', 'Year', lang)} *</Label><Input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('تاريخ البداية', 'Start Date', lang)} *</Label><Input type="date" value={form.startDate} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('تاريخ النهاية', 'End Date', lang)} *</Label><Input type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></div>
            <label className="col-span-2 flex items-center gap-2 text-sm cursor-pointer pt-1">
              <input type="checkbox" checked={form.isCurrent} onChange={e => setForm(f => ({ ...f, isCurrent: e.target.checked }))} className="size-4 accent-teal-600" />
              {t('تعيينها كالسنة المالية الجارية', 'Set as current fiscal year', lang)}
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف السنة المالية', 'Delete Fiscal Year', lang)}
        description={t('سيتم حذف السنة المالية نهائياً.', 'This fiscal year will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}