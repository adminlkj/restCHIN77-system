import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const empty = { date: '', liters: 0, pricePerLiter: 0, totalCost: 0, odometer: 0, notes: '' };

export default function FuelTab({ equipmentId }) {
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
      setRows(await base44.entities.FuelLog.filter({ equipmentId }, '-date'));
    } catch (err) {
      toast.error(err?.message || t('فشل التحميل', 'Failed to load', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [equipmentId]);

  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };

  // Auto-compute total = liters × price
  const liters = Number(form.liters) || 0;
  const price = Number(form.pricePerLiter) || 0;
  const computedTotal = +(liters * price).toFixed(2);

  const save = async () => {
    const payload = {
      equipmentId,
      date: form.date,
      liters,
      pricePerLiter: price,
      totalCost: computedTotal,
      odometer: Number(form.odometer) || 0,
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.FuelLog.update(editingId, payload);
      else await base44.entities.FuelLog.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.FuelLog.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const totalCost = rows.reduce((s, r) => s + (r.totalCost || 0), 0);
  const totalLiters = rows.reduce((s, r) => s + (r.liters || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('إجمالي الوقود', 'Total Fuel', lang)}: <span className="font-bold text-foreground">{totalLiters.toLocaleString()} {t('لتر', 'L', lang)}</span>
          <span className="mx-2">·</span>
          <span className="font-bold text-rose-700">{formatCurrency(totalCost, lang)}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-cyan-600 hover:bg-cyan-700">
          <Plus className="size-4" /> {t('تعبئة وقود', 'Add Fuel', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('اللترات', 'Liters', lang)}</TableHead>
                <TableHead>{t('سعر اللتر', 'Price/L', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('العداد', 'Odometer', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد سجلات وقود', 'No fuel records', lang)}</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                  <TableCell className="text-sm">{(r.liters || 0).toLocaleString()}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(r.pricePerLiter, lang)}</TableCell>
                  <TableCell className="text-sm font-medium text-rose-700">{formatCurrency(r.totalCost, lang)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.odometer ? r.odometer.toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="size-7 text-rose-600" onClick={() => setDeleteId(r.id)}><Trash2 className="size-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editingId ? t('تعديل تعبئة الوقود', 'Edit Fuel', lang) : t('تعبئة وقود', 'Add Fuel', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('العداد / الساعات', 'Odometer / Hours', lang)}</Label><Input type="number" value={form.odometer} onChange={e => setForm({ ...form, odometer: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('اللترات', 'Liters', lang)}</Label><Input type="number" value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('سعر اللتر', 'Price / L', lang)}</Label><Input type="number" value={form.pricePerLiter} onChange={e => setForm({ ...form, pricePerLiter: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الإجمالي', 'Total', lang)}</Label>
              <div className="h-9 flex items-center px-3 rounded-md border border-input bg-muted/40 text-sm font-medium">{formatCurrency(computedTotal, lang)}</div>
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