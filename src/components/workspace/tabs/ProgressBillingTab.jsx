import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  SUBMITTED: { ar: 'مقدّم', en: 'Submitted', color: 'bg-blue-100 text-blue-700' },
  APPROVED: { ar: 'معتمد', en: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  PAID: { ar: 'مدفوع', en: 'Paid', color: 'bg-teal-100 text-teal-700' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', color: 'bg-rose-100 text-rose-700' },
};
const empty = { certificateNo: '', date: '', cumulativePercent: 0, grossAmount: 0, retentionAmount: 0, previousAmount: 0, status: 'DRAFT', notes: '' };

export default function ProgressBillingTab({ projectId }) {
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
      const data = await base44.entities.ProgressBilling.filter({ projectId }, '-date');
      setRows(data);
    } catch (err) {
      toast.error(err?.message || t('فشل التحميل', 'Failed to load', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [projectId]);

  const openNew = () => { setForm({ ...empty, certificateNo: nextCodeFromList(rows, 'CRT', 'certificateNo') }); setEditingId(null); setOpen(true); };
  const openEdit = (r) => {
    if (r.status !== 'DRAFT') return;
    setForm({ ...empty, ...r, status: 'DRAFT' }); setEditingId(r.id); setOpen(true);
  };
  const approve = async (r) => {
    try {
      await base44.entities.ProgressBilling.update(r.id, { status: 'APPROVED' });
      toast.success(t('تم الاعتماد', 'Approved', lang));
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الاعتماد', 'Failed to approve', lang));
    }
  };

  const save = async () => {
    const gross = Number(form.grossAmount) || 0;
    const retention = Number(form.retentionAmount) || 0;
    const previous = Number(form.previousAmount) || 0;
    const payload = {
      projectId,
      certificateNo: form.certificateNo,
      date: form.date,
      cumulativePercent: Number(form.cumulativePercent) || 0,
      grossAmount: gross,
      retentionAmount: retention,
      previousAmount: previous,
      netAmount: gross - retention - previous,
      status: 'DRAFT',
      notes: form.notes,
    };
    try {
      if (editingId) await base44.entities.ProgressBilling.update(editingId, payload);
      else await base44.entities.ProgressBilling.create(payload);
      toast.success(t('تم الحفظ', 'Saved', lang));
      setOpen(false);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const remove = async () => {
    try {
      await base44.entities.ProgressBilling.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحذف', 'Failed to delete', lang));
    }
  };

  const totalNet = rows.reduce((s, r) => s + (r.netAmount || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('إجمالي صافي المستخلصات', 'Total Net Billed', lang)}: <span className="font-bold text-foreground">{formatCurrency(totalNet, lang)}</span>
        </div>
        <Button size="sm" onClick={openNew} className="bg-emerald-600 hover:bg-emerald-700">
          <Plus className="size-4" /> {t('مستخلص جديد', 'New Certificate', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم المستخلص', 'Certificate No', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الإنجاز التراكمي', 'Cum. %', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Gross', lang)}</TableHead>
                <TableHead>{t('المحتجز', 'Retention', lang)}</TableHead>
                <TableHead>{t('الصافي', 'Net', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">...</TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد مستخلصات', 'No certificates', lang)}</TableCell></TableRow>
              ) : rows.map(r => {
                const s = STATUS[r.status] || STATUS.DRAFT;
                return (
                  <TableRow key={r.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">{r.certificateNo}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</TableCell>
                    <TableCell className="text-sm">{r.cumulativePercent || 0}%</TableCell>
                    <TableCell className="text-sm">{formatCurrency(r.grossAmount, lang)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{formatCurrency(r.retentionAmount, lang)}</TableCell>
                    <TableCell className="text-sm font-medium">{formatCurrency(r.netAmount, lang)}</TableCell>
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
          <DialogHeader><DialogTitle>{editingId ? t('تعديل مستخلص', 'Edit Certificate', lang) : t('مستخلص جديد', 'New Certificate', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>{t('رقم المستخلص', 'Certificate No', lang)}</Label><Input value={form.certificateNo} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('الإنجاز التراكمي %', 'Cumulative %', lang)}</Label><Input type="number" value={form.cumulativePercent} onChange={e => setForm({ ...form, cumulativePercent: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('القيمة الإجمالية', 'Gross Amount', lang)}</Label><Input type="number" value={form.grossAmount} onChange={e => setForm({ ...form, grossAmount: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('المحتجزات', 'Retention', lang)}</Label><Input type="number" value={form.retentionAmount} onChange={e => setForm({ ...form, retentionAmount: e.target.value })} /></div>
            <div className="space-y-1"><Label>{t('السابق', 'Previous', lang)}</Label><Input type="number" value={form.previousAmount} onChange={e => setForm({ ...form, previousAmount: e.target.value })} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={!form.certificateNo || !form.date} className="bg-emerald-600 hover:bg-emerald-700">{t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={!!deleteId} onOpenChange={o => !o && setDeleteId(null)} onConfirm={remove}
        title={t('حذف المستخلص', 'Delete Certificate', lang)}
        description={t('هل أنت متأكد من حذف هذا المستخلص؟', 'Are you sure you want to delete this certificate?', lang)} />
    </div>
  );
}