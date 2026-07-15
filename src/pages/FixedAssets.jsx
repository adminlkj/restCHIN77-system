import React, { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, RefreshCw, CheckCircle2, TrendingDown, Landmark } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { AssetEngine } from '@/lib/businessEngine';
import { useStore } from '@/lib/store';
import { t, formatDate, formatCurrency, STATUS_TONE, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const CATEGORIES = {
  EQUIPMENT: { ar: 'معدات وآلات', en: 'Equipment' },
  VEHICLE:   { ar: 'سيارات ومركبات', en: 'Vehicles' },
  FURNITURE: { ar: 'أثاث وأجهزة', en: 'Furniture' },
  BUILDING:  { ar: 'مباني وعقارات', en: 'Buildings' },
  OTHER:     { ar: 'أخرى', en: 'Other' },
};
const STATUSES = {
  ACTIVE:            { ar: 'نشط', en: 'Active', color: STATUS_TONE.SUCCESS },
  FULLY_DEPRECIATED: { ar: 'مُهلك بالكامل', en: 'Fully Depreciated', color: STATUS_TONE.NEUTRAL },
  DISPOSED:          { ar: 'مستبعَد', en: 'Disposed', color: STATUS_TONE.DANGER },
};
const empty = {
  code: '', name: '', category: 'EQUIPMENT', acquisitionDate: new Date().toISOString().slice(0, 10),
  acquisitionCost: 0, salvageValue: 0, usefulLifeMonths: 60, notes: '',
};

// صافي القيمة الدفترية = التكلفة − مجمع الإهلاك.
const bookValue = (a) => +((a.acquisitionCost || 0) - (a.accumulatedDepreciation || 0)).toFixed(2);

export default function FixedAssets() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);
  // شهر الإهلاك الجماعي (YYYY-MM)
  const [depPeriod, setDepPeriod] = useState(new Date().toISOString().slice(0, 7));
  const [runningAll, setRunningAll] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.FixedAsset.list('-created_date', 200)); }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'FA', 'code') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.code || !form.name || !form.acquisitionDate || !(Number(form.acquisitionCost) > 0))
      return toast.error(t('الرمز والاسم والتاريخ والتكلفة مطلوبة', 'Code, name, date and cost required', lang));
    if (Number(form.salvageValue) >= Number(form.acquisitionCost))
      return toast.error(t('القيمة المتبقية يجب أن تقل عن التكلفة', 'Salvage must be less than cost', lang));
    setSaving(true);
    try {
      const data = {
        code: form.code, name: form.name, category: form.category, acquisitionDate: form.acquisitionDate,
        acquisitionCost: Number(form.acquisitionCost), salvageValue: Number(form.salvageValue),
        usefulLifeMonths: Number(form.usefulLifeMonths) || 1, notes: form.notes,
      };
      if (editing) { await base44.entities.FixedAsset.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.FixedAsset.create({ ...data, accumulatedDepreciation: 0, capitalized: false, status: 'ACTIVE' }); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const asset = items.find(i => i.id === deleteId);
      if (asset && asset.capitalized) {
        toast.error(t('لا يمكن حذف أصل تم رسملته — اعكس القيد أولاً', 'Cannot delete a capitalized asset — reverse the entry first', lang));
        return;
      }
      await base44.entities.FixedAsset.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  // رسملة الأصل → ترحيل قيد الاقتناء.
  const capitalize = async (item) => {
    setBusyId(item.id);
    try { await AssetEngine.capitalize(item.id); toast.success(t('تمت رسملة الأصل وترحيل قيد الاقتناء', 'Asset capitalized', lang)); load(); }
    catch (e) { toast.error(e?.message || t('فشل الرسملة', 'Capitalize failed', lang)); }
    setBusyId(null);
  };

  // إهلاك أصل واحد لشهر الفترة المحدّدة.
  const depreciate = async (item) => {
    setBusyId(item.id);
    try { await AssetEngine.depreciate(item.id, depPeriod); toast.success(t('تم ترحيل قسط الإهلاك', 'Depreciation posted', lang)); load(); }
    catch (e) { toast.error(e?.message || t('فشل الإهلاك', 'Depreciation failed', lang)); }
    setBusyId(null);
  };

  // إهلاك جماعي لكل الأصول النشطة لشهر الفترة.
  const depreciateAll = async () => {
    setRunningAll(true);
    try {
      const res = await AssetEngine.depreciateAll(depPeriod);
      const ok = (res?.results || []).filter(r => r.status === 'OK').length;
      toast.success(t(`تم ترحيل الإهلاك لـ ${ok} أصل`, `Depreciation posted for ${ok} assets`, lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل الإهلاك الجماعي', 'Bulk depreciation failed', lang)); }
    setRunningAll(false);
  };

  const monthly = (a) => {
    const base = (a.acquisitionCost || 0) - (a.salvageValue || 0);
    return +(base / (a.usefulLifeMonths || 1)).toFixed(2);
  };

  const exportColumns = [
    { header: { ar: 'الرمز', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الأصل', en: 'Asset' }, value: (r) => r.name },
    { header: { ar: 'الفئة', en: 'Category' }, value: (r) => { const c = CATEGORIES[r.category]; return c ? (lang === 'ar' ? c.ar : c.en) : r.category; } },
    { header: { ar: 'التكلفة', en: 'Cost' }, value: (r) => r.acquisitionCost || 0 },
    { header: { ar: 'مجمع الإهلاك', en: 'Accum. Dep.' }, value: (r) => r.accumulatedDepreciation || 0 },
    { header: { ar: 'القيمة الدفترية', en: 'Book Value' }, value: (r) => bookValue(r) },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('الأصول الثابتة والإهلاك', 'Fixed Assets & Depreciation', lang)}
      subtitle={t('رسملة الأصول واحتساب الإهلاك بالقسط الثابت وفق IAS 16', 'Capitalize assets & straight-line depreciation (IAS 16)', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={items} title={{ ar: 'الأصول الثابتة', en: 'Fixed Assets' }} />
          <Button onClick={openNew} className="gap-2 bg-teal-600 hover:bg-teal-700"><Plus className="size-4" />{t('أصل جديد', 'New Asset', lang)}</Button>
        </div>
      }
    >
      {/* شريط الإهلاك الشهري الجماعي */}
      <Card className="p-4 flex flex-wrap items-end gap-3 bg-teal-50/40 border-teal-100">
        <div className="space-y-1">
          <Label className="text-xs">{t('شهر الإهلاك', 'Depreciation Month', lang)}</Label>
          <Input type="month" value={depPeriod} onChange={e => setDepPeriod(e.target.value)} className="w-40" />
        </div>
        <Button onClick={depreciateAll} disabled={runningAll} className="gap-2 bg-teal-600 hover:bg-teal-700">
          <TrendingDown className="size-4" />
          {runningAll ? t('جارٍ الترحيل...', 'Posting...', lang) : t('إهلاك جميع الأصول للشهر', 'Depreciate All for Month', lang)}
        </Button>
        <div className="flex items-center gap-1 ms-auto text-xs text-muted-foreground">
          <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
        </div>
      </Card>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرمز', 'Code', lang)}</TableHead>
                <TableHead>{t('الأصل', 'Asset', lang)}</TableHead>
                <TableHead>{t('التكلفة', 'Cost', lang)}</TableHead>
                <TableHead>{t('القسط الشهري', 'Monthly', lang)}</TableHead>
                <TableHead>{t('مجمع الإهلاك', 'Accum. Dep.', lang)}</TableHead>
                <TableHead>{t('القيمة الدفترية', 'Book Value', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : items.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد أصول ثابتة', 'No fixed assets', lang)}</TableCell></TableRow>
                : items.map(item => {
                  const st = STATUSES[item.status] || STATUSES.ACTIVE;
                  const cat = CATEGORIES[item.category] || CATEGORIES.OTHER;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs">{item.code}</TableCell>
                      <TableCell className="font-medium">
                        {item.name}
                        <span className="block text-[10px] text-muted-foreground">{lang === 'ar' ? cat.ar : cat.en} · {formatDate(item.acquisitionDate, lang)}</span>
                      </TableCell>
                      <TableCell className="text-sm">{formatCurrency(item.acquisitionCost, lang)}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">{formatCurrency(monthly(item), lang)}</TableCell>
                      <TableCell className="text-xs">{formatCurrency(item.accumulatedDepreciation || 0, lang)}</TableCell>
                      <TableCell className="text-sm font-semibold">{formatCurrency(bookValue(item), lang)}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>
                        {!item.capitalized && <span className="block text-[10px] text-amber-600 mt-0.5">{t('غير مرسمل', 'Not capitalized', lang)}</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {!item.capitalized
                            ? <Button variant="ghost" size="sm" className="h-8 text-xs gap-1 text-teal-700" disabled={busyId === item.id} onClick={() => capitalize(item)}><Landmark className="size-3.5" />{t('رسملة', 'Capitalize', lang)}</Button>
                            : item.status === 'ACTIVE'
                              ? <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" disabled={busyId === item.id} onClick={() => depreciate(item)}><TrendingDown className="size-3.5" />{t('إهلاك', 'Depreciate', lang)}</Button>
                              : <span className="inline-flex items-center gap-1 text-xs text-emerald-600 px-2"><CheckCircle2 className="size-3.5" />{t('مكتمل', 'Done', lang)}</span>}
                          {!item.capitalized && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                          {!item.capitalized && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل الأصل', 'Edit Asset', lang) : t('أصل ثابت جديد', 'New Fixed Asset', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('الرمز', 'Code', lang)} *</Label><Input value={form.code} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1">
              <Label>{t('الفئة', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label>{t('اسم الأصل', 'Asset Name', lang)} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('تاريخ الاقتناء', 'Acquisition Date', lang)} *</Label><Input type="date" value={form.acquisitionDate} onChange={e => setForm(f => ({ ...f, acquisitionDate: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('تكلفة الاقتناء', 'Cost', lang)} *</Label><Input type="number" value={form.acquisitionCost} onChange={e => setForm(f => ({ ...f, acquisitionCost: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('القيمة المتبقية', 'Salvage Value', lang)}</Label><Input type="number" value={form.salvageValue} onChange={e => setForm(f => ({ ...f, salvageValue: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('العمر الإنتاجي (شهر)', 'Useful Life (months)', lang)}</Label><Input type="number" value={form.usefulLifeMonths} onChange={e => setForm(f => ({ ...f, usefulLifeMonths: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-teal-600 hover:bg-teal-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الأصل', 'Delete Asset', lang)}
        description={t('سيتم حذف الأصل نهائياً. لا يمكن حذف أصل مرسمل.', 'The asset will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}