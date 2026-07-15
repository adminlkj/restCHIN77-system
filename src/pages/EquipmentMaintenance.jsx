import React, { useEffect, useMemo, useState } from 'react';
import { Plus, Search, RefreshCw, Wrench, Pencil, Trash2 } from 'lucide-react';
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

const TYPES = { PREVENTIVE: 'وقائية', CORRECTIVE: 'إصلاحية', BREAKDOWN: 'عطل' };
const empty = { equipmentId: '', date: new Date().toISOString().slice(0, 10), type: 'PREVENTIVE', description: '', cost: '', vendor: '', status: 'COMPLETED', notes: '' };

export default function EquipmentMaintenance() {
  const { lang } = useStore();
  const [records, setRecords] = useState([]);
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
      const [mr, eq] = await Promise.all([base44.entities.MaintenanceRecord.list('-date', 1000), base44.entities.Equipment.list('name', 1000)]);
      setRecords(mr || []); setEquipment(eq || []);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل السجلات', 'Failed to load records', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => records.map(r => ({ ...r, equipmentName: equipment.find(e => e.id === r.equipmentId)?.name || r.equipmentName || '—' })), [records, equipment]);
  const filtered = rows.filter(r => !search || `${r.equipmentName} ${r.description} ${r.vendor}`.toLowerCase().includes(search.toLowerCase()));
  const totalCost = filtered.reduce((s, r) => s + (Number(r.cost) || 0), 0);

  const openNew = () => { setForm(empty); setEditId(null); setOpen(true); };
  const openEdit = (r) => { setForm({ ...empty, ...r, cost: r.cost || '' }); setEditId(r.id); setOpen(true); };

  const save = async () => {
    const eq = equipment.find(e => e.id === form.equipmentId);
    try {
      const payload = { ...form, equipmentName: eq?.name || '', cost: Number(form.cost) || 0 };
      if (editId) {
        await base44.entities.MaintenanceRecord.update(editId, payload);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await base44.entities.MaintenanceRecord.create(payload);
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
      await base44.entities.MaintenanceRecord.delete(deleteId);
      toast.success(t('تم الحذف', 'Deleted', lang));
      load();
    } catch (err) { toast.error(err?.message || t('فشل الحذف', 'Delete failed', lang)); }
  };

  return <ModuleLayout title={t('الصيانة', 'Maintenance', lang)} subtitle={t('تسجيل ومتابعة صيانة المعدات', 'Register and track equipment maintenance', lang)} actions={<Button onClick={openNew} className="gap-2 bg-cyan-600 hover:bg-cyan-700"><Plus className="size-4" />{t('صيانة جديدة', 'New Maintenance', lang)}</Button>}>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3"><Card className="p-4"><p className="text-xs text-muted-foreground">{t('عدد السجلات', 'Records', lang)}</p><p className="text-xl font-bold">{filtered.length}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي التكلفة', 'Total Cost', lang)}</p><p className="text-xl font-bold">{formatCurrency(totalCost, lang)}</p></Card><Card className="p-4"><p className="text-xs text-muted-foreground">{t('طلبات مفتوحة', 'Open', lang)}</p><p className="text-xl font-bold text-amber-700">{filtered.filter(r => r.status !== 'COMPLETED').length}</p></Card></div>
    <div className="flex gap-3"><div className="relative flex-1"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالمعدة أو الورشة...', 'Search equipment or vendor...', lang)} /></div><Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button></div>
    <Card><div className="overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('التاريخ', 'Date', lang)}</TableHead><TableHead>{t('المعدة', 'Equipment', lang)}</TableHead><TableHead>{t('النوع', 'Type', lang)}</TableHead><TableHead>{t('الوصف', 'Description', lang)}</TableHead><TableHead>{t('الورشة', 'Vendor', lang)}</TableHead><TableHead className="text-end">{t('التكلفة', 'Cost', lang)}</TableHead><TableHead>{t('الحالة', 'Status', lang)}</TableHead><TableHead>{t('إجراءات', 'Actions', lang)}</TableHead></TableRow></TableHeader><TableBody>{loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('لا توجد سجلات صيانة', 'No maintenance records', lang)}</TableCell></TableRow> : filtered.map(r => <TableRow key={r.id}><TableCell>{formatDate(r.date, lang)}</TableCell><TableCell className="font-medium">{r.equipmentName}</TableCell><TableCell>{TYPES[r.type] || r.type}</TableCell><TableCell>{r.description || '—'}</TableCell><TableCell>{r.vendor || '—'}</TableCell><TableCell className="text-end">{formatCurrency(r.cost || 0, lang)}</TableCell><TableCell>{r.status}</TableCell><TableCell><div className="flex gap-1"><Button variant="ghost" size="icon" className="size-8" title={t('تعديل', 'Edit', lang)} onClick={() => openEdit(r)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8 text-destructive" title={t('حذف', 'Delete', lang)} onClick={() => askDelete(r.id)}><Trash2 className="size-3.5" /></Button></div></TableCell></TableRow>)}</TableBody></Table></div></Card>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle className="flex items-center gap-2"><Wrench className="size-5" />{editId ? t('تعديل صيانة', 'Edit Maintenance', lang) : t('صيانة جديدة', 'New Maintenance', lang)}</DialogTitle></DialogHeader><div className="grid grid-cols-2 gap-3 py-2"><div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div><div className="space-y-1"><Label>{t('النوع', 'Type', lang)}</Label><Select value={form.type} onValueChange={v => setForm({ ...form, type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.keys(TYPES).map(k => <SelectItem key={k} value={k}>{TYPES[k]}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1 col-span-2"><Label>{t('المعدة', 'Equipment', lang)}</Label><Select value={form.equipmentId} onValueChange={v => setForm({ ...form, equipmentId: v })}><SelectTrigger><SelectValue placeholder={t('اختر المعدة', 'Select equipment', lang)} /></SelectTrigger><SelectContent>{equipment.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1 col-span-2"><Label>{t('الوصف', 'Description', lang)}</Label><Input value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} /></div><div className="space-y-1"><Label>{t('الورشة', 'Vendor', lang)}</Label><Input value={form.vendor} onChange={e => setForm({ ...form, vendor: e.target.value })} /></div><div className="space-y-1"><Label>{t('التكلفة', 'Cost', lang)}</Label><Input type="number" value={form.cost} onChange={e => setForm({ ...form, cost: e.target.value })} /></div></div><DialogFooter><Button variant="outline" onClick={() => setOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button><Button onClick={save}>{editId ? t('تحديث', 'Update', lang) : t('حفظ', 'Save', lang)}</Button></DialogFooter></DialogContent></Dialog>
    <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen} title={t('حذف سجل الصيانة', 'Delete Maintenance Record', lang)} description={t('سيتم حذف السجل نهائياً.', 'This record will be permanently deleted.', lang)} onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
  </ModuleLayout>;
}
