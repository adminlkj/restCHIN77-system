import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, ArrowUpRight } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, EQUIPMENT_STATUS, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const emptyForm = { code: '', name: '', nameAr: '', type: '', brand: '', model: '', year: '', serialNumber: '', plateNumber: '', status: 'AVAILABLE', dailyRate: '', monthlyRate: '', hourlyRate: '', purchaseDate: '', purchaseCost: '', currentValue: '', notes: '' };

export default function Equipment() {
  const { lang, setActiveItem, setEquipmentContext } = useStore();

  const openWorkspace = (item) => {
    setEquipmentContext(item.id, item.name);
    setActiveItem('equipment-workspace');
  };
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.Equipment.list('-created_date', 200)); }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => { setEditing(null); setForm({ ...emptyForm, code: nextCodeFromList(items, 'EQP', 'code') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...emptyForm, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.code || !form.name) return toast.error(t('الكود والاسم مطلوبان', 'Code and name are required', lang));
    setSaving(true);
    try {
      const data = { ...form, dailyRate: parseFloat(form.dailyRate) || 0, monthlyRate: parseFloat(form.monthlyRate) || 0, hourlyRate: parseFloat(form.hourlyRate) || 0, purchaseCost: parseFloat(form.purchaseCost) || 0, currentValue: parseFloat(form.currentValue) || 0, year: parseInt(form.year) || undefined };
      if (editing) { await base44.entities.Equipment.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Equipment.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.RentalContract.filter({ equipmentId: deleteId }),
        base44.entities.RentalInvoice.filter({ equipmentId: deleteId }),
        base44.entities.OperatingHours.filter({ equipmentId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف معدة لها عقود إيجار أو فواتير أو ساعات تشغيل', 'Cannot delete equipment with rental contracts, invoices or operating hours', lang));
        return;
      }
      await base44.entities.Equipment.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const statusCounts = Object.keys(EQUIPMENT_STATUS).reduce((acc, s) => { acc[s] = items.filter(i => i.status === s).length; return acc; }, {});

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الاسم', en: 'Name' }, value: (r) => r.name },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => r.type },
    { header: { ar: 'الماركة', en: 'Brand' }, value: (r) => r.brand },
    { header: { ar: 'الموديل', en: 'Model' }, value: (r) => r.model },
    { header: { ar: 'رقم اللوحة', en: 'Plate No.' }, value: (r) => r.plateNumber },
    { header: { ar: 'سعر يومي', en: 'Daily Rate' }, value: (r) => r.dailyRate || 0 },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = EQUIPMENT_STATUS[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('المعدات', 'Equipment', lang)}
      subtitle={t('إدارة أسطول المعدات والآليات', 'Manage equipment fleet', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'المعدات', en: 'Equipment' }} />
          <Button onClick={openNew} className="gap-2 bg-cyan-600 hover:bg-cyan-700"><Plus className="size-4" />{t('معدة جديدة', 'New Equipment', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {Object.entries(EQUIPMENT_STATUS).map(([status, cfg]) => (
          <button key={status} onClick={() => setFilterStatus(filterStatus === status ? 'ALL' : status)}
            className={`p-3 rounded-xl border text-center transition-all ${filterStatus === status ? 'ring-2 ring-cyan-500' : 'hover:bg-muted/50'}`}>
            <p className="text-xl font-bold">{statusCounts[status] || 0}</p>
            <p className={`text-xs mt-0.5 rounded-full px-2 py-0.5 ${cfg.color}`}>{lang === 'ar' ? cfg.ar : cfg.en}</p>
          </button>
        ))}
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الحالات', 'All Status', lang)}</SelectItem>
            {Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الكود', 'Code', lang)}</TableHead>
                <TableHead>{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الماركة / الموديل', 'Brand / Model', lang)}</TableHead>
                <TableHead>{t('رقم اللوحة', 'Plate No.', lang)}</TableHead>
                <TableHead>{t('سعر يومي', 'Daily Rate', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد معدات', 'No equipment found', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const st = EQUIPMENT_STATUS[item.status] || EQUIPMENT_STATUS.AVAILABLE;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{item.code}</TableCell>
                      <TableCell>
                        <button onClick={() => openWorkspace(item)} className="font-medium text-cyan-700 hover:underline text-start">
                          {item.name}
                        </button>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.type || '—'}</TableCell>
                      <TableCell className="text-sm">{[item.brand, item.model].filter(Boolean).join(' / ') || '—'}</TableCell>
                      <TableCell className="text-sm">{item.plateNumber || '—'}</TableCell>
                      <TableCell className="font-medium">{item.dailyRate ? formatCurrency(item.dailyRate, lang) : '—'}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8 text-cyan-700" title={t('مركز العمل', 'Workspace', lang)} onClick={() => openWorkspace(item)}><ArrowUpRight className="size-3.5" /></Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل المعدة', 'Edit Equipment', lang) : t('معدة جديدة', 'New Equipment', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[['code', t('الكود', 'Code', lang), 'text', true], ['name', t('الاسم', 'Name', lang), 'text'], ['type', t('النوع', 'Type', lang), 'text'], ['brand', t('الماركة', 'Brand', lang), 'text'], ['model', t('الموديل', 'Model', lang), 'text'], ['year', t('السنة', 'Year', lang), 'number'], ['serialNumber', t('الرقم التسلسلي', 'Serial No.', lang), 'text'], ['plateNumber', t('رقم اللوحة', 'Plate No.', lang), 'text'], ['dailyRate', t('السعر اليومي', 'Daily Rate', lang), 'number'], ['monthlyRate', t('السعر الشهري', 'Monthly Rate', lang), 'number'], ['hourlyRate', t('سعر الساعة', 'Hourly Rate', lang), 'number'], ['purchaseCost', t('تكلفة الشراء', 'Purchase Cost', lang), 'number'], ['currentValue', t('القيمة الحالية', 'Current Value', lang), 'number']].map(([field, label, type, ro]) => (
              <div key={field} className="space-y-1.5">
                <Label>{label}</Label>
                <Input type={type} value={form[field] || ''} readOnly={ro} onChange={ro ? undefined : e => setForm(f => ({ ...f, [field]: e.target.value }))} className={ro ? 'bg-muted font-mono' : ''} />
              </div>
            ))}
            <div className="space-y-1.5"><Label>{t('تاريخ الشراء', 'Purchase Date', lang)}</Label><Input type="date" value={form.purchaseDate || ''} onChange={e => setForm(f => ({ ...f, purchaseDate: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(EQUIPMENT_STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-cyan-600 hover:bg-cyan-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف المعدة', 'Delete Equipment', lang)}
        description={t('سيتم حذف المعدة نهائياً.', 'This equipment will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}