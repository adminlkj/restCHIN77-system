import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, Users, CalendarCheck, HandCoins, Wallet } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

export default function EmployeeReports() {
  const { lang } = useStore();
  const [employees, setEmployees] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [advances, setAdvances] = useState([]);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [emp, att, adv] = await Promise.all([
        base44.entities.Employee.list('code', 1000),
        base44.entities.AttendanceRecord.list('-date', 3000),
        base44.entities.EmployeeAdvance.list('-date', 2000),
      ]);
      setEmployees(emp || []);
      setAttendance(att || []);
      setAdvances(adv || []);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const inPeriod = (date) => (!from || (date && date >= from)) && (!to || (date && date <= to));

  const rows = useMemo(() => employees.map(emp => {
    const empAttendance = attendance.filter(a => a.employeeId === emp.id && inPeriod(a.date));
    const empAdvances = advances.filter(a => a.employeeId === emp.id && inPeriod(a.date));
    const grossSalary = (Number(emp.salary) || 0) + (Number(emp.allowances) || 0);
    const presentDays = empAttendance.filter(a => a.status === 'PRESENT').length;
    const absentDays = empAttendance.filter(a => a.status === 'ABSENT').length;
    const leaveDays = empAttendance.filter(a => ['LEAVE', 'SICK', 'HOLIDAY'].includes(a.status)).length;
    const openAdvance = empAdvances.reduce((s, a) => s + Math.max((Number(a.amount) || 0) - (Number(a.deductedAmount) || 0), 0), 0);
    return { ...emp, grossSalary, presentDays, absentDays, leaveDays, openAdvance };
  }), [employees, attendance, advances, from, to]);

  const filtered = rows.filter(r => !search || `${r.code} ${r.name} ${r.nameAr || ''} ${r.department || ''} ${r.position || ''}`.toLowerCase().includes(search.toLowerCase()));
  const activeCount = filtered.filter(e => e.status === 'ACTIVE' && e.isActive !== false).length;
  const totalPayroll = filtered.reduce((s, e) => s + e.grossSalary, 0);
  const totalAdvances = filtered.reduce((s, e) => s + e.openAdvance, 0);
  const totalAbsences = filtered.reduce((s, e) => s + e.absentDays, 0);

  const columns = [
    { header: { ar: 'الكود', en: 'Code' }, value: r => r.code },
    { header: { ar: 'الموظف', en: 'Employee' }, value: r => lang === 'ar' ? (r.nameAr || r.name) : r.name },
    { header: { ar: 'القسم', en: 'Department' }, value: r => r.department || '' },
    { header: { ar: 'الحالة', en: 'Status' }, value: r => r.status || '' },
    { header: { ar: 'إجمالي الراتب', en: 'Gross Salary' }, value: r => formatCurrency(r.grossSalary, lang) },
    { header: { ar: 'حضور', en: 'Present' }, value: r => r.presentDays },
    { header: { ar: 'غياب', en: 'Absent' }, value: r => r.absentDays },
    { header: { ar: 'سلف مفتوحة', en: 'Open Advances' }, value: r => formatCurrency(r.openAdvance, lang) },
  ];

  return (
    <ModuleLayout
      title={t('تقارير الموظفين', 'Employee Reports', lang)}
      subtitle={t('ملخص الرواتب والحضور والسلف حسب الفترة', 'Salary, attendance and advance summary by period', lang)}
      actions={<div className="flex gap-2"><TableToolbar columns={columns} rows={filtered} title={{ ar: 'تقارير الموظفين', en: 'Employee Reports' }} /><Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button></div>}
    >
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Stat icon={Users} label={t('الموظفون النشطون', 'Active Employees', lang)} value={activeCount} />
        <Stat icon={Wallet} label={t('إجمالي الرواتب', 'Total Payroll', lang)} value={formatCurrency(totalPayroll, lang)} />
        <Stat icon={HandCoins} label={t('السلف المفتوحة', 'Open Advances', lang)} value={formatCurrency(totalAdvances, lang)} danger />
        <Stat icon={CalendarCheck} label={t('أيام الغياب', 'Absent Days', lang)} value={totalAbsences} danger={totalAbsences > 0} />
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
          <div className="relative">
            <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input className="ps-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالموظف أو القسم...', 'Search employee or department...', lang)} />
          </div>
          <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="md:w-40" /></div>
          <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="md:w-40" /></div>
          <Button variant="outline" onClick={() => { setFrom(''); setTo(''); setSearch(''); }}>{t('مسح', 'Clear', lang)}</Button>
        </div>
      </Card>

      <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('الموظف', 'Employee', lang)}</TableHead><TableHead>{t('القسم / الوظيفة', 'Department / Position', lang)}</TableHead><TableHead>{t('الحالة', 'Status', lang)}</TableHead><TableHead className="text-end">{t('إجمالي الراتب', 'Gross Salary', lang)}</TableHead><TableHead className="text-center">{t('حضور', 'Present', lang)}</TableHead><TableHead className="text-center">{t('غياب', 'Absent', lang)}</TableHead><TableHead className="text-center">{t('إجازات', 'Leaves', lang)}</TableHead><TableHead className="text-end">{t('سلف مفتوحة', 'Open Advances', lang)}</TableHead></TableRow></TableHeader><TableBody>
        {loading ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</TableCell></TableRow> : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="py-10 text-center text-muted-foreground">{t('لا توجد بيانات موظفين', 'No employee data', lang)}</TableCell></TableRow> : filtered.map(r => <TableRow key={r.id}><TableCell><div className="font-medium">{lang === 'ar' ? (r.nameAr || r.name) : r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.code}</div></TableCell><TableCell><div className="text-sm">{r.department || '—'}</div><div className="text-xs text-muted-foreground">{r.position || '—'}</div></TableCell><TableCell><span className="text-xs rounded-full bg-muted px-2 py-1">{r.status}</span></TableCell><TableCell className="text-end font-medium">{formatCurrency(r.grossSalary, lang)}</TableCell><TableCell className="text-center text-emerald-700">{r.presentDays}</TableCell><TableCell className="text-center text-rose-700">{r.absentDays}</TableCell><TableCell className="text-center text-amber-700">{r.leaveDays}</TableCell><TableCell className="text-end font-medium text-amber-700">{formatCurrency(r.openAdvance, lang)}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
    </ModuleLayout>
  );
}

function Stat({ icon: Icon, label, value, danger }) {
  return <Card><CardContent className="p-4"><div className="flex items-center gap-2 text-muted-foreground"><Icon className="size-4" /><p className="text-xs">{label}</p></div><p className={`text-xl font-bold mt-1 ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{value}</p></CardContent></Card>;
}