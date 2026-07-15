import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const empty = { itemNo: '', description: '', unit: '', quantity: 0, unitPrice: 0, completedPercent: 0, notes: '' };

export default function BoqTab({ projectId }) {
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
      const data = await base44.entities.BOQItem.filter({ projectId });
      setRows(data);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البنود', 'Failed to load items', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [projectId]);

  const openNew = () => { setForm(empty); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r }); setEditingId(r.id); setOpen(true); };

  const save = async () => {
    const quantity = Number(form.quantity) || 0;
    const unitPrice = Number(form.unitPrice) || 0;
    const payload = {
      projectId,
      itemNo: form.itemNo,
      description: form.description,
      unit: form.unit,
      quantity,
      unitPrice,
      totalPrice: quantity * unitPrice,
      completedPercent: Number(form.completedPercent) || 0,
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.BOQItem.update(editingId, payload);
      else await base44.entities.BOQItem.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.BOQItem.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const totalContract = rows.reduce((s, r) => s + (r.totalPrice || 0), 0);
  const totalEarned = rows.reduce((s, r) => s + (r.totalPrice || 0) * (r.completedPercent || 0) / 100, 0);
  const overallPercent = totalContract > 0 ? Math.round((totalEarned / totalContract) * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-3">
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('قيمة البنود', 'BOQ Value', lang)}</div>
          <div className="text-base font-bold">{formatCurrency(totalContract, lang)}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('المنجز', 'Earned', lang)}</div>
          <div className="text-base font-bold text-emerald-700">{formatCurrency(totalEarned, lang)}</div>
        </Card>
        <Card className="p-3 text-center">
          <div className="text-xs text-muted-foreground">{t('نسبة الإنجاز', 'Progress', lang)}</div>
          <div className="text-base font-bold text-blue-700">{overallPercent}%</div>
        </Card>
      </div>

      <div className="flex justify-end">
        <Button size="sm" onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="size-4" /> {t('بند جديد', 'New Item', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم', 'No', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead>{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead>{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('الإنجاز', 'Progress', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد بنود', 'No items', lang)}</TableCell></TableRow>
              ) : rows.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/30">
                  <TableCell className="font-mono text-xs">{r.itemNo || '—'}</TableCell>
                  <TableCell className="text-sm">{r.description}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{r.unit || '—'}</TableCell>
                  <TableCell className="text-sm">{r.quantity}</TableCell>
                  <TableCell className="text-sm">{formatCurrency(r.unitPrice, lang)}</TableCell>
                  <TableCell className="text-sm font-medium">{formatCurrency(r.totalPrice, lang)}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${Math.min(r.completedPercent || 0, 100)}%` }} />
                      </div>
                      <span className="text-xs">{r.completedPercent || 0}%</span>
                    </div>
                  </TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? t('تعديل بند', 'Edit Item', lang) : t('بند جديد', 'New Item', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('رقم البند', 'Item No', lang)}</Label><Input value={form.itemNo} onChange={e => setForm({ ...form, itemNo: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('الوحدة', 'Unit', lang)}</Label><Input value={form.unit} onChange={e => setForm({ ...form, unit: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('الوصف', 'Description', lang)}</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('الكمية', 'Quantity', lang)}</Label><Input type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('سعر الوحدة', 'Unit Price', lang)}</Label><Input type="number" value={form.unitPrice} onChange={e => setForm({ ...form, unitPrice: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('نسبة الإنجاز %', 'Progress %', lang)}</Label><Input type="number" value={form.completedPercent} onChange={e => setForm({ ...form, completedPercent: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.description} className="bg-emerald-600 hover:bg-emerald-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف البند', 'Delete Item', lang)}
        description={t('هل أنت متأكد من حذف هذا البند؟', 'Are you sure you want to delete this item?', lang)} />
    </div>
  );
}