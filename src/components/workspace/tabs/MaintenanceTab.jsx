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

const TYPES = {
  PREVENTIVE: { ar: 'وقائية', en: 'Preventive' },
  CORRECTIVE: { ar: 'إصلاحية', en: 'Corrective' },
  BREAKDOWN: { ar: 'عطل', en: 'Breakdown' },
};
const STATUS = {
  OPEN: { ar: 'مفتوحة', en: 'Open', color: 'bg-amber-100 text-amber-700' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In Progress', color: 'bg-blue-100 text-blue-700' },
  COMPLETED: { ar: 'مكتملة', en: 'Completed', color: 'bg-emerald-100 text-emerald-700' },
};
const empty = { date: '', type: 'PREVENTIVE', description: '', cost: 0, vendor: '', status: 'COMPLETED', notes: '' };

export default function MaintenanceTab({ equipmentId }) {
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
      setRows(await base44.entities.MaintenanceRecord.filter({ equipmentId }, '-date'));
    } catch (err) {
      toast.error(err?.message || t('فشل التحميل', 'Failed to load', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [equipmentId]);

  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };

  const save = async () => {
    const payload = {
      equipmentId,
      date: form.date,
      type: form.type,
      description: form.description,
      cost: Number(form.cost) || 0,
      vendor: form.vendor,
      status: form.status,
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.MaintenanceRecord.update(editingId, payload);
      else await base44.entities.MaintenanceRecord.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.MaintenanceRecord.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const totalCost = rows.reduce((s, r) => s + (r.cost || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('إجمالي تكاليف الصيانة', 'Total Maintenance Cost', lang)}: <span className="font-bold text-rose-700">{formatCurrency(totalCost, lang)}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-cyan-600 hover:bg-cyan-700">
          <Plus className="size-4" /> {t('صيانة جديدة', 'New Maintenance', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('المزود', 'Vendor', lang)}</TableHead>
                <TableHead>{t('التكلفة', 'Cost', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد سجلات صيانة', 'No maintenance records', lang)}</TableCell></TableRow>
              ) : rows.map(r => {
                const s = STATUS[r.status] || STATUS.COMPLETED;
                const ty = TYPES[r.type] || TYPES.PREVENTIVE;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                    <TableCell className="text-xs">{lang === 'ar' ? ty.ar : ty.en}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{r.description}</TableCell>
                    <TableCell className="text-sm">{r.vendor || '—'}</TableCell>
                    <TableCell className="text-sm font-medium text-rose-700">{formatCurrency(r.cost, lang)}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span></TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? t('تعديل الصيانة', 'Edit Maintenance', lang) : t('صيانة جديدة', 'New Maintenance', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1">
              <Label>{t('النوع', 'Type', lang)}</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('التكلفة', 'Cost', lang)}</Label><Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('المزود', 'Vendor', lang)}</Label><Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('الوصف', 'Description', lang)}</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.date} className="bg-cyan-600 hover:bg-cyan-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف', 'Delete', lang)}
        description={t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang)} />
    </div>
  );
}