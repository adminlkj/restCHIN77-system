import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, Fuel, Pencil, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

const empty = { equipmentId: '', date: new Date().toISOString().slice(0, 10), liters: '', pricePerLiter: '', odometer: '', notes: '' };

export default function FuelConsumption() {
  const { lang } = useStore();
  const [logs, setLogs] = useState([]);
  const [equipment, setEquipment] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(empty);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [fl, eq] = await Promise.all([base44.entities.FuelLog.list('-date', 1000), base44.entities.Equipment.list('name', 1000)]);
      setLogs(fl || []); setEquipment(eq || []);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل السجلات', 'Failed to load logs', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => logs.map(r => ({ ...r, equipmentName: equipment.find(e => e.id === r.equipmentId)?.name || r.equipmentName || '—' })), [logs, equipment]);
  const filtered = rows.filter(r => !search || `${r.equipmentName} ${r.notes}`.toLowerCase().includes(search.toLowerCase()));
  const liters = filtered.reduce((s, r) => s + (Number(r.liters) || 0), 0);
  const cost = filtered.reduce((s, r) => s + (Number(r.totalCost) || 0), 0);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r, liters: r.liters || '', pricePerLiter: r.pricePerLiter || '', odometer: r.odometer || '' }); setEditId(r.id); setOpen(true); };

  const save = async () => {
    const eq = equipment.find(e => e.id === form.equipmentId);
    const totalCost = (Number(form.liters) || 0) * (Number(form.pricePerLiter) || 0);
    try {
      const payload = { ...form, equipmentName: eq?.name || '', liters: Number(form.liters) || 0, pricePerLiter: Number(form.pricePerLiter) || 0, totalCost, odometer: Number(form.odometer) || 0 };
      if (editId) {
        await base44.entities.FuelLog.update(editId, payload);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await base44.entities.FuelLog.create(payload);
        toast.success(t('تم الحفظ', 'Saved', lang));
      }
      setOpen(false); setForm(empty); setEditId(null); load();
    } catch (err) {
      toast.error(err?.message || t('فشل الحفظ', 'Failed to save', lang));
    }
  };

  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };
  const remove = async () => {
    try {
      await base44.entities.FuelLog.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      load();
    } catch (err) { toast.error(err?.message || t('فشل الحذف', 'Delete failed', lang)); }
  };

  return <ModuleLayout title={t('استهلاك الوقود', 'Fuel Consumption', lang)} subtitle={t('تسجيل وتحليل وقود المعدات', 'Register and analyze equipment fuel', lang)} actions={<Button onClick={openNew} className="gap-2 bg-cyan-600 hover:bg-cyan-700"><Plus className="size-4" />{t('تعبئة وقود', 'New Fuel Log', lang)}</Button>}>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Card className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي اللترات', 'Total Liters', lang)}</p><p className="text-xl font-bold">{liters.toLocaleString()}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي التكلفة', 'Total Cost', lang)}</p><p className="text-xl font-bold">{formatCurrency(cost, lang)}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{t('متوسط سعر اللتر', 'Avg. Price/Liter', lang)}</p><p className="text-xl font-bold">{formatCurrency(liters ? cost / liters : 0, lang)}</p></Card></div>
    <div className="flex gap-3"><div className="relative flex-1"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالمعدة...', 'Search equipment...', lang)} /></div><Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button></div>
    <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('التاريخ', 'Date', lang)}</TableHead><TableHead>{t('المعدة', 'Equipment', lang)}</TableHead><TableHead className="text-center">{t('اللترات', 'Liters', lang)}</TableHead><TableHead className="text-end">{t('سعر اللتر', 'Price/Liter', lang)}</TableHead><TableHead className="text-end">{t('الإجمالي', 'Total', lang)}</TableHead><TableHead>{t('قراءة العداد', 'Odometer', lang)}</TableHead><TableHead>{t('ملاحظات', 'Notes', lang)}</TableHead><TableHead>{t('إجراءات', 'Actions', lang)}</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('لا توجد سجلات وقود', 'No fuel logs', lang)}</TableCell></TableRow> : filtered.map(r => <TableRow key={r.id}><TableCell>{formatDate(r.date, lang)}</TableCell><TableCell className="font-medium">{r.equipmentName}</TableCell><TableCell className="text-center">{r.liters || 0}</TableCell><TableCell className="text-end">{formatCurrency(r.pricePerLiter || 0, lang)}</TableCell><TableCell className="text-end font-medium">{formatCurrency(r.totalCost || 0, lang)}</TableCell><TableCell>{r.odometer || '—'}</TableCell><TableCell>{r.notes || '—'}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="size-8" title={t('تعديل', 'Edit', lang)} onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8 text-destructive" title={t('حذف', 'Delete', lang)} onClick={() => askDelete(r.id)}><Trash2 className="size-3.5" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Fuel className="size-5" />{editId ? t('تعديل سجل وقود', 'Edit Fuel Log', lang) : t('تعبئة وقود', 'Fuel Log', lang)}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3 py-2"><div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div><div className="space-y-1"><Label>{t('قراءة العداد', 'Odometer', lang)}</Label><Input type="number" value={form.odometer} onChange={e => setForm({ ...form, odometer: e.target.value })} /></div><div className="space-y-1 col-span-2"><Label>{t('المعدة', 'Equipment', lang)}</Label><Select value={form.equipmentId} onValueChange={v => setForm({ ...form, equipmentId: v })}><SelectTrigger><SelectValue placeholder={t('اختر المعدة', 'Select equipment', lang)} /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><Label>{t('اللترات', 'Liters', lang)}</Label><Input type="number" value={form.liters} onChange={e => setForm({ ...form, liters: e.target.value })} /></div><div className="space-y-1"><Label>{t('سعر اللتر', 'Price/Liter', lang)}</Label><Input type="number" value={form.pricePerLiter} onChange={e => setForm({ ...form, pricePerLiter: e.target.value })} /></div><div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button><Button onClick={save}>{editId ? t('تحديث', 'Update', lang) : t('حفظ', 'Save', lang)}</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={t('حذف سجل الوقود', 'Delete Fuel Log', lang)} description={t('سيتم حذف السجل نهائياً.', 'This record will be permanently deleted.', lang)} onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
  </ModuleLayout>;
}
