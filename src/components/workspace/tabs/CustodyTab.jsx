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

const STATUSES = {
  ASSIGNED: { ar: 'مسلّمة', en: 'Assigned', color: 'bg-blue-100 text-blue-700' },
  RETURNED: { ar: 'مُعادة', en: 'Returned', color: 'bg-emerald-100 text-emerald-700' },
  LOST: { ar: 'مفقودة', en: 'Lost', color: 'bg-rose-100 text-rose-700' },
};
const empty = { item: '', date: '', value: 0, status: 'ASSIGNED', returnDate: '', notes: '' };

export default function CustodyTab({ employeeId, onChange }) {
  const { lang } = useStore();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editingId, setEditingId] = useState(null);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    setRows(await base44.entities.EmployeeCustody.filter({ employeeId }, '-date'));
    setLoading(false);
  };
  useEffect(() => { load(); }, [employeeId]);

  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };

  const save = async () => {
    const payload = {
      employeeId, item: form.item, date: form.date,
      value: Number(form.value) || 0, status: form.status,
      returnDate: form.returnDate, notes: form.notes,
    };
    if (editingId) await base44.entities.EmployeeCustody.update(editingId, payload);
    else await base44.entities.EmployeeCustody.create(payload);
    setOpen(false); load(); onChange?.();
  };

  const remove = async () => { await base44.entities.EmployeeCustody.delete(deleteId); setDeleteId(null); load(); onChange?.(); };

  const assignedCount = rows.filter(r => r.status === 'ASSIGNED').length;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('عهد قائمة', 'Active Custody', lang)}: <span className="font-bold text-indigo-700">{assignedCount}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-violet-600 hover:bg-violet-700"><Plus className="size-4" /> {t('عهدة جديدة', 'New Custody', lang)}</Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('العهدة', 'Item', lang)}</TableHead>
                <TableHead>{t('تاريخ التسليم', 'Assigned', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead>{t('تاريخ الإعادة', 'Return', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
                : rows.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد عهد', 'No custody items', lang)}</TableCell></TableRow>
                : rows.map(r => {
                  const st = STATUSES[r.status] || STATUSES.ASSIGNED;
                  return (
                    <TableRow key={r.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm font-medium">{r.item}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                      <TableCell className="text-sm">{formatCurrency(r.value, lang)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{r.returnDate ? formatDate(r.returnDate, lang) : '—'}</TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? t('تعديل العهدة', 'Edit Custody', lang) : t('عهدة جديدة', 'New Custody', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1 col-span-2"><Label>{t('وصف العهدة', 'Item', lang)}</Label><Input value={form.item} onChange={e => setForm({ ...form, item: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('تاريخ التسليم', 'Assigned Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('القيمة', 'Value', lang)}</Label><Input type="number" value={form.value} onChange={e => setForm({ ...form, value: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('تاريخ الإعادة', 'Return Date', lang)}</Label><Input type="date" value={form.returnDate} onChange={e => setForm({ ...form, returnDate: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.item || !form.date} className="bg-violet-600 hover:bg-violet-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف', 'Delete', lang)} description={t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang)} />
    </div>
  );
}