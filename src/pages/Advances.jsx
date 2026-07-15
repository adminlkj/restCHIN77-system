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
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const STATUSES = {
  OPEN:               { ar: 'مفتوحة',        en: 'Open', color: 'bg-amber-100 text-amber-700' },
  PARTIALLY_DEDUCTED: { ar: 'مستقطعة جزئياً', en: 'Partial', color: 'bg-blue-100 text-blue-700' },
  SETTLED:            { ar: 'مسددة',         en: 'Settled', color: 'bg-emerald-100 text-emerald-700' },
};
const empty = { employeeId: '', date: '', amount: '', deductedAmount: '', status: 'OPEN', reason: '', notes: '' };

export default function Advances() {
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
        base44.entities.EmployeeAdvance.list('-date', 300),
        base44.entities.Employee.list(),
      ]);
      setItems(a); setEmployees(em);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const empName = (id) => employees.find(e => e.id === id)?.name || '—';

  const filtered = items.filter(i => {
    const match = !search || empName(i.employeeId).toLowerCase().includes(search.toLowerCase()) || i.reason?.toLowerCase().includes(search.toLowerCase());
    return match && (filterStatus === 'ALL' || i.status === filterStatus);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, date: new Date().toISOString().slice(0, 10) }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.employeeId || !form.date || !form.amount)
      return toast.error(t('الموظف والتاريخ والمبلغ مطلوبة', 'Employee, date and amount required', lang));
    const amount = Number(form.amount) || 0;
    const deductedAmount = Number(form.deductedAmount) || 0;
    if (deductedAmount > amount) return toast.error(t('المستقطع لا يمكن أن يتجاوز مبلغ السلفة', 'Deducted amount cannot exceed advance amount', lang));
    const status = deductedAmount >= amount ? 'SETTLED' : deductedAmount > 0 ? 'PARTIALLY_DEDUCTED' : 'OPEN';
    setSaving(true);
    try {
      const data = {
        employeeId: form.employeeId, date: form.date,
        amount, deductedAmount,
        status, reason: form.reason, notes: form.notes,
      };
      if (editing) { await base44.entities.EmployeeAdvance.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.EmployeeAdvance.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try { await base44.entities.EmployeeAdvance.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load(); }
    catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalOpen = filtered.filter(r => r.status !== 'SETTLED').reduce((s, r) => s + ((r.amount || 0) - (r.deductedAmount || 0)), 0);

  const exportColumns = [
    { header: { ar: 'الموظف', en: 'Employee' }, value: (r) => empName(r.employeeId) },
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'السبب', en: 'Reason' }, value: (r) => r.reason },
    { header: { ar: 'المبلغ', en: 'Amount' }, value: (r) => r.amount || 0 },
    { header: { ar: 'المستقطع', en: 'Deducted' }, value: (r) => r.deductedAmount || 0 },
    { header: { ar: 'المتبقي', en: 'Remaining' }, value: (r) => (r.amount || 0) - (r.deductedAmount || 0) },
    { header: { ar: 'الحالة', en: 'Status' }, value: (r) => { const st = STATUSES[r.status]; return st ? (lang === 'ar' ? st.ar : st.en) : r.status; } },
  ];

  return (
    <ModuleLayout
      title={t('السلف والاستقطاعات', 'Advances', lang)}
      subtitle={t('متابعة سلف الموظفين واستقطاعاتها', 'Track employee advances and deductions', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'السلف', en: 'Advances' }} />
          <Button onClick={openNew} className="gap-2 bg-violet-600 hover:bg-violet-700"><Plus className="size-4" />{t('سلفة جديدة', 'New Advance', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
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
                <TableHead>{t('السبب', 'Reason', lang)}</TableHead>
                <TableHead>{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead>{t('المستقطع', 'Deducted', lang)}</TableHead>
                <TableHead>{t('المتبقي', 'Remaining', lang)}</TableHead>
                <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد سلف', 'No advances', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const st = STATUSES[item.status] || STATUSES.OPEN;
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="font-medium">{empName(item.employeeId)}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{formatDate(item.date, lang)}</TableCell>
                        <TableCell className="text-sm">{item.reason || '—'}</TableCell>
                        <TableCell className="text-sm font-medium">{formatCurrency(item.amount, lang)}</TableCell>
                        <TableCell className="text-sm text-emerald-600">{formatCurrency(item.deductedAmount, lang)}</TableCell>
                        <TableCell className="text-sm font-medium text-amber-700">{formatCurrency((item.amount || 0) - (item.deductedAmount || 0), lang)}</TableCell>
                        <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span></TableCell>
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
      <p className="text-sm text-muted-foreground">{filtered.length} {t('سلفة', 'advances', lang)} | {t('الرصيد المفتوح', 'Open Balance', lang)}: <strong className="text-amber-600">{formatCurrency(totalOpen, lang)}</strong></p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل السلفة', 'Edit Advance', lang) : t('سلفة جديدة', 'New Advance', lang)}</DialogTitle></DialogHeader>
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
              <Label>{t('الحالة (تلقائي)', 'Status (auto)', lang)}</Label>
              <Input
                readOnly
                className="bg-muted font-medium"
                value={(() => {
                  const amt = Number(form.amount) || 0;
                  const ded = Number(form.deductedAmount) || 0;
                  const s = ded >= amt && amt > 0 ? 'SETTLED' : ded > 0 ? 'PARTIALLY_DEDUCTED' : 'OPEN';
                  const st = STATUSES[s];
                  return lang === 'ar' ? st.ar : st.en;
                })()}
              />
            </div>
            <div className="space-y-1"><Label>{t('المبلغ', 'Amount', lang)} *</Label><Input type="number" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('المستقطع', 'Deducted', lang)}</Label><Input type="number" value={form.deductedAmount} onChange={e => setForm(f => ({ ...f, deductedAmount: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2"><Label>{t('السبب', 'Reason', lang)}</Label><Input value={form.reason} onChange={e => setForm(f => ({ ...f, reason: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-violet-600 hover:bg-violet-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف السلفة', 'Delete Advance', lang)}
        description={t('سيتم حذف السلفة نهائياً.', 'This advance will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}