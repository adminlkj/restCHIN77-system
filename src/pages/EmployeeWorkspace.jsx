import React, { useState, useEffect, useCallback } from 'react';
import { LayoutGrid, HandCoins, Package, CalendarCheck, FolderOpen, User } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import EmployeeOverview from '@/components/workspace/EmployeeOverview';
import AdvancesTab from '@/components/workspace/tabs/AdvancesTab';
import CustodyTab from '@/components/workspace/tabs/CustodyTab';
import AttendanceTab from '@/components/workspace/tabs/AttendanceTab';
import EmployeeDocumentsTab from '@/components/workspace/tabs/EmployeeDocumentsTab';

const STATUSES = {
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  ON_LEAVE: { ar: 'إجازة', en: 'On Leave', color: 'bg-amber-100 text-amber-700' },
  TERMINATED: { ar: 'منتهي', en: 'Terminated', color: 'bg-rose-100 text-rose-700' },
};

export default function EmployeeWorkspace() {
  const { lang, activeEmployeeId, setActiveItem } = useStore();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [employee, setEmployee] = useState(null);
  const [openAdvances, setOpenAdvances] = useState(0);
  const [attendanceDays, setAttendanceDays] = useState(0);
  const [custodyCount, setCustodyCount] = useState(0);

  const loadStats = useCallback(async () => {
    if (!activeEmployeeId) return;
    const [adv, att, cus] = await Promise.all([
      base44.entities.EmployeeAdvance.filter({ employeeId: activeEmployeeId }),
      base44.entities.AttendanceRecord.filter({ employeeId: activeEmployeeId }),
      base44.entities.EmployeeCustody.filter({ employeeId: activeEmployeeId }),
    ]);
    setOpenAdvances(adv.filter(a => a.status !== 'SETTLED').reduce((s, a) => s + ((a.amount || 0) - (a.deductedAmount || 0)), 0));
    setAttendanceDays(att.filter(a => a.status === 'PRESENT').length);
    setCustodyCount(cus.filter(c => c.status === 'ASSIGNED').length);
  }, [activeEmployeeId]);

  // حمّل بيانات الموظف فقط عند فتح المركز — بدون loadStats (تُؤجّل للـ overview).
  useEffect(() => {
    if (!activeEmployeeId) { setLoading(false); return; }
    let active = true;
    (async () => {
      setLoading(true);
      try {
        // نستخدم get(id) مباشرة بدل filter({id}) — أدقّ وأسرع، ويتعامل مع
        // حالة "الموظف محذوف لكن activeEmployeeId لا يزال في المتجر" بشكل صحيح
        // (get يرمي 404)، فلا نبقى عالقين في skeleton للأبد.
        const emp = await base44.entities.Employee.get(activeEmployeeId);
        if (!active) return;
        setEmployee(emp || null);
      } catch {
        // موظف غير موجود (محذوف) → اعرض شاشة "غير موجود" بدل skeleton دائم.
        if (active) setEmployee(null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [activeEmployeeId]);

  // حمّل stats فقط عند فتح تبويب "overview" (لا حاجة لها في التبويبات الأخرى).
  // هذا يقلّل 3 طلبات filter غير ضرورية عند فتح تبويبات السلف/العهد/الحضور/الوثائق.
  useEffect(() => {
    if (tab !== 'overview' || !activeEmployeeId) return;
    loadStats();
  }, [tab, activeEmployeeId, loadStats]);

  if (!activeEmployeeId) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <User className="size-14 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold">{t('لم يتم اختيار موظف', 'No employee selected', lang)}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('افتح سجل الموظفين واختر موظفاً لعرض مركز عمله المتكامل.', 'Open the Employees registry and pick an employee to view their integrated workspace.', lang)}
          </p>
          <button onClick={() => setActiveItem('employees')} className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
            {t('الذهاب للموظفين', 'Go to Employees', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-4 md:p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  // انتهى التحميل بلا موظف → إمّا لم يُختر (حُوّل أعلاه) أو الموظف محذوف.
  // اعرض شاشة "غير موجود" مع زر عودة بدل skeleton دائم.
  if (!employee) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <User className="size-14 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold">{t('الموظف غير موجود', 'Employee not found', lang)}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('قد يكون هذا الموظف قد حُذف. اختر موظفاً آخر من سجل الموظفين.', 'This employee may have been deleted. Pick another from the Employees registry.', lang)}
          </p>
          <button onClick={() => setActiveItem('employees')} className="mt-4 px-4 py-2 rounded-lg bg-violet-600 text-white text-sm font-medium hover:bg-violet-700">
            {t('الذهاب للموظفين', 'Go to Employees', lang)}
          </button>
        </div>
      </div>
    );
  }

  const st = STATUSES[employee.status] || STATUSES.ACTIVE;
  const badge = <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>;

  const tabs = [
    { key: 'overview', ar: 'نظرة عامة', en: 'Overview', Icon: LayoutGrid },
    { key: 'advances', ar: 'السلف', en: 'Advances', Icon: HandCoins },
    { key: 'custody', ar: 'العهد', en: 'Custody', Icon: Package },
    { key: 'attendance', ar: 'الحضور', en: 'Attendance', Icon: CalendarCheck },
    { key: 'documents', ar: 'الوثائق', en: 'Documents', Icon: FolderOpen },
  ];

  return (
    <div className="p-4 md:p-6">
      <WorkspaceHeader
        title={employee.name}
        subtitle={t('مركز عمل الموظف', 'Employee Workspace', lang)}
        badge={badge}
        onBack={() => setActiveItem('employees')}
      />
      <WorkspaceTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && (
        <EmployeeOverview employee={employee} openAdvances={openAdvances} attendanceDays={attendanceDays} custodyCount={custodyCount} />
      )}
      {tab === 'advances' && <AdvancesTab employeeId={activeEmployeeId} onChange={loadStats} />}
      {tab === 'custody' && <CustodyTab employeeId={activeEmployeeId} onChange={loadStats} />}
      {tab === 'attendance' && <AttendanceTab employeeId={activeEmployeeId} onChange={loadStats} />}
      {tab === 'documents' && <EmployeeDocumentsTab employeeId={activeEmployeeId} />}
    </div>
  );
}