import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Plus, Pencil, Trash2, FileText, Loader2, CheckCircle2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t, formatCurrency, formatDate, nextCodeFromList, CONTRACT_STATUS } from '@/lib/utils-binaa';
import ConfirmDialog from '@/components/shared/ConfirmDialog';

const emptyContract = (project) => ({
  contractNo: '',
  projectId: project.id,
  projectName: project.name,
  clientId: project.clientId || '',
  clientName: project.clientName || '',
  totalValue: 0,
  startDate: '',
  endDate: '',
  status: 'DRAFT',
  description: '',
  notes: '',
});

export default function ProjectContractsTab({ project }) {
  const { lang } = useStore();
  const { toast } = useToast();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(emptyContract(project));
  const [editingId, setEditingId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const c = await base44.entities.Contract.filter({ projectId: project.id }, '-created_date');
      setRows(c);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [project.id]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyContract(project), contractNo: nextCodeFromList(rows, 'CTR', 'contractNo') });
    setDialogOpen(true);
  };

  const openEdit = (row) => {
    if (row.status !== 'DRAFT') return;
    setEditingId(row.id);
    setForm({ ...row, status: 'DRAFT' });
    setDialogOpen(true);
  };

  const setStatus = async (row, status) => {
    await base44.entities.Contract.update(row.id, { status });
    toast({ title: t('تم تحديث الحالة', 'Status updated', lang) });
    await load();
  };

  const save = async () => {
    if (!form.contractNo?.trim()) {
      toast({ title: t('حقل مطلوب', 'Required', lang), description: t('أدخل رقم العقد', 'Enter contract number', lang), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        contractNo: form.contractNo,
        projectId: project.id,
        projectName: project.name,
        clientId: project.clientId || '',
        clientName: project.clientName || '',
        totalValue: Number(form.totalValue) || 0,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        status: 'DRAFT',
        description: form.description,
        notes: form.notes,
      };
      if (editingId) {
        await base44.entities.Contract.update(editingId, payload);
        toast({ title: t('تم التحديث', 'Updated', lang) });
      } else {
        await base44.entities.Contract.create(payload);
        toast({ title: t('تمت الإضافة', 'Created', lang) });
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      toast({ title: t('خطأ', 'Error', lang), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    try {
      await base44.entities.Contract.delete(deleteTarget.id);
      toast({ title: t('تم الحذف', 'Deleted', lang) });
      setDeleteTarget(null);
      await load();
    } catch (err) {
      toast({ title: t('خطأ', 'Error', lang), description: err.message, variant: 'destructive' });
    }
  };

  const totalValue = rows.reduce((s, r) => s + (r.totalValue || 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {t('إجمالي قيمة العقود', 'Total contracts value', lang)}: <span className="font-bold text-foreground">{formatCurrency(totalValue, lang)}</span>
        </div>
        <Button size="sm" onClick={openAdd} className="gap-1.5">
          <Plus className="size-4" /> {t('عقد جديد', 'New Contract', lang)}
        </Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('رقم العقد', 'Contract No', lang)}</TableHead>
                <TableHead>{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead>{t('البداية', 'Start', lang)}</TableHead>
                <TableHead>{t('النهاية', 'End', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead className="text-end">{t('إجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={6} className="text-center py-10"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></TableCell></TableRow>
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                    <FileText className="size-10 mx-auto mb-2 text-muted-foreground/40" />
                    {t('لا توجد عقود لهذا المشروع', 'No contracts for this project', lang)}
                  </TableCell>
                </TableRow>
              ) : rows.map(row => {
                const s = CONTRACT_STATUS[row.status] || CONTRACT_STATUS.DRAFT;
                return (
                  <TableRow key={row.id} className="hover:bg-muted/30">
                    <TableCell className="font-mono text-xs">{row.contractNo}</TableCell>
                    <TableCell>{formatCurrency(row.totalValue, lang)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(row.startDate, lang)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(row.endDate, lang)}</TableCell>
                    <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span></TableCell>
                    <TableCell className="text-end">
                      <div className="flex items-center justify-end gap-1">
                        {row.status === 'DRAFT' && <Button size="sm" variant="outline" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" onClick={() => setStatus(row, 'ACTIVE')}><CheckCircle2 className="size-3.5" />{t('تفعيل', 'Activate', lang)}</Button>}
                        {row.status === 'ACTIVE' && <Button size="sm" variant="outline" className="h-8 gap-1 text-teal-700 border-teal-200 hover:bg-teal-50" onClick={() => setStatus(row, 'COMPLETED')}><CheckCircle2 className="size-3.5" />{t('إكمال', 'Complete', lang)}</Button>}
                        {['DRAFT', 'ACTIVE'].includes(row.status) && <Button size="sm" variant="outline" className="h-8 text-rose-700 border-rose-200 hover:bg-rose-50" onClick={() => setStatus(row, 'CANCELLED')}>{t('إلغاء', 'Cancel', lang)}</Button>}
                        {row.status === 'DRAFT' && <Button size="icon" variant="ghost" className="size-8" onClick={() => openEdit(row)}><Pencil className="size-3.5" /></Button>}
                        {row.status === 'DRAFT' && <Button size="icon" variant="ghost" className="size-8 text-rose-600 hover:text-rose-700" onClick={() => setDeleteTarget(row)}><Trash2 className="size-3.5" /></Button>}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add/Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>{editingId ? t('تعديل عقد', 'Edit Contract', lang) : t('عقد جديد', 'New Contract', lang)}</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('رقم العقد', 'Contract No', lang)} *</Label>
              <Input value={form.contractNo || ''} readOnly className="bg-muted font-mono" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('العميل', 'Client', lang)}</Label>
              <Input value={form.clientName || ''} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('قيمة العقد', 'Contract Value', lang)}</Label>
              <Input type="number" value={form.totalValue ?? 0} onChange={e => set('totalValue', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Input readOnly value={t('مسودة (تُفعّل لاحقاً)', 'Draft (activate later)', lang)} className="bg-muted text-muted-foreground" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('تاريخ البدء', 'Start Date', lang)}</Label>
              <Input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('تاريخ الانتهاء', 'End Date', lang)}</Label>
              <Input type="date" value={form.endDate || ''} onChange={e => set('endDate', e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('الوصف', 'Description', lang)}</Label>
              <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('ملاحظات', 'Notes', lang)}</Label>
              <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)} disabled={saving}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="gap-1.5">
              {saving && <Loader2 className="size-4 animate-spin" />}
              {t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={t('حذف العقد', 'Delete Contract', lang)}
        description={t('هل أنت متأكد من حذف هذا العقد؟ لا يمكن التراجع.', 'Are you sure you want to delete this contract? This cannot be undone.', lang)}
      />
    </div>
  );
}