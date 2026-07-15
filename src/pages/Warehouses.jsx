import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, Warehouse as WarehouseIcon, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const TYPES = {
  CENTRAL: { ar: 'مخزن مركزي', en: 'Central', color: 'bg-teal-100 text-teal-700' },
  PROJECT: { ar: 'مخزن طلب', en: 'Order', color: 'bg-emerald-100 text-emerald-700' },
  TRANSIT: { ar: 'مخزن عبور', en: 'Transit', color: 'bg-amber-100 text-amber-700' },
};
const empty = { code: '', name: '', type: 'PROJECT', projectId: '', costCenter: '', keeper: '', location: '', isActive: true, notes: '' };

export default function Warehouses() {
  const { lang } = useStore();
  const [warehouses, setWarehouses] = useState([]);
  const [projects, setProjects] = useState([]);
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
      const [wh, pr] = await Promise.all([
        base44.entities.Warehouse.list('code', 500),
        base44.entities.Project.list('-created_date', 500),
      ]);
      setWarehouses(wh || []);
      setProjects(pr || []);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = warehouses.filter(w =>
    !search || w.name?.toLowerCase().includes(search.toLowerCase()) || w.code?.toLowerCase().includes(search.toLowerCase())
  );

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(warehouses, 'WH') }); setDialogOpen(true); };
  const openEdit = (w) => { setEditing(w); setForm({ ...empty, ...w }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.code || !form.name) return toast.error(t('الرمز والاسم مطلوبان', 'Code and name required', lang));
    if (form.type === 'PROJECT' && !form.projectId) return toast.error(t('اختر الطلب المرتبط بمخزن الطلب', 'Select the linked order', lang));
    setSaving(true);
    try {
      const project = projects.find(p => p.id === form.projectId);
      const data = {
        code: form.code || nextCodeFromList(warehouses, 'WH'), name: form.name, type: form.type,
        projectId: form.type === 'PROJECT' ? form.projectId : '',
        projectName: form.type === 'PROJECT' ? (project?.name || '') : '',
        costCenter: form.costCenter, keeper: form.keeper, location: form.location,
        isActive: form.isActive, notes: form.notes,
      };
      if (editing) { await base44.entities.Warehouse.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Warehouse.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.InventoryItem.filter({ warehouseId: deleteId }),
        base44.entities.StockMovement.filter({ warehouseId: deleteId }),
        base44.entities.PurchaseOrder.filter({ warehouseId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف مخزن له أرصدة أو حركات أو أوامر شراء', 'Cannot delete a warehouse with inventory, movements or purchase orders', lang));
        return;
      }
      await base44.entities.Warehouse.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'الرمز', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'المخزن', en: 'Warehouse' }, value: (r) => r.name },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => { const ty = TYPES[r.type]; return ty ? (lang === 'ar' ? ty.ar : ty.en) : r.type; } },
    { header: { ar: 'الطلب المرتبط', en: 'Linked Order' }, value: (r) => r.projectName },
    { header: { ar: 'أمين المخزن', en: 'Keeper' }, value: (r) => r.keeper },
    { header: { ar: 'الموقع', en: 'Location' }, value: (r) => r.location },
  ];

  return (
    <ModuleLayout
      title={t('المخازن', 'Warehouses', lang)}
      subtitle={t('إدارة المخازن المركزية ومخازن الطلبات وربطها بالطلبات', 'Manage central and order warehouses linked to orders', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'المخازن', en: 'Warehouses' }} />
          <Button onClick={openNew} className="gap-2 bg-slate-700 hover:bg-slate-800"><Plus className="size-4" />{t('مخزن جديد', 'New Warehouse', lang)}</Button>
        </div>
      }
    >
      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالرمز أو الاسم...', 'Search code or name...', lang)} className="ps-9" />
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرمز', 'Code', lang)}</TableHead>
                <TableHead>{t('المخزن', 'Warehouse', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الطلب المرتبط', 'Linked Order', lang)}</TableHead>
                <TableHead>{t('أمين المخزن', 'Keeper', lang)}</TableHead>
                <TableHead>{t('الموقع', 'Location', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد مخازن — أنشئ مخزناً للبدء', 'No warehouses — create one to start', lang)}</TableCell></TableRow>
                : filtered.map(w => {
                  const ty = TYPES[w.type] || TYPES.PROJECT;
                  return (
                    <TableRow key={w.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{w.code}</TableCell>
                      <TableCell className="font-medium">
                        <span className="inline-flex items-center gap-2"><WarehouseIcon className="size-4 text-slate-500" />{w.name}</span>
                      </TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ty.color}`}>{lang === 'ar' ? ty.ar : ty.en}</span></TableCell>
                      <TableCell className="text-sm">{w.projectName ? <span className="inline-flex items-center gap-1"><Building2 className="size-3.5 text-emerald-500" />{w.projectName}</span> : <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.keeper || '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{w.location || '—'}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(w)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(w.id)}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">{filtered.length} {t('مخزن', 'warehouses', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل المخزن', 'Edit Warehouse', lang) : t('مخزن جديد', 'New Warehouse', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('الرمز', 'Code', lang)} *</Label><Input value={form.code} readOnly className="bg-muted" /></div>
            <div className="space-y-1">
              <Label>{t('النوع', 'Type', lang)}</Label>
              <Select value={form.type} onValueChange={v => set('type', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label>{t('اسم المخزن', 'Warehouse Name', lang)} *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
            {form.type === 'PROJECT' && (
              <div className="space-y-1 col-span-2">
                <Label>{t('الطلب المرتبط', 'Linked Order', lang)} *</Label>
                <Select value={form.projectId} onValueChange={v => set('projectId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الطلب', 'Select order', lang)} /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1"><Label>{t('أمين المخزن', 'Keeper', lang)}</Label><Input value={form.keeper} onChange={e => set('keeper', e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('الموقع', 'Location', lang)}</Label><Input value={form.location} onChange={e => set('location', e.target.value)} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('قسم المطعم', 'Restaurant Section', lang)}</Label><Input value={form.costCenter} onChange={e => set('costCenter', e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-700 hover:bg-slate-800">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف المخزن', 'Delete Warehouse', lang)}
        description={t('سيتم حذف المخزن نهائياً.', 'This warehouse will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}