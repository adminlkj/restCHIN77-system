import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const STATUSES = {
  OPEN: { ar: 'مفتوحة', en: 'Open', color: 'bg-amber-100 text-amber-700' },
  PARTIALLY_DEDUCTED: { ar: 'مستقطعة جزئياً', en: 'Partial', color: 'bg-blue-100 text-blue-700' },
  SETTLED: { ar: 'مسددة', en: 'Settled', color: 'bg-emerald-100 text-emerald-700' },
};
const empty = { date: '', amount: 0, deductedAmount: 0, status: 'OPEN', reason: '', notes: '' };

export default function AdvancesTab({ employeeId, onChange }) {
  const { lang } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      setRows(await base44.entities.EmployeeAdvance.filter({ employeeId }, '-date'));
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل السلف', 'Failed to load advances', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [employeeId]);

  const openNew = () => { setForm({ ...empty, date: new Date().toISOString().slice(0, 10) }); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };

  const save = async () => {
    const amount = Number(form.amount) || 0;
    const deductedAmount = Number(form.deductedAmount) || 0;
    if (deductedAmount > amount) return;
    const status = deductedAmount >= amount ? 'SETTLED' : deductedAmount > 0 ? 'PARTIALLY_DEDUCTED' : 'OPEN';
    const payload = {
      employeeId, date: form.date,
      amount,
      deductedAmount,
      status, reason: form.reason, notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.EmployeeAdvance.update(editingId, payload);
      else await base44.entities.EmployeeAdvance.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false); load(); onChange?.();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.EmployeeAdvance.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null); load(); onChange?.();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const totalOpen = rows.filter(r => r.status !== 'SETTLED').reduce((s, r) => s + ((r.amount || 0) - (r.deductedAmount || 0)), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('الرصيد المفتوح', 'Open Balance', lang)}: <span className="font-bold text-amber-700">{formatCurrency(totalOpen, lang)}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-violet-600 hover:bg-violet-700"><Plus className="size-4" /> {t('سلفة جديدة', 'New Advance', lang)}</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('السبب', 'Reason', lang)}</TableHead>
                <TableHead>{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead>{t('المستقطع', 'Deducted', lang)}</TableHead>
                <TableHead>{t('المتبقي', 'Remaining', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
                : rows.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد سلف', 'No advances', lang)}</TableCell></TableRow>
                : rows.map(r => {
                  const st = STATUSES[r.status] || STATUSES.OPEN;
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                      <TableCell className="text-sm">{r.reason || '—'}</TableCell>
                      <TableCell className="text-sm font-medium">{formatCurrency(r.amount, lang)}</TableCell>
                      <TableCell className="text-sm text-emerald-600">{formatCurrency(r.deductedAmount, lang)}</TableCell>
                      <TableCell className="text-sm font-medium text-amber-700">{formatCurrency((r.amount || 0) - (r.deductedAmount || 0), lang)}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-7 text-rose-600" onClick={() => setDeleteId(r.id)}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? t('تعديل السلفة', 'Edit Advance', lang) : t('سلفة جديدة', 'New Advance', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('المبلغ', 'Amount', lang)}</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('المستقطع', 'Deducted', lang)}</Label><Input type="number" value={form.deductedAmount} onChange={e => setForm({ ...form, deductedAmount: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('السبب', 'Reason', lang)}</Label><Input value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.date || !form.amount} className="bg-violet-600 hover:bg-violet-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف', 'Delete', lang)} description={t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang)} />
    </div>
  );
}