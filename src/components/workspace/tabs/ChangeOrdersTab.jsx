import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
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
  ADDENDUM: { ar: 'ملحق', en: 'Addendum' },
  CHANGE_ORDER: { ar: 'أمر تغيير', en: 'Change Order' },
  VARIATION: { ar: 'تغيير كمية', en: 'Variation' },
};
const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  APPROVED: { ar: 'معتمد', en: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', color: 'bg-rose-100 text-rose-700' },
};
const empty = { orderNo: '', type: 'CHANGE_ORDER', date: '', description: '', amount: 0, status: 'DRAFT', notes: '' };

export default function ChangeOrdersTab({ projectId }) {
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
      const data = await base44.entities.ChangeOrder.filter({ projectId }, '-date');
      setRows(data);
    } catch (err) {
      toast.error(err?.message || t('فشل التحميل', 'Failed to load', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [projectId]);

  const openNew = () => { setForm({ ...empty, orderNo: nextCodeFromList(rows, 'CO', 'orderNo') }); setEditingId(null); setOpen(true); };
  const openEdit = (r) => { if (r.status !== 'DRAFT') return; setForm({ ...empty, ...r, status: 'DRAFT' }); setEditingId(r.id); setOpen(true); };
  const approve = async (r) => {
    try {
      await base44.entities.ChangeOrder.update(r.id, { status: 'APPROVED' });
      toast.success(t('تم الاعتماد', 'Approved', lang));
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الاعتماد', 'Failed to approve', lang));
    }
  };

  const save = async () => {
    const payload = {
      projectId,
      orderNo: form.orderNo,
      type: form.type,
      date: form.date,
      description: form.description,
      amount: Number(form.amount) || 0,
      status: 'DRAFT',
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.ChangeOrder.update(editingId, payload);
      else await base44.entities.ChangeOrder.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.ChangeOrder.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const approvedTotal = rows.filter(r => r.status === 'APPROVED').reduce((s, r) => s + (r.amount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('صافي أثر التغييرات المعتمدة', 'Approved Changes Impact', lang)}: <span className={`font-bold ${approvedTotal >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(approvedTotal, lang)}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="size-4" /> {t('أمر تغيير جديد', 'New Change Order', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرقم', 'No', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Amount', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد ملاحق أو أوامر تغيير', 'No change orders', lang)}</TableCell></TableRow>
              ) : rows.map(r => {
                const s = STATUS[r.status] || STATUS.DRAFT;
                const ty = TYPES[r.type] || TYPES.CHANGE_ORDER;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">{r.orderNo}</TableCell>
                    <TableCell className="text-xs">{lang === 'ar' ? ty.ar : ty.en}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{r.description}</TableCell>
                    <TableCell className={`text-sm font-medium ${(r.amount || 0) >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(r.amount, lang)}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span></TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {r.status === 'DRAFT' && <Button variant="outline" size="sm" className="h-7 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => approve(r)}><CheckCircle2 className="size-3.5" />{t('اعتماد', 'Approve', lang)}</Button>}
                        {r.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-7" onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button>}
                        {r.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-7 text-rose-600" onClick={() => setDeleteId(r.id)}><Trash2 className="size-3.5" /></Button>}
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
          <DialogHeader><DialogTitle>{editingId ? t('تعديل أمر التغيير', 'Edit Change Order', lang) : t('أمر تغيير جديد', 'New Change Order', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('الرقم', 'No', lang)}</Label><Input value={form.orderNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1">
              <Label>{t('النوع', 'Type', lang)}</Label>
              <Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('القيمة (± )', 'Amount (± )', lang)}</Label><Input type="number" value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('الوصف', 'Description', lang)}</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.orderNo || !form.date} className="bg-emerald-600 hover:bg-emerald-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف', 'Delete', lang)}
        description={t('هل أنت متأكد من الحذف؟', 'Are you sure?', lang)} />
    </div>
  );
}