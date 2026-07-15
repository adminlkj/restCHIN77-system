import React from 'react';
import { Card } from '@/components/ui/card';
import { Wallet, CalendarCheck, HandCoins, Package } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';

const STATUSES = {
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  ON_LEAVE: { ar: 'إجازة', en: 'On Leave', color: 'bg-amber-100 text-amber-700' },
  TERMINATED: { ar: 'منتهي', en: 'Terminated', color: 'bg-rose-100 text-rose-700' },
};

function Stat({ label, value, Icon, tone }) {
  const tones = {
    violet: 'bg-violet-50 text-violet-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    indigo: 'bg-indigo-50 text-indigo-700',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg flex items-center justify-center ${tones[tone] || tones.violet}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold text-foreground truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value || '—'}</div>
    </div>
  );
}

export default function EmployeeOverview({ employee, openAdvances, attendanceDays, custodyCount }) {
  const { lang } = useStore();
  const st = STATUSES[employee.status] || STATUSES.ACTIVE;
  const totalPay = (employee.salary || 0) + (employee.allowances || 0);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t('إجمالي الراتب', 'Total Pay', lang)} value={formatCurrency(totalPay, lang)} Icon={Wallet} tone="violet" />
        <Stat label={t('سلف مفتوحة', 'Open Advances', lang)} value={formatCurrency(openAdvances, lang)} Icon={HandCoins} tone="amber" />
        <Stat label={t('أيام الحضور', 'Attendance Days', lang)} value={attendanceDays} Icon={CalendarCheck} tone="emerald" />
        <Stat label={t('العهد', 'Custody Items', lang)} value={custodyCount} Icon={Package} tone="indigo" />
      </div>

      <Card className="p-5">
        <h3 className="text-sm font-bold text-foreground mb-4">{t('البيانات الشخصية', 'Personal Data', lang)}</h3>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <Field label={t('الكود', 'Code', lang)} value={employee.code} />
          <Field label={t('الاسم', 'Name', lang)} value={employee.name} />
          <Field label={t('المنصب', 'Position', lang)} value={employee.position} />
          <Field label={t('القسم', 'Department', lang)} value={employee.department} />
          <Field label={t('الجنسية', 'Nationality', lang)} value={employee.nationality} />
          <Field label={t('رقم الهوية', 'National ID', lang)} value={employee.nationalId} />
          <Field label={t('الهاتف', 'Phone', lang)} value={employee.phone} />
          <Field label={t('البريد', 'Email', lang)} value={employee.email} />
          <Field label={t('تاريخ التعيين', 'Hire Date', lang)} value={formatDate(employee.hireDate, lang)} />
          <Field label={t('الراتب الأساسي', 'Basic Salary', lang)} value={formatCurrency(employee.salary, lang)} />
          <Field label={t('البدلات', 'Allowances', lang)} value={formatCurrency(employee.allowances, lang)} />
          <Field
            label={t('الحالة', 'Status', lang)}
            value={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>}
          />
        </div>
        {employee.notes && (
          <div className="mt-4 pt-4 border-t border-border">
            <div className="text-xs text-muted-foreground mb-1">{t('ملاحظات', 'Notes', lang)}</div>
            <p className="text-sm text-foreground">{employee.notes}</p>
          </div>
        )}
      </Card>
    </div>
  );
}