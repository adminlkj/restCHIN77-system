import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const MONTHS_AR = { 1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر' };
const MONTHS_EN = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December' };

const money = (n) => `${formatNumber(n)}\u00A0${RIYAL_SYMBOL}`;

// حساب صافي راتب موظف واحد
export function empNet(e) {
  const salary = e.salary || 0;
  const allowances = e.allowances || 0;
  const deductions = e.deductions || 0;
  return salary + allowances - deductions;
}

// رأس المستند: يستخدم الترويسة الموحّدة مع سطر الفترة وتاريخ الطباعة
function DocHeader({ settings, lang, title, subtitle }) {
  return (
    <DocumentHeader
      settings={settings}
      lang={lang}
      title={title}
      subtitle={`${subtitle} — ${t('تاريخ الطباعة', 'Print date', lang)}: ${formatDate(new Date().toISOString(), lang)}`}
    />
  );
}

// كشف جماعي: جدول الموظفين مع الإجماليات
function GroupSheet({ employees, settings, lang, primary, period }) {
  const totals = employees.reduce((acc, e) => ({
    salary: acc.salary + (e.salary || 0),
    allowances: acc.allowances + (e.allowances || 0),
    deductions: acc.deductions + (e.deductions || 0),
    net: acc.net + empNet(e),
  }), { salary: 0, allowances: 0, deductions: 0, net: 0 });

  const th = { padding: '8px 6px', textAlign: lang === 'ar' ? 'right' : 'left', fontSize: 12, borderBottom: `2px solid ${primary}` };
  const td = { padding: '7px 6px', fontSize: 12, borderBottom: '1px solid #e5e7eb' };

  return (
    <>
      <DocHeader settings={settings} lang={lang}
        title={t('كشف رواتب جماعي', 'Group Payroll Sheet', lang)} subtitle={period} />
      <table>
        <thead>
          <tr style={{ background: '#f9fafb' }}>
            <th style={th}>#</th>
            <th style={th}>{t('الكود', 'Code', lang)}</th>
            <th style={th}>{t('الموظف', 'Employee', lang)}</th>
            <th style={th}>{t('المسمى', 'Position', lang)}</th>
            <th style={{ ...th, textAlign: 'center' }}>{t('الراتب', 'Salary', lang)}</th>
            <th style={{ ...th, textAlign: 'center' }}>{t('البدلات', 'Allowances', lang)}</th>
            <th style={{ ...th, textAlign: 'center' }}>{t('الخصومات', 'Deductions', lang)}</th>
            <th style={{ ...th, textAlign: 'center' }}>{t('الصافي', 'Net', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e, i) => (
            <tr key={e.id}>
              <td style={td}>{i + 1}</td>
              <td style={{ ...td, fontFamily: 'monospace' }}>{e.code}</td>
              <td style={{ ...td, fontWeight: 600 }}>{lang === 'ar' ? (e.nameAr || e.name) : e.name}</td>
              <td style={td}>{e.position || '—'}</td>
              <td style={{ ...td, textAlign: 'center' }}>{money(e.salary || 0)}</td>
              <td style={{ ...td, textAlign: 'center', color: '#059669' }}>{money(e.allowances || 0)}</td>
              <td style={{ ...td, textAlign: 'center', color: '#dc2626' }}>{money(e.deductions || 0)}</td>
              <td style={{ ...td, textAlign: 'center', fontWeight: 700 }}>{money(empNet(e))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f3f4f6', fontWeight: 700 }}>
            <td style={{ ...td, borderBottom: 'none' }} colSpan={4}>{t('الإجمالي', 'Total', lang)} — {employees.length} {t('موظف', 'employees', lang)}</td>
            <td style={{ ...td, borderBottom: 'none', textAlign: 'center' }}>{money(totals.salary)}</td>
            <td style={{ ...td, borderBottom: 'none', textAlign: 'center' }}>{money(totals.allowances)}</td>
            <td style={{ ...td, borderBottom: 'none', textAlign: 'center' }}>{money(totals.deductions)}</td>
            <td style={{ ...td, borderBottom: 'none', textAlign: 'center', color: primary }}>{money(totals.net)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('إعداد', 'Prepared by', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('مراجعة', 'Reviewed by', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('اعتماد', 'Approved by', lang)}</div>
        </div>
      </div>
    </>
  );
}

// كشف فردي (بطاقة راتب موظف)
function Payslip({ employee: e, settings, lang, primary, period }) {
  const row = (label, value, color) => (
    <tr>
      <td style={{ padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{label}</td>
      <td style={{ padding: '9px 10px', fontSize: 13, borderBottom: '1px solid #e5e7eb', textAlign: lang === 'ar' ? 'left' : 'right', fontWeight: 600, color: color || '#111827' }}>{value}</td>
    </tr>
  );
  return (
    <>
      <DocHeader settings={settings} lang={lang}
        title={t('بطاقة راتب', 'Payslip', lang)} subtitle={period} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
        <div><span style={{ color: '#6b7280' }}>{t('الموظف', 'Employee', lang)}: </span><b>{lang === 'ar' ? (e.nameAr || e.name) : e.name}</b></div>
        <div><span style={{ color: '#6b7280' }}>{t('الكود', 'Code', lang)}: </span><b>{e.code}</b></div>
        <div><span style={{ color: '#6b7280' }}>{t('المسمى', 'Position', lang)}: </span>{e.position || '—'}</div>
        <div><span style={{ color: '#6b7280' }}>{t('القسم', 'Department', lang)}: </span>{e.department || '—'}</div>
        {e.nationalId && <div><span style={{ color: '#6b7280' }}>{t('الهوية', 'National ID', lang)}: </span>{e.nationalId}</div>}
        {e.iban && <div><span style={{ color: '#6b7280' }}>IBAN: </span>{e.iban}</div>}
      </div>

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <tbody>
          {row(t('الراتب الأساسي', 'Basic Salary', lang), money(e.salary || 0))}
          {row(t('البدلات', 'Allowances', lang), money(e.allowances || 0), '#059669')}
          {row(t('الخصومات', 'Deductions', lang), money(e.deductions || 0), '#dc2626')}
          <tr style={{ background: '#f9fafb' }}>
            <td style={{ padding: '12px 10px', fontSize: 15, fontWeight: 700 }}>{t('صافي الراتب', 'Net Pay', lang)}</td>
            <td style={{ padding: '12px 10px', fontSize: 16, fontWeight: 800, textAlign: lang === 'ar' ? 'left' : 'right', color: primary }}>{money(empNet(e))}</td>
          </tr>
        </tbody>
      </table>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('توقيع الموظف', 'Employee signature', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('توقيع المسؤول', 'Authorized signature', lang)}</div>
        </div>
      </div>
    </>
  );
}

// المستند الرئيسي — يعرض إما كشفاً جماعياً أو بطاقات فردية (واحدة أو عدة صفحات).
export default function PayrollDocument({ mode, employees, settings, lang, month, year, innerRef }) {
  const primary = settings.primaryColor || '#7c3aed';
  const period = `${lang === 'ar' ? MONTHS_AR[month] : MONTHS_EN[month]} ${year}`;

  return (
    <div ref={innerRef} style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', color: '#111827' }}>
      {mode === 'individual'
        ? employees.map((e, i) => (
            <div key={e.id} className={i < employees.length - 1 ? 'page-break' : ''} style={{ marginBottom: i < employees.length - 1 ? 40 : 0 }}>
              <Payslip employee={e} settings={settings} lang={lang} primary={primary} period={period} />
            </div>
          ))
        : <GroupSheet employees={employees} settings={settings} lang={lang} primary={primary} period={period} />}
      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}