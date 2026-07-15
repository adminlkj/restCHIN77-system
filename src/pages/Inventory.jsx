import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const CATEGORIES = {
  MATERIAL:    { ar: 'مواد', en: 'Material', color: 'bg-blue-100 text-blue-700' },
  CONSUMABLE:  { ar: 'مستهلكات', en: 'Consumable', color: 'bg-cyan-100 text-cyan-700' },
  SPARE_PART:  { ar: 'قطع غيار', en: 'Spare Part', color: 'bg-amber-100 text-amber-700' },
  TOOL:        { ar: 'أدوات', en: 'Tool', color: 'bg-violet-100 text-violet-700' },
  FIXED_ASSET: { ar: 'أصل ثابت', en: 'Fixed Asset', color: 'bg-emerald-100 text-emerald-700' },
};
const empty = { code: '', name: '', nameEn: '', category: 'MATERIAL', unit: '', quantity: '', reorderLevel: '', unitCost: '', warehouseId: '', location: '', isActive: true, notes: '' };

export default function Inventory() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [it, wh] = await Promise.all([
        base44.entities.InventoryItem.list('code', 500),
        base44.entities.Warehouse.filter({ isActive: true }, 'code', 500),
      ]);
      setItems(it || []);
      setWarehouses(wh || []);
    }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase());
    return match && (filterCat === 'ALL' || i.category === filterCat);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'ITM', 'code') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.code || !form.name) return toast.error(t('الرمز والاسم مطلوبان', 'Code and name required', lang));
    setSaving(true);
    try {
      const wh = warehouses.find(w => w.id === form.warehouseId);
      const data = {
        code: form.code, name: form.name, nameEn: form.nameEn, category: form.category, unit: form.unit,
        quantity: Number(form.quantity) || 0, reorderLevel: Number(form.reorderLevel) || 0,
        unitCost: Number(form.unitCost) || 0, warehouseId: form.warehouseId, warehouseName: wh?.name || '',
        location: form.location, isActive: form.isActive, notes: form.notes,
      };
      if (editing) { await base44.entities.InventoryItem.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.InventoryItem.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.StockMovement.filter({ itemId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف صنف له حركات مخزون', 'Cannot delete an item with stock movements', lang));
        return;
      }
      await base44.entities.InventoryItem.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalValue = filtered.reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0);
  const lowStock = filtered.filter(i => i.reorderLevel > 0 && i.quantity <= i.reorderLevel).length;

  const exportColumns = [
    { header: { ar: 'الرمز', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الصنف', en: 'Item' }, value: (r) => r.name },
    { header: { ar: 'الفئة', en: 'Category' }, value: (r) => { const c = CATEGORIES[r.category]; return c ? (lang === 'ar' ? c.ar : c.en) : r.category; } },
    { header: { ar: 'المخزن', en: 'Warehouse' }, value: (r) => r.warehouseName },
    { header: { ar: 'الكمية', en: 'Qty' }, value: (r) => r.quantity || 0 },
    { header: { ar: 'الوحدة', en: 'Unit' }, value: (r) => r.unit },
    { header: { ar: 'تكلفة الوحدة', en: 'Unit Cost' }, value: (r) => r.unitCost || 0 },
    { header: { ar: 'القيمة', en: 'Value' }, value: (r) => (r.quantity || 0) * (r.unitCost || 0) },
  ];

  return (
    <ModuleLayout
      title={t('المخزون والأصول', 'Inventory & Assets', lang)}
      subtitle={t('إدارة أصناف المخزون والأصول الثابتة', 'Manage stock items and fixed assets', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'المخزون', en: 'Inventory' }} />
          <Button onClick={openNew} className="gap-2 bg-slate-700 hover:bg-slate-800"><Plus className="size-4" />{t('صنف جديد', 'New Item', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالرمز أو الاسم...', 'Search code or name...', lang)} className="ps-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الفئات', 'All Categories', lang)}</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرمز', 'Code', lang)}</TableHead>
                <TableHead>{t('الصنف', 'Item', lang)}</TableHead>
                <TableHead>{t('الفئة', 'Category', lang)}</TableHead>
                <TableHead>{t('المخزن', 'Warehouse', lang)}</TableHead>
                <TableHead>{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead>{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-end">{t('تكلفة الوحدة', 'Unit Cost', lang)}</TableHead>
                <TableHead className="text-end">{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد أصناف', 'No items', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const cat = CATEGORIES[item.category] || CATEGORIES.MATERIAL;
                  const low = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.code}</TableCell>
                      <TableCell className="font-medium">{lang === 'ar' ? item.name : (item.nameEn || item.name)}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>{lang === 'ar' ? cat.ar : cat.en}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.warehouseName || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 font-medium ${low ? 'text-rose-600' : ''}`}>
                          {item.quantity ?? 0}{low && <AlertTriangle className="size-3.5" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.unit || '—'}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(item.unitCost, lang)}</TableCell>
                      <TableCell className="text-end text-sm font-medium">{formatCurrency((item.quantity || 0) * (item.unitCost || 0), lang)}</TableCell>
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
        {filtered.length} {t('صنف', 'items', lang)} | {t('قيمة المخزون', 'Stock Value', lang)}: <strong className="text-slate-700">{formatCurrency(totalValue, lang)}</strong>
        {lowStock > 0 && <span className="text-rose-600"> | {lowStock} {t('تحت حد الطلب', 'below reorder', lang)}</span>}
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل الصنف', 'Edit Item', lang) : t('صنف جديد', 'New Item', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('الرمز', 'Code', lang)} *</Label><Input value={form.code} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1">
              <Label>{t('الفئة', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label><Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الكمية', 'Quantity', lang)}</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الوحدة', 'Unit', lang)}</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={t('قطعة، كجم...', 'pcs, kg...', lang)} /></div>
            <div className="space-y-1"><Label>{t('حد إعادة الطلب', 'Reorder Level', lang)}</Label><Input type="number" value={form.reorderLevel} onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('تكلفة الوحدة', 'Unit Cost', lang)}</Label><Input type="number" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('المخزن', 'Warehouse', lang)}</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر المخزن', 'Select warehouse', lang)} /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label>{t('الموقع داخل المخزن', 'Location in Warehouse', lang)}</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-700 hover:bg-slate-800">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الصنف', 'Delete Item', lang)}
        description={t('سيتم حذف الصنف نهائياً.', 'This item will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}