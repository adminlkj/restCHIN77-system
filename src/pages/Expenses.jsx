import React, { useState, useEffect } from 'react';
import { Plus, Search, RefreshCw, RotateCcw } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, EXPENSE_CATEGORIES } from '@/lib/utils-binaa';
import { OperationEngine } from '@/lib/businessEngine';
import { selectExpenseAccounts, selectCashAccounts } from '@/lib/postingEngine';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import ExpenseDialog, { RESTAURANT_EXPENSE_TYPES, getRestaurantExpenseType } from '@/components/expenses/ExpenseDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';
import { requiredFields, missingFieldsMessage } from '@/lib/formValidation';

// نموذج المصروف الافتراضي — مطعمي بالكامل. لا اختيار مشروع/معدات/عقد/موقع/BOQ.
const empty = {
  expenseType: 'COMPANY',
  category: 'OTHER', description: '', amount: '',
  date: '',
  employeeId: '', employeeName: '',
  govEntity: '',
  expenseAccountCode: '', expenseAccountName: '',
  paymentAccountCode: '', paymentAccountName: '',
  reference: '', notes: '',
  _vatEnabled: false,
};

export default function Expenses() {
  const { lang } = useStore();
  const [items, setItems]       = useState([]);
  const [employees, setEmployees] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [search, setSearch]     = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [filterCat, setFilterCat] = useState('ALL');
  const [dialogOpen, setDialogOpen]   = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId]       = useState(null);
  const [editing, setEditing]         = useState(null);
  const [form, setForm]               = useState(empty);
  const [saving, setSaving]           = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [e, em, ac] = await Promise.all([
        base44.entities.Expense.list('-created_date', 200),
        base44.entities.Employee.list(),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setItems(e); setEmployees(em); setAccounts(ac);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const buildDefaultForm = () => ({ ...empty });

  // refs تُمرَّر إلى OperationEngine فقط بالكيانات المطعمية المستخدمة في الحقول.
  // businessEngine._buildExpensePayload يتحمّل غياب projects/equipment/subcontractors
  // برجوعه إلى القيمة المخزّنة في data (فارغة هنا) دون أخطاء.
  const refs = { employees };
  const expenseAccounts = selectExpenseAccounts(accounts);
  const cashAccounts = selectCashAccounts(accounts);

  const filtered = items.filter(i => {
    const match = !search || i.description?.toLowerCase().includes(search.toLowerCase());
    const typeOk = filterType === 'ALL' || (i.expenseType || 'COMPANY') === filterType;
    return match && typeOk && (filterCat === 'ALL' || i.category === filterCat);
  });

  const openNew  = () => { setEditing(null); setForm(buildDefaultForm()); setDialogOpen(true); };
  const openEdit = (item) => {
    if (item.isPosted || item.status === 'CANCELLED')
      return toast.error(t('لا يمكن تعديل مصروف مرّحل — استخدم العكس', 'Cannot edit a posted expense — use reverse', lang));
    setEditing(item);
    setForm({ ...empty, ...item, _vatEnabled: (item.vatAmount || 0) > 0 });
    setDialogOpen(true);
  };
  const askDelete = (item) => {
    if (item.isPosted || item.status === 'CANCELLED')
      return toast.error(t('لا يمكن حذف مصروف مرّحل — استخدم العكس', 'Cannot delete a posted expense — use reverse', lang));
    setDeleteId(item.id); setConfirmOpen(true);
  };

  const [reversingId, setReversingId] = useState(null);
  const reverse = async (item) => {
    setReversingId(item.id);
    try {
      const allJE = await base44.entities.JournalEntry.filter({ isPosted: true });
      const jes = allJE.filter(je => je.sourceType === 'Expense' && (je.description || '').includes(item.description || '') && (je.description || '').includes(item.code || ''));
      if (jes.length === 0) throw new Error(t('لا يوجد قيد مرتبط', 'No linked entry', lang));
      const orig = jes[0];
      const revLines = (orig.lines || []).map(l => ({ ...l, debit: l.credit || 0, credit: l.debit || 0 }));
      await base44.entities.JournalEntry.create({
        entryNo: `${orig.entryNo}-REV-1`,
        date: new Date().toISOString().slice(0, 10),
        description: `عكس ${orig.entryNo} — مصروف ${item.code}`,
        lines: revLines, totalDebit: orig.totalCredit, totalCredit: orig.totalDebit,
        isPosted: true, sourceType: 'REVERSAL',
      });
      await base44.entities.Expense.update(item.id, { status: 'CANCELLED' });
      toast.success(t('تم عكس المصروف وإنشاء قيد عكسي', 'Expense reversed & reversal entry created', lang));
      load();
    } catch (e) { toast.error(e?.message || t('فشل العكس', 'Reversal failed', lang)); }
    setReversingId(null);
  };

  const save = async () => {
    const missing = requiredFields(form, [
      { key: 'description', label: t('الوصف', 'Description', lang) },
      { key: 'amount', label: t('المبلغ', 'Amount', lang) },
      { key: 'date', label: t('التاريخ', 'Date', lang) },
    ]);
    if (missing.length) return toast.error(missingFieldsMessage(missing, lang));
    setSaving(true);
    try {
      const data = { ...form, _vatEnabled: form._vatEnabled };
      if (editing) {
        await OperationEngine.updateExpense(editing.id, data, refs);
        toast.success(t('تم التحديث', 'Updated', lang));
      } else {
        await OperationEngine.createExpense(data, refs);
        toast.success(t('تمت الإضافة + تم إنشاء القيد المحاسبي', 'Added + Journal Entry created', lang));
      }
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const allJE = await base44.entities.JournalEntry.filter({ isPosted: true });
      const checks = allJE.filter(je => je.sourceType === 'Expense' && (je.description || '').includes(item?.description || ''));
      if (checks.length > 0) {
        toast.error(t('لا يمكن حذف مصروف مرّحل — استخدم العكس', 'Cannot delete a posted expense — use reverse', lang));
        return;
      }
      await base44.entities.Expense.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  const totalExpenses = filtered.reduce((s, i) => s + (i.totalAmount || 0), 0);

  const exportColumns = [
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => { const ty = getRestaurantExpenseType(r.expenseType || 'COMPANY'); return lang === 'ar' ? ty.ar : ty.en; } },
    { header: { ar: 'الفئة', en: 'Category' }, value: (r) => { const c = EXPENSE_CATEGORIES.find(x => x.key === r.category); return c ? (lang === 'ar' ? c.ar : c.en) : r.category; } },
    { header: { ar: 'الوصف', en: 'Description' }, value: (r) => r.description },
    { header: { ar: 'مرتبط بـ', en: 'Linked to' }, value: (r) => r.employeeName || r.govEntity || '' },
    { header: { ar: 'المبلغ', en: 'Amount' }, value: (r) => r.amount || 0 },
    { header: { ar: 'الضريبة', en: 'VAT' }, value: (r) => r.vatAmount || 0 },
    { header: { ar: 'الإجمالي', en: 'Total' }, value: (r) => r.totalAmount || 0 },
  ];

  return (
    <ModuleLayout
      title={t('المصروفات', 'Expenses', lang)}
      subtitle={t('تسجيل ومتابعة مصروفات المطعم', 'Track restaurant expenses', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'المصروفات', en: 'Expenses' }} />
          <Button onClick={openNew} className="gap-2 bg-rose-600 hover:bg-rose-700"><Plus className="size-4" />{t('مصروف جديد', 'New Expense', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الأنواع', 'All Types', lang)}</SelectItem>
            {RESTAURANT_EXPENSE_TYPES.map(ty => <SelectItem key={ty.key} value={ty.key}>{lang === 'ar' ? ty.ar : ty.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الفئات', 'All Categories', lang)}</SelectItem>
            {EXPENSE_CATEGORIES.map(c => <SelectItem key={c.key} value={c.key}>{lang === 'ar' ? c.ar : c.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الفئة', 'Category', lang)}</TableHead>
                <TableHead>{t('الوصف', 'Description', lang)}</TableHead>
                <TableHead>{t('مرتبط بـ', 'Linked to', lang)}</TableHead>
                <TableHead>{t('المبلغ', 'Amount', lang)}</TableHead>
                <TableHead>{t('الضريبة', 'VAT', lang)}</TableHead>
                <TableHead>{t('الإجمالي', 'Total', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading
                ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0
                  ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد مصروفات', 'No expenses', lang)}</TableCell></TableRow>
                  : filtered.map(item => {
                    const cat = EXPENSE_CATEGORIES.find(c => c.key === item.category);
                    const ty = getRestaurantExpenseType(item.expenseType || 'COMPANY');
                    const linked = item.employeeName || item.govEntity || '—';
                    return (
                      <TableRow key={item.id} className="hover:bg-muted/30">
                        <TableCell className="text-xs">{formatDate(item.date, lang)}</TableCell>
                        <TableCell><span className={`text-xs rounded-full border px-2 py-0.5 ${ty.color}`}>{lang === 'ar' ? ty.ar : ty.en}</span></TableCell>
                        <TableCell><span className="text-xs bg-amber-50 text-amber-700 border border-amber-200 rounded-full px-2 py-0.5">{cat ? (lang === 'ar' ? cat.ar : cat.en) : item.category}</span></TableCell>
                        <TableCell className="font-medium">{item.description}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{linked}</TableCell>
                        <TableCell>{formatCurrency(item.amount, lang)}</TableCell>
                        <TableCell className="text-sm">{item.vatAmount ? formatCurrency(item.vatAmount, lang) : '—'}</TableCell>
                        <TableCell className="font-medium">{formatCurrency(item.totalAmount, lang)}</TableCell>
                        <TableCell>
                          <div className="flex gap-1">
                            {(item.isPosted || !item.status || item.status === 'APPROVED') && item.status !== 'CANCELLED' && (
                              <Button variant="ghost" size="icon" className="size-8 text-amber-600" title={t('عكس', 'Reverse', lang)} disabled={reversingId === item.id} onClick={() => reverse(item)}><RotateCcw className="size-3.5" /></Button>
                            )}
                            {item.status === 'CANCELLED' && (
                              <span className="text-xs text-rose-600 font-medium px-2">{t('ملغي', 'Cancelled', lang)}</span>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">{filtered.length} {t('مصروف', 'expenses', lang)} | {t('الإجمالي', 'Total', lang)}: <strong>{formatCurrency(totalExpenses, lang)}</strong></p>

      <ExpenseDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        lang={lang}
        editing={editing}
        form={form}
        setForm={setForm}
        saving={saving}
        onSave={save}
        employees={employees}
        expenseAccounts={expenseAccounts}
        cashAccounts={cashAccounts}
      />

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف المصروف', 'Delete Expense', lang)}
        description={t('سيتم حذف المصروف نهائياً.', 'This expense will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />
    </ModuleLayout>
  );
}