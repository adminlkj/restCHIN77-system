import React, { useState, useEffect } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, LayoutGrid } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import SmartEntityCard from '@/components/shared/SmartEntityCard';
import { toast } from 'sonner';

const STATUSES = { ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' }, ON_LEAVE: { ar: 'إجازة', en: 'On Leave', color: 'bg-amber-100 text-amber-700' }, TERMINATED: { ar: 'منتهي', en: 'Terminated', color: 'bg-rose-100 text-rose-700' } };
const empty = { code: '', name: '', nameAr: '', photoUrl: '', position: '', department: '', phone: '', email: '', nationalId: '', nationality: '', hireDate: '', salary: '', allowances: '', status: 'ACTIVE', notes: '' };

export default function Employees() {
  const { lang, setEmployeeContext, setActiveItem } = useStore();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  const load = async () => {
    setLoading(true);
    try { setItems(await base44.entities.Employee.list('-created_date', 200)); }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const matchSearch = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'EMP', 'code') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.code || !form.name) return toast.error(t('الكود والاسم مطلوبان', 'Code and name are required', lang));
    setSaving(true);
    try {
      const data = { ...form, salary: parseFloat(form.salary) || 0, allowances: parseFloat(form.allowances) || 0, isActive: form.status === 'ACTIVE' };
      if (editing) { await base44.entities.Employee.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.Employee.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.PayrollRun.filter({ employeeId: deleteId }),
        base44.entities.EmployeeAdvance.filter({ employeeId: deleteId }),
        base44.entities.EmployeeCustody.filter({ employeeId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف موظف له رواتب أو سلف أو عهد', 'Cannot delete an employee with payroll, advances or custody', lang));
        return;
      }
      await base44.entities.Employee.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const uploadPhoto = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      setForm(f => ({ ...f, photoUrl: file_url }));
    } catch {
      toast.error(t('فشل رفع الصورة', 'Photo upload failed', lang));
    }
    setUploadingPhoto(false);
  };

  const totalSalaries = items.filter(i => i.status === 'ACTIVE').reduce((s, e) => s + (e.salary || 0) + (e.allowances || 0), 0);

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الاسم', en: 'Name' }, value: (r) => r.name },
    { header: { ar: 'المنصب', en: 'Position' }, value: (r) => r.position },
    { header: { ar: 'القسم', en: 'Department' }, value: (r) => r.department },
    { header: { ar: 'الراتب', en: 'Salary' }, value: (r) => r.salary || 0 },
    { header: { ar: 'البدلات', en: 'Allowances' }, value: (r) => r.allowances || 0 },
    { header: { ar: 'الجنسية', en: 'Nationality' }, value: (r) => r.nationality },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('الموظفون', 'Employees', lang)}
      subtitle={t('إدارة بيانات الموظفين والرواتب', 'Manage employee records', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الموظفون', en: 'Employees' }} />
          <Button onClick={openNew} className="gap-2 bg-violet-600 hover:bg-violet-700"><Plus className="size-4" />{t('موظف جديد', 'New Employee', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
        {Object.entries(STATUSES).map(([s, cfg]) => (
          <button key={s} onClick={() => setFilterStatus(filterStatus === s ? 'ALL' : s)}
            className={`p-3 rounded-xl border text-center transition-all ${filterStatus === s ? 'ring-2 ring-violet-500' : 'hover:bg-muted/50'}`}>
            <p className="text-xl font-bold">{items.filter(i => i.status === s).length}</p>
            <p className={`text-xs rounded-full px-2 py-0.5 mt-0.5 ${cfg.color}`}>{lang === 'ar' ? cfg.ar : cfg.en}</p>
          </button>
        ))}
        <div className="p-3 rounded-xl border bg-violet-50 text-center">
          <p className="text-sm font-bold text-violet-700 leading-tight">{formatCurrency(totalSalaries, lang)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{t('إجمالي الرواتب', 'Total Payroll', lang)}</p>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('الكل', 'All', lang)}</SelectItem>
            {Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Card key={i} className="h-48 bg-muted animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="py-14 text-center text-muted-foreground">{t('لا يوجد موظفون', 'No employees', lang)}</Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(item => {
            const st = STATUSES[item.status] || STATUSES.ACTIVE;
            return (
              <SmartEntityCard
                key={item.id}
                accent="violet"
                title={item.name}
                subtitle={`${item.position || t('موظف', 'Employee', lang)}${item.department ? ` — ${item.department}` : ''}`}
                code={item.code}
                avatarUrl={item.photoUrl}
                initials={(item.name || 'EM').slice(0, 2).toUpperCase()}
                badges={[{ label: lang === 'ar' ? st.ar : st.en, className: st.color }]}
                meta={[
                  { label: t('إجمالي الراتب', 'Total Pay', lang), value: formatCurrency((item.salary || 0) + (item.allowances || 0), lang) },
                  { label: t('الهاتف', 'Phone', lang), value: item.phone, dir: 'ltr' },
                  { label: t('الجنسية', 'Nationality', lang), value: item.nationality },
                  { label: t('تاريخ التعيين', 'Hire Date', lang), value: item.hireDate ? formatDate(item.hireDate, lang) : '' },
                ]}
                actions={<><Button variant="ghost" size="icon" className="size-8 text-violet-600" title={t('مركز العمل', 'Workspace', lang)} onClick={() => { setEmployeeContext(item.id, item.name); setActiveItem('employee-workspace'); }}><LayoutGrid className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button><Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button></>}
              />
            );
          })}
        </div>
      )}
      <p className="text-sm text-muted-foreground">{filtered.length} {t('موظف', 'employees', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل موظف', 'Edit Employee', lang) : t('موظف جديد', 'New Employee', lang)}</DialogTitle></DialogHeader>
          <div className="flex items-center gap-4 rounded-xl border bg-muted/30 p-3">
            <div className="size-20 rounded-2xl overflow-hidden bg-violet-100 text-violet-700 flex items-center justify-center font-bold text-xl shrink-0">
              {form.photoUrl ? <img src={form.photoUrl} alt={form.name || ''} className="size-full object-cover" /> : (form.name || 'مو').slice(0, 2).toUpperCase()}
            </div>
            <div className="flex-1 space-y-1.5">
              <Label>{t('صورة الموظف', 'Employee Photo', lang)}</Label>
              <Input type="file" accept="image/*" onChange={uploadPhoto} disabled={uploadingPhoto} />
              <p className="text-xs text-muted-foreground">{uploadingPhoto ? t('جاري رفع الصورة...', 'Uploading photo...', lang) : t('إذا لم تُرفق صورة ستظهر صورة افتراضية تلقائياً.', 'If no photo is uploaded, a default avatar is shown automatically.', lang)}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4 py-2">
            {[['code', t('الكود', 'Code', lang), true], ['name', t('الاسم', 'Name', lang)], ['nameAr', t('الاسم بالعربية', 'Name (Arabic)', lang)], ['position', t('المنصب', 'Position', lang)], ['department', t('القسم', 'Department', lang)], ['phone', t('الهاتف', 'Phone', lang)], ['email', t('البريد الإلكتروني', 'Email', lang)], ['nationalId', t('رقم الهوية', 'National ID', lang)], ['nationality', t('الجنسية', 'Nationality', lang)]].map(([field, label, ro]) => (
              <div key={field} className="space-y-1.5"><Label>{label}</Label><Input value={form[field] || ''} readOnly={ro} onChange={ro ? undefined : e => setForm(f => ({ ...f, [field]: e.target.value }))} className={ro ? 'bg-muted font-mono' : ''} /></div>
            ))}
            <div className="space-y-1.5"><Label>{t('تاريخ التعيين', 'Hire Date', lang)}</Label><Input type="date" value={form.hireDate || ''} onChange={e => setForm(f => ({ ...f, hireDate: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('الراتب الأساسي', 'Basic Salary', lang)}</Label><Input type="number" value={form.salary || ''} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label>{t('البدلات', 'Allowances', lang)}</Label><Input type="number" value={form.allowances || ''} onChange={e => setForm(f => ({ ...f, allowances: e.target.value }))} /></div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(STATUSES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الموظف', 'Delete Employee', lang)}
        description={t('سيتم حذف بيانات الموظف نهائياً.', 'This employee record will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}