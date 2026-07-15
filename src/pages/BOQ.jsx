import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const empty = { projectId: '', itemNo: '', description: '', unit: '', quantity: '', unitPrice: '', completedPercent: '', notes: '' };

export default function BOQ() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [projects, setProjects] = useState([]);
  const [projectFilter, setProjectFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [b, pr] = await Promise.all([
        base44.entities.BOQItem.list('itemNo', 500),
        base44.entities.Project.list(),
      ]);
      setItems(b); setProjects(pr);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const projName = (id) => projects.find(p => p.id === id)?.name || '—';

  const filtered = items.filter(i => {
    const match = !search || (i.description || '').toLowerCase().includes(search.toLowerCase()) || (i.itemNo || '').toLowerCase().includes(search.toLowerCase());
    return match && (projectFilter === 'ALL' || i.projectId === projectFilter);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, projectId: projectFilter !== 'ALL' ? projectFilter : '' }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.projectId || !form.description)
      return toast.error(t('الطلب والوصف مطلوبان', 'Order and description required', lang));
    setSaving(true);
    try {
      const qty = Number(form.quantity) || 0;
      const price = Number(form.unitPrice) || 0;
      const data = {
        projectId: form.projectId, itemNo: form.itemNo, description: form.description, unit: form.unit,
        quantity: qty, unitPrice: price, totalPrice: qty * price,
        completedPercent: Number(form.completedPercent) || 0, notes: form.notes,
      };
      if (editing) { await base44.entities.BOQItem.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.BOQItem.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.BOQItem.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalContract = filtered.reduce((s, i) => s + (i.totalPrice || (i.quantity || 0) * (i.unitPrice || 0)), 0);
  const totalDone = filtered.reduce((s, i) => s + (i.totalPrice || (i.quantity || 0) * (i.unitPrice || 0)) * (i.completedPercent || 0) / 100, 0);

  return (
    <ModuleLayout
      title={t('قائمة المكوّنات', 'Ingredients List', lang)}
      subtitle={t('بنود الأعمال التعاقدية ونسب إنجازها', 'Contract work items and progress', lang)}
      actions={<Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><Plus className="size-4" />{t('بند جديد', 'New Item', lang)}</Button>}
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالبند أو الوصف...', 'Search item or description...', lang)} className="ps-9" />
        </div>
        <Select value={projectFilter} onValueChange={setProjectFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الطلبات', 'All Orders', lang)}</SelectItem>
            {projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('البند', 'Item', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                {projectFilter === 'ALL' && <TableHead>{t('الطلب', 'Order', lang)}</TableHead>}
                <TableHead>{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead>{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-end">{t('سعر الوحدة', 'Unit Price', lang)}</TableHead>
                <TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead className="w-32">{t('الإنجاز', 'Progress', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: projectFilter === 'ALL' ? 9 : 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={projectFilter === 'ALL' ? 9 : 8} className="text-center py-10 text-muted-foreground">{t('لا توجد بنود', 'No items', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const total = item.totalPrice || (item.quantity || 0) * (item.unitPrice || 0);
                  const pct = item.completedPercent || 0;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.itemNo || '—'}</TableCell>
                      <TableCell className="font-medium max-w-xs truncate">{item.description}</TableCell>
                      {projectFilter === 'ALL' && <TableCell className="text-sm text-muted-foreground">{projName(item.projectId)}</TableCell>}
                      <TableCell className="text-sm">{item.quantity ?? 0}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.unit || '—'}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(item.unitPrice, lang)}</TableCell>
                      <TableCell className="text-end text-sm font-medium">{formatCurrency(total, lang)}</TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Progress value={pct} className="h-2 flex-1" />
                          <span className="text-xs text-muted-foreground w-8">{pct}%</span>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
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
      <p className="text-sm text-muted-foreground">
        {filtered.length} {t('بند', 'items', lang)} | {t('قيمة التعاقد', 'Contract Value', lang)}: <strong className="text-slate-700">{formatCurrency(totalContract, lang)}</strong> | {t('المنجز', 'Completed', lang)}: <strong className="text-emerald-700">{formatCurrency(totalDone, lang)}</strong>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل البند', 'Edit Item', lang) : t('بند جديد', 'New Item', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1 col-span-2">
              <Label>{t('الطلب', 'Order', lang)} *</Label>
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر طلب', 'Select order', lang)} /></SelectTrigger>
                <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('رقم البند', 'Item No', lang)}</Label><Input value={form.itemNo} onChange={e => setForm(f => ({ ...f, itemNo: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الوحدة', 'Unit', lang)}</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={t('م، م2، م3...', 'm, m2...', lang)} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('الوصف', 'Description', lang)} *</Label><Input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الكمية', 'Quantity', lang)}</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('سعر الوحدة', 'Unit Price', lang)}</Label><Input type="number" value={form.unitPrice} onChange={e => setForm(f => ({ ...f, unitPrice: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('نسبة الإنجاز %', 'Completed %', lang)}</Label><Input type="number" min="0" max="100" value={form.completedPercent} onChange={e => setForm(f => ({ ...f, completedPercent: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف البند', 'Delete Item', lang)}
        description={t('سيتم حذف البند نهائياً.', 'This item will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}