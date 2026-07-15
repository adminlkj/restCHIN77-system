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

const STATUSES = {
  PRESENT: { ar: 'حاضر', en: 'Present', color: 'bg-emerald-100 text-emerald-700' },
  ABSENT:  { ar: 'غائب', en: 'Absent', color: 'bg-rose-100 text-rose-700' },
  LEAVE:   { ar: 'إجازة', en: 'Leave', color: 'bg-amber-100 text-amber-700' },
  SICK:    { ar: 'مرضي', en: 'Sick', color: 'bg-orange-100 text-orange-700' },
  HOLIDAY: { ar: 'عطلة', en: 'Holiday', color: 'bg-slate-100 text-slate-700' },
};
const empty = { employeeId: '', date: '', status: 'PRESENT', hours: 8, notes: '' };

export default function Attendance() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [a, em] = await Promise.all([
        base44.entities.AttendanceRecord.list('-date', 300),
        base44.entities.Employee.list(),
      ]);
      setItems(a); setEmployees(em);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const empName = (id) => employees.find(e => e.id === id)?.name || '—';

  const filtered = items.filter(i => {
    const match = !search || empName(i.employeeId).toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, date: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.employeeId || !form.date)
      return toast.error(t('الموظف والتاريخ مطلوبان', 'Employee and date required', lang));
    const duplicate = items.find(i => i.employeeId === form.employeeId && i.date === form.date && i.id !== editing?.id);
    if (duplicate) return toast.error(t('يوجد سجل حضور لهذا الموظف في نفس التاريخ', 'Attendance already exists for this employee/date', lang));
    setSaving(true);
    try {
      const hours = form.status === 'PRESENT' ? Number(form.hours) || 0 : 0;
      const data = { employeeId: form.employeeId, date: form.date, status: form.status, hours, notes: form.notes };
      if (editing) { await base44.entities.AttendanceRecord.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.AttendanceRecord.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.AttendanceRecord.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const exportColumns = [
    { header: { ar: 'الموظف', en: 'Employee' }, value: (r) => empName(r.employeeId) },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
    { header: { ar: 'الساعات', en: 'Hours' }, value: (r) => r.hours ?? 0 },
    { header: { ar: 'ملاحظات', en: 'Notes' }, value: (r) => r.notes },
  ];

  return (
    <ModuleLayout
      title={t('الحضور والإجازات', 'Attendance', lang)}
      subtitle={t('تسجيل حضور وإجازات الموظفين', 'Track employee attendance and leaves', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الحضور والإجازات', en: 'Attendance' }} />
          <Button onClick={openNew} className="gap-2 bg-violet-600 hover:bg-violet-700"><Plus className="size-4" />{t('تسجيل يوم', 'Log Day', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالموظف...', 'Search employee...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الحالات', 'All Statuses', lang)}</SelectItem>
            {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الموظف', 'Employee', lang)}</TableHead>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الساعات', 'Hours', lang)}</TableHead>
                <TableHead>{t('ملاحظات', 'Notes', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد سجلات حضور', 'No attendance records', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUSES[item.status] || STATUSES.PRESENT;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{empName(item.employeeId)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(item.date, lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                        <TableCell className="text-sm">{item.hours ?? '—'}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{item.notes || '—'}</TableCell>
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
      <p className="text-sm text-muted-foreground">{filtered.length} {t('سجل', 'records', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل السجل', 'Edit Record', lang) : t('تسجيل حضور', 'Log Attendance', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1 col-span-2">
              <Label>{t('الموظف', 'Employee', lang)} *</Label>
              <Select value={form.employeeId} onValueChange={v => setForm(f => ({ ...f, employeeId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر موظف', 'Select employee', lang)} /></SelectTrigger>
                <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
            <div className="space-y-1">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('الساعات', 'Hours', lang)}</Label><Input type="number" value={form.hours} onChange={e => setForm(f => ({ ...f, hours: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف السجل', 'Delete Record', lang)}
        description={t('سيتم حذف سجل الحضور نهائياً.', 'This record will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}