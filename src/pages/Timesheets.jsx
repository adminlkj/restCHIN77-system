import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const empty = { equipmentId: '', date: '', hours: '', meterStart: '', meterEnd: '', operator: '', projectName: '', notes: '' };

export default function Timesheets() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [equipFilter, setEquipFilter] = useState('ALL');
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
      const [h, eq] = await Promise.all([
        base44.entities.OperatingHours.list('-date', 300),
        base44.entities.Equipment.list(),
      ]);
      setItems(h); setEquipment(eq);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const equipName = (id) => { const e = equipment.find(x => x.id === id); return e ? `${e.name}${e.code ? ` (${e.code})` : ''}` : '—'; };

  const filtered = items.filter(i => {
    const match = !search || equipName(i.equipmentId).toLowerCase().includes(search.toLowerCase()) || (i.operator || '').toLowerCase().includes(search.toLowerCase());
    return match && (equipFilter === 'ALL' || i.equipmentId === equipFilter);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, equipmentId: equipFilter !== 'ALL' ? equipFilter : '', date: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  // Auto-derive hours from meter readings when both are present and hours left blank.
  const derivedHours = () => {
    const s = Number(form.meterStart), e = Number(form.meterEnd);
    if (form.hours !== '' && form.hours != null) return Number(form.hours) || 0;
    if (!isNaN(s) && !isNaN(e) && e > s) return e - s;
    return Number(form.hours) || 0;
  };

  const save = async () => {
    if (!form.equipmentId || !form.date)
      return toast.error(t('المعدة والتاريخ مطلوبان', 'Equipment and date required', lang));
    setSaving(true);
    try {
      const data = {
        equipmentId: form.equipmentId, date: form.date, hours: derivedHours(),
        meterStart: Number(form.meterStart) || 0, meterEnd: Number(form.meterEnd) || 0,
        operator: form.operator, projectName: form.projectName, notes: form.notes,
      };
      if (editing) { await base44.entities.OperatingHours.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.OperatingHours.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.OperatingHours.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalHours = filtered.reduce((s, i) => s + (i.hours || 0), 0);

  const exportColumns = [
    { header: { ar: 'المعدة', en: 'Equipment' }, value: (r) => equipName(r.equipmentId) },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الساعات', en: 'Hours' }, value: (r) => r.hours ?? 0 },
    { header: { ar: 'عداد البداية', en: 'Meter Start' }, value: (r) => r.meterStart || 0 },
    { header: { ar: 'عداد النهاية', en: 'Meter End' }, value: (r) => r.meterEnd || 0 },
    { header: { ar: 'المشغّل', en: 'Operator' }, value: (r) => r.operator },
    { header: { ar: 'الطلب / الموقع', en: 'Order / Site' }, value: (r) => r.projectName },
  ];

  return (
    <ModuleLayout
      title={t('ساعات التشغيل', 'Operating Hours', lang)}
      subtitle={t('تسجيل ساعات تشغيل المعدات اليومية', 'Track daily equipment operating hours', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'ساعات التشغيل', en: 'Operating Hours' }} />
          <Button onClick={openNew} className="gap-2 bg-cyan-600 hover:bg-cyan-700"><Plus className="size-4" />{t('تسجيل ساعات', 'Log Hours', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالمعدة أو المشغّل...', 'Search equipment or operator...', lang)} className="ps-9" />
        </div>
        <Select value={equipFilter} onValueChange={setEquipFilter}>
          <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل المعدات', 'All Equipment', lang)}</SelectItem>
            {equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('المعدة', 'Equipment', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الساعات', 'Hours', lang)}</TableHead>
                <TableHead>{t('العداد', 'Meter', lang)}</TableHead>
                <TableHead>{t('المشغّل', 'Operator', lang)}</TableHead>
                <TableHead>{t('الطلب / الموقع', 'Order / Site', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="text-center py-10 text-muted-foreground">{t('لا توجد سجلات تشغيل', 'No operating records', lang)}</TableCell></TableRow>
                : filtered.map(item => (
                  <TableRow key={item.id} className="hover:bg-muted/30">
                    <TableCell className="font-medium">{equipName(item.equipmentId)}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(item.date, lang)}</TableCell>
                    <TableCell className="text-sm font-medium text-cyan-700">{item.hours ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{(item.meterStart || 0)} → {(item.meterEnd || 0)}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.operator || '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{item.projectName || '—'}</TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">
        {filtered.length} {t('سجل', 'records', lang)} | {t('إجمالي الساعات', 'Total Hours', lang)}: <strong className="text-cyan-700">{totalHours}</strong>
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل السجل', 'Edit Record', lang) : t('تسجيل ساعات', 'Log Hours', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1 col-span-2">
              <Label>{t('المعدة', 'Equipment', lang)} *</Label>
              <Select value={form.equipmentId} onValueChange={v => setForm(f => ({ ...f, equipmentId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر معدة', 'Select equipment', lang)} /></SelectTrigger>
                <SelectContent>{equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)} *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الساعات', 'Hours', lang)}</Label><Input type="number" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} placeholder={t('يُحسب من العداد', 'auto from meter', lang)} /></div>
            <div className="space-y-1"><Label>{t('عداد البداية', 'Meter Start', lang)}</Label><Input type="number" value={form.meterStart} onChange={e => setForm(f => ({ ...f, meterStart: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('عداد النهاية', 'Meter End', lang)}</Label><Input type="number" value={form.meterEnd} onChange={e => setForm(f => ({ ...f, meterEnd: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('المشغّل', 'Operator', lang)}</Label><Input value={form.operator} onChange={e => setForm(f => ({ ...f, operator: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الطلب / الموقع', 'Order / Site', lang)}</Label><Input value={form.projectName} onChange={e => setForm(f => ({ ...f, projectName: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف السجل', 'Delete Record', lang)}
        description={t('سيتم حذف سجل التشغيل نهائياً.', 'This record will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}