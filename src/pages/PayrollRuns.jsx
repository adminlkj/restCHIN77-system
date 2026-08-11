import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Plus, Search, Pencil, Trash2, RefreshCw, Printer, CheckCircle2, CreditCard, UserPlus, UserMinus, Users } from 'lucide-react';
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
import { t, formatCurrency, STATUS_TONE } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import { loadAccounts, selectCashAccounts } from '@/lib/postingEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import PayrollRunDocument from '@/components/shared/PayrollRunDocument';
import { printHtml } from '@/lib/printDocument';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { toast } from 'sonner';

const STATUSES = { DRAFT: { ar: 'مسودة', en: 'Draft', color: STATUS_TONE.NEUTRAL }, APPROVED: { ar: 'موافق', en: 'Approved', color: STATUS_TONE.INFO }, PAID: { ar: 'مدفوع', en: 'Paid', color: STATUS_TONE.SUCCESS } };
const MONTHS = { 1: 'يناير / January', 2: 'فبراير / February', 3: 'مارس / March', 4: 'أبريل / April', 5: 'مايو / May', 6: 'يونيو / June', 7: 'يوليو / July', 8: 'أغسطس / August', 9: 'سبتمبر / September', 10: 'أكتوبر / October', 11: 'نوفمبر / November', 12: 'ديسمبر / December' };

// كل بند موظف يبدأ من بياناته الافتراضية ثم قابل للتعديل يدوياً.
const empty = { code: '', month: '', year: new Date().getFullYear(), totalSalaries: '', totalAllowances: '', totalDeductions: '', netAmount: '', status: 'DRAFT', paymentAccountCode: '', paymentAccountName: '', paymentDate: '', notes: '', employeeIds: [], employeeLines: [] };

// بناء بند موظف من سجل الموظف.
function lineFromEmployee(emp) {
  const salary = Number(emp.salary) || 0;
  const allowances = Number(emp.allowances) || 0;
  const deductions = Number(emp.deductions) || 0;
  return {
    employeeId: emp.id,
    code: emp.code || '',
    name: emp.nameAr || emp.name || '',
    position: emp.position || '',
    department: emp.department || '',
    salary, allowances, deductions,
    net: salary + allowances - deductions,
  };
}

export default function PayrollRuns() {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const [printRun, setPrintRun] = useState(null);
  const printRef = useRef(null);
  const [items, setItems] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [cashAccounts, setCashAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [approvingId, setApprovingId] = useState(null);
  // بحث منفصل داخل قائمة اختيار الموظفين بالنافذة.
  const [empPickerSearch, setEmpPickerSearch] = useState('');
  // إظهار/إخفاء قائمة الموظفين الكاملة داخل النموذج.
  const [showEmpPicker, setShowEmpPicker] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [p, e, accs] = await Promise.all([base44.entities.PayrollRun.list('-created_date', 100), base44.entities.Employee.filter({ status: 'ACTIVE' }), loadAccounts(true)]);
      setItems(p); setEmployees(e); setCashAccounts(selectCashAccounts(accs));
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => !search || i.code?.toLowerCase().includes(search.toLowerCase()));

  const openNew = () => {
    setEditing(null);
    setForm({ ...empty, year: new Date().getFullYear() });
    setEmpPickerSearch('');
    setShowEmpPicker(false);
    setDialogOpen(true);
  };
  const openEdit = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن تعديل مسير معتمد أو مدفوع', 'Cannot edit an approved or paid payroll run', lang));
    setEditing(item);
    setForm({
      ...empty,
      ...item,
      totalSalaries: item.totalSalaries ?? '',
      totalAllowances: item.totalAllowances ?? '',
      totalDeductions: item.totalDeductions ?? '',
      employeeIds: Array.isArray(item.employeeIds) ? item.employeeIds : [],
      employeeLines: Array.isArray(item.employeeLines) ? item.employeeLines : [],
    });
    setEmpPickerSearch('');
    setShowEmpPicker(false);
    setDialogOpen(true);
  };
  const openPay = (item) => {
    setEditing(item);
    setForm({ ...empty, ...item, status: 'PAID', paymentDate: item.paymentDate || new Date().toISOString().slice(0, 10) });
    setDialogOpen(true);
  };
  const askDelete = (item) => {
    if (item.status !== 'DRAFT') return toast.error(t('لا يمكن حذف مسير معتمد أو مدفوع', 'Cannot delete an approved or paid payroll run', lang));
    setDeleteId(item.id);
    setConfirmOpen(true);
  };

  // المجاميع تُحسب دائماً من بنود الموظفين المختارين — لا تُدخل يدوياً.
  const selectedLines = Array.isArray(form.employeeLines) ? form.employeeLines : [];
  const sal = selectedLines.reduce((s, l) => s + (Number(l.salary) || 0), 0);
  const all = selectedLines.reduce((s, l) => s + (Number(l.allowances) || 0), 0);
  const ded = selectedLines.reduce((s, l) => s + (Number(l.deductions) || 0), 0);
  const netAmount = sal + all - ded;

  // الموظفون غير المضمّنين بعد (متاحون للإضافة).
  const availableEmployees = useMemo(() => {
    const selectedIds = new Set(selectedLines.map(l => l.employeeId));
    return employees
      .filter(e => !selectedIds.has(e.id))
      .filter(e => {
        if (!empPickerSearch) return true;
        const q = empPickerSearch.toLowerCase();
        return (e.code || '').toLowerCase().includes(q) || (e.nameAr || e.name || '').toLowerCase().includes(q) || (e.department || '').toLowerCase().includes(q);
      });
  }, [employees, selectedLines, empPickerSearch]);

  const addEmployee = (emp) => {
    const line = lineFromEmployee(emp);
    setForm(f => ({
      ...f,
      employeeIds: [...(f.employeeIds || []), emp.id],
      employeeLines: [...(f.employeeLines || []), line],
    }));
  };

  const addAllActive = () => {
    const existing = new Set((form.employeeLines || []).map(l => l.employeeId));
    const toAdd = employees.filter(e => e.status === 'ACTIVE' && !existing.has(e.id)).map(lineFromEmployee);
    setForm(f => ({
      ...f,
      employeeIds: [...(f.employeeIds || []), ...toAdd.map(l => l.employeeId)],
      employeeLines: [...(f.employeeLines || []), ...toAdd],
    }));
    toast.success(t(`تمت إضافة ${toAdd.length} موظف`, `Added ${toAdd.length} employees`, lang));
  };

  const removeEmployee = (employeeId) => {
    setForm(f => ({
      ...f,
      employeeIds: (f.employeeIds || []).filter(id => id !== employeeId),
      employeeLines: (f.employeeLines || []).filter(l => l.employeeId !== employeeId),
    }));
  };

  const updateLine = (employeeId, field, value) => {
    setForm(f => ({
      ...f,
      employeeLines: (f.employeeLines || []).map(l => {
        if (l.employeeId !== employeeId) return l;
        const next = { ...l, [field]: Number(value) || 0 };
        next.net = (Number(next.salary) || 0) + (Number(next.allowances) || 0) - (Number(next.deductions) || 0);
        return next;
      }),
    }));
  };

  const save = async () => {
    if (!form.month || !form.year) return toast.error(t('الشهر والسنة مطلوبة', 'Month and year required', lang));
    const m = parseInt(form.month), y = parseInt(form.year);
    const dup = items.find(i => i.month === m && i.year === y && i.id !== editing?.id);
    if (dup) return toast.error(t(`يوجد مسيّر لهذا الشهر بالفعل (${dup.code})`, `A payroll run already exists for this month (${dup.code})`, lang));
    if (selectedLines.length === 0) return toast.error(t('اختر موظفاً واحداً على الأقل للمسير', 'Select at least one employee for the payroll run', lang));
    if (netAmount <= 0) return toast.error(t('صافي المسير يجب أن يكون أكبر من صفر', 'Net amount must be greater than zero', lang));
    if (form.status === 'PAID' && !form.paymentAccountCode) return toast.error(t('لا يمكن تسجيل السداد دون تحديد طريقة الدفع', 'Payment requires a payment method', lang));
    if (form.status === 'PAID' && !form.paymentDate) return toast.error(t('لا يمكن تسجيل السداد دون تحديد تاريخ الدفع', 'Payment requires a payment date', lang));
    const autoCode = editing?.code || (() => {
      const prefix = `PAY-${y}-${String(m).padStart(2, '0')}`;
      const existing = items.filter(i => (i.code || '').startsWith(prefix)).length;
      return `${prefix}-${String(existing + 1).padStart(2, '0')}`;
    })();
    setSaving(true);
    try {
      const data = { ...form, code: autoCode, month: m, year: y, totalSalaries: sal, totalAllowances: all, totalDeductions: ded, netAmount, employeeIds: (form.employeeIds || []), employeeLines: selectedLines };
      if (editing && form.status === 'PAID') {
        await OperationEngine.payPayrollRun(editing.id, data);
        toast.success(t('تم تسجيل السداد وترحيل قيد الدفع', 'Payment recorded and posted', lang));
      } else if (editing) {
        await OperationEngine.updatePayrollRun(editing.id, { ...data, status: 'DRAFT' });
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await OperationEngine.createPayrollRun({ ...data, status: 'DRAFT' });
        toast.success(t('تمت الإضافة كمسودة — اعتمدها لاحقاً لترحيل قيد الاستحقاق', 'Added as draft — approve later to post accrual', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const approve = async (item) => {
    setApprovingId(item.id);
    try {
      await OperationEngine.approvePayrollRun(item.id);
      toast.success(t('تم اعتماد المسير وترحيل قيد الاستحقاق', 'Payroll approved and accrual posted', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل الاعتماد', 'Approval failed', lang)); }
    setApprovingId(null);
  };

  const doPrint = () => printHtml(printRef.current?.innerHTML, { title: printRun?.code || 'Payroll', lang });

  const remove = async () => {
    try { await base44.entities.PayrollRun.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const empTotalSalary = employees.reduce((s, e) => s + (e.salary || 0) + (e.allowances || 0), 0);

  const exportColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الشهر', en: 'Month' }, value: (r) => r.month },
    { header: { ar: 'السنة', en: 'Year' }, value: (r) => r.year },
    { header: { ar: 'عدد الموظفين', en: 'Employees' }, value: (r) => (r.employeeIds?.length ?? (r.employeeLines?.length || 0)) },
    { header: { ar: 'إجمالي الرواتب', en: 'Total Salaries' }, value: (r) => r.totalSalaries || 0 },
    { header: { ar: 'البدلات', en: 'Allowances' }, value: (r) => r.totalAllowances || 0 },
    { header: { ar: 'الخصومات', en: 'Deductions' }, value: (r) => r.totalDeductions || 0 },
    { header: { ar: 'الصافي', en: 'Net' }, value: (r) => r.netAmount || 0 },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('مسيرات الرواتب', 'Payroll Runs', lang)}
      subtitle={t('إنشاء مسير لموظفين محددين ثم اعتماده وسداده', 'Create a payroll for specific employees, approve, then pay', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'مسيرات الرواتب', en: 'Payroll Runs' }} />
          <Button onClick={openNew} className="gap-2 bg-violet-600 hover:bg-violet-700"><Plus className="size-4" />{t('مسير جديد', 'New Payroll', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-violet-700">{employees.length}</p>
          <p className="text-xs text-muted-foreground">{t('موظف نشط', 'Active Employees', lang)}</p>
        </div>
        <div className="bg-violet-50 border border-violet-200 rounded-xl p-3 text-center">
          <p className="text-lg font-bold text-violet-700">{formatCurrency(empTotalSalary, lang)}</p>
          <p className="text-xs text-muted-foreground">{t('إجمالي الرواتب+البدلات', 'Total Salaries+Allowances', lang)}</p>
        </div>
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3 text-center">
          <p className="text-xl font-bold text-emerald-700">{items.filter(i => i.status === 'PAID').length}</p>
          <p className="text-xs text-muted-foreground">{t('مسيرات مدفوعة', 'Paid Runs', lang)}</p>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الكود', 'Code', lang)}</TableHead>
                <TableHead>{t('الشهر / السنة', 'Month / Year', lang)}</TableHead>
                <TableHead className="text-center">{t('الموظفون', 'Employees', lang)}</TableHead>
                <TableHead>{t('إجمالي الرواتب', 'Total Salaries', lang)}</TableHead>
                <TableHead>{t('البدلات', 'Allowances', lang)}</TableHead>
                <TableHead>{t('الخصومات', 'Deductions', lang)}</TableHead>
                <TableHead>{t('الصافي', 'Net', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد مسيرات', 'No payroll runs', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const st = STATUSES[item.status] || STATUSES.DRAFT;
                  const empCount = item.employeeIds?.length ?? item.employeeLines?.length ?? 0;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs font-medium">{item.code}</TableCell>
                      <TableCell className="font-medium">{MONTHS[item.month]} {item.year}</TableCell>
                      <TableCell className="text-center"><span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700"><Users className="size-3" />{empCount}</span></TableCell>
                      <TableCell>{formatCurrency(item.totalSalaries, lang)}</TableCell>
                      <TableCell className="text-emerald-600">{formatCurrency(item.totalAllowances, lang)}</TableCell>
                      <TableCell className="text-rose-600">{formatCurrency(item.totalDeductions, lang)}</TableCell>
                      <TableCell className="font-bold">{formatCurrency(item.netAmount, lang)}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {item.status === 'DRAFT' && <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={approvingId === item.id} onClick={() => approve(item)}><CheckCircle2 className="size-3.5" />{approvingId === item.id ? t('جارٍ...', '...', lang) : t('اعتماد', 'Approve', lang)}</Button>}
                          {item.status === 'APPROVED' && <Button variant="outline" size="sm" className="h-8 gap-1 text-blue-700 border-blue-200 hover:bg-blue-50" onClick={() => openPay(item)}><CreditCard className="size-3.5" />{t('سداد', 'Pay', lang)}</Button>}
                          <Button variant="ghost" size="icon" className="size-8 text-violet-600" onClick={() => setPrintRun(item)}><Printer className="size-3.5" /></Button>
                          {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>}
                          {item.status === 'DRAFT' && <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item)}><Trash2 className="size-3.5" /></Button>}
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
        <DialogContent className="max-w-4xl max-h-[92vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? t('تعديل المسير', 'Edit Payroll', lang) : t('مسير جديد', 'New Payroll Run', lang)}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            {/* صف الشهر/السنة/الحالة */}
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>{t('الشهر', 'Month', lang)} *</Label>
                <Select value={String(form.month)} onValueChange={v => setForm(f => ({ ...f, month: v }))}>
                  <SelectTrigger><SelectValue placeholder={t('اختر شهر', 'Select month', lang)} /></SelectTrigger>
                  <SelectContent>{Object.entries(MONTHS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>{t('السنة', 'Year', lang)} *</Label><Input type="number" value={form.year} onChange={e => setForm(f => ({ ...f, year: e.target.value }))} /></div>
              <div className="space-y-1.5">
                <Label>{t('الحالة', 'Status', lang)}</Label>
                <Input readOnly value={form.status === 'PAID' ? t('سداد مسير معتمد', 'Pay approved payroll', lang) : t('مسودة (تُعتمد لاحقاً)', 'Draft (approve later)', lang)} className="bg-muted text-muted-foreground" />
              </div>
            </div>

            {/* قسم اختيار الموظفين — جوهر الإصلاح */}
            {form.status !== 'PAID' && (
              <div className="rounded-lg border border-violet-200 bg-violet-50/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <Label className="flex items-center gap-1.5 text-violet-800"><Users className="size-4" />{t('الموظفون المضمّنون في المسير', 'Employees in this payroll', lang)} ({selectedLines.length})</Label>
                  <Button type="button" variant="outline" size="sm" className="h-7 gap-1 text-xs" onClick={() => setShowEmpPicker(v => !v)}>
                    <UserPlus className="size-3.5" />{t('إضافة موظف', 'Add employee', lang)}
                  </Button>
                </div>

                {/* قائمة اختيار الموظف */}
                {showEmpPicker && (
                  <div className="mb-3 rounded-md border border-violet-200 bg-white p-2">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <Input value={empPickerSearch} onChange={e => setEmpPickerSearch(e.target.value)} placeholder={t('بحث بالكود/الاسم/القسم...', 'Search code/name/dept...', lang)} className="h-8 text-sm" />
                      <Button type="button" variant="ghost" size="sm" className="h-8 text-xs text-violet-700 shrink-0" onClick={addAllActive} disabled={availableEmployees.length === 0}>
                        {t('إضافة كل النشطين', 'Add all active', lang)}
                      </Button>
                    </div>
                    {availableEmployees.length === 0 ? (
                      <p className="text-center text-xs text-muted-foreground py-3">{t('لا يوجد موظفون متاحون للإضافة', 'No employees available to add', lang)}</p>
                    ) : (
                      <div className="max-h-44 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1">
                        {availableEmployees.map(e => (
                          <button key={e.id} type="button" onClick={() => addEmployee(e)} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-violet-50 border border-transparent hover:border-violet-200">
                            <span className="flex items-center gap-2 truncate">
                              <span className="font-mono text-xs text-muted-foreground">{e.code}</span>
                              <span className="truncate">{lang === 'ar' ? (e.nameAr || e.name) : e.name}</span>
                              {e.department && <span className="text-xs text-muted-foreground">· {e.department}</span>}
                            </span>
                            <UserPlus className="size-3.5 text-violet-600 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* جدول البنود القابل للتعديل */}
                {selectedLines.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">{t('لم تختر أي موظف بعد — اضغط "إضافة موظف" للبدء', 'No employees selected — click "Add employee" to start', lang)}</p>
                ) : (
                  <div className="overflow-x-auto rounded-md border border-violet-100 bg-white">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="h-8 text-xs">{t('الموظف', 'Employee', lang)}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t('الراتب', 'Salary', lang)}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t('البدلات', 'Allow.', lang)}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t('الخصم', 'Deduct.', lang)}</TableHead>
                          <TableHead className="h-8 text-xs text-right">{t('الصافي', 'Net', lang)}</TableHead>
                          <TableHead className="h-8 text-xs"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {selectedLines.map(l => (
                          <TableRow key={l.employeeId}>
                            <TableCell className="py-1.5">
                              <div className="flex flex-col">
                                <span className="text-sm font-medium">{lang === 'ar' ? l.name : l.name}</span>
                                <span className="text-xs text-muted-foreground font-mono">{l.code}{l.department ? ` · ${l.department}` : ''}</span>
                              </div>
                            </TableCell>
                            <TableCell className="py-1.5"><Input type="number" className="h-8 w-28 text-sm text-right" value={l.salary} onChange={e => updateLine(l.employeeId, 'salary', e.target.value)} /></TableCell>
                            <TableCell className="py-1.5"><Input type="number" className="h-8 w-24 text-sm text-right" value={l.allowances} onChange={e => updateLine(l.employeeId, 'allowances', e.target.value)} /></TableCell>
                            <TableCell className="py-1.5"><Input type="number" className="h-8 w-24 text-sm text-right" value={l.deductions} onChange={e => updateLine(l.employeeId, 'deductions', e.target.value)} /></TableCell>
                            <TableCell className="py-1.5 text-right font-bold text-violet-700">{formatCurrency(l.net, lang)}</TableCell>
                            <TableCell className="py-1.5">
                              <Button type="button" variant="ghost" size="icon" className="size-7 text-destructive" onClick={() => removeEmployee(l.employeeId)}><UserMinus className="size-3.5" /></Button>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            )}

            {/* المجاميع المحسوبة */}
            <div className="grid grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/40 p-2.5 text-center">
                <p className="text-xs text-muted-foreground">{t('إجمالي الرواتب', 'Total Salaries', lang)}</p>
                <p className="font-bold text-sm">{formatCurrency(sal, lang)}</p>
              </div>
              <div className="rounded-lg bg-emerald-50 p-2.5 text-center">
                <p className="text-xs text-muted-foreground">{t('إجمالي البدلات', 'Allowances', lang)}</p>
                <p className="font-bold text-sm text-emerald-700">{formatCurrency(all, lang)}</p>
              </div>
              <div className="rounded-lg bg-rose-50 p-2.5 text-center">
                <p className="text-xs text-muted-foreground">{t('إجمالي الخصومات', 'Deductions', lang)}</p>
                <p className="font-bold text-sm text-rose-700">{formatCurrency(ded, lang)}</p>
              </div>
              <div className="rounded-lg bg-violet-100 p-2.5 text-center">
                <p className="text-xs text-muted-foreground">{t('الصافي', 'Net', lang)}</p>
                <p className="font-bold text-base text-violet-800">{formatCurrency(netAmount, lang)}</p>
              </div>
            </div>

            {form.status === 'PAID' && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
                <p className="text-xs font-medium text-emerald-800 mb-2">{t('بيانات السداد (إلزامية للمسير المدفوع)', 'Payment details (required for paid run)', lang)}</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>{t('طريقة الدفع', 'Payment Method', lang)} *</Label>
                    <Select value={form.paymentAccountCode} onValueChange={v => { const a = cashAccounts.find(x => x.code === v); setForm(f => ({ ...f, paymentAccountCode: v, paymentAccountName: a?.name || '' })); }}>
                      <SelectTrigger><SelectValue placeholder={t('اختر الحساب النقدي', 'Select cash account', lang)} /></SelectTrigger>
                      <SelectContent>{cashAccounts.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('تاريخ الدفع', 'Payment Date', lang)} *</Label>
                    <Input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} />
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            {/* type="button" ضروري: زر type="submit" خارج <form> لا يطلق onClick في
                بعض المتصفحات وخصوصاً داخل Radix Dialog. تحديده كـ button يضمن عمل النقر. */}
            <Button type="button" onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف المسير', 'Delete Payroll Run', lang)}
        description={t('سيتم حذف مسير الرواتب نهائياً.', 'This payroll run will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      <Dialog open={!!printRun} onOpenChange={(v) => !v && setPrintRun(null)}>
        <DialogContent className="max-w-2xl max-h-[92vh] p-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <span className="font-semibold">{t('معاينة المسيّر', 'Payroll Preview', lang)}</span>
            <Button size="sm" onClick={doPrint} className="gap-1 bg-violet-600 hover:bg-violet-700"><Printer className="size-3.5" />{t('طباعة / تصدير', 'Print / Export', lang)}</Button>
          </div>
          <div className="overflow-auto max-h-[80vh] bg-muted/30 p-4">
            <div className="bg-white mx-auto max-w-xl p-8 rounded shadow-sm">
              {printRun && <PayrollRunDocument run={printRun} settings={settings} lang={lang} innerRef={printRef} />}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}
