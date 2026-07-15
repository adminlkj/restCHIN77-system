import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const MONTHS_AR = { 1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر' };
const MONTHS_EN = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December' };

const money = (n) => `${formatNumber(n)}\u00A0${RIYAL_SYMBOL}`;

// رأس المستند الموحّد
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

// حساب صافي راتب موظف واحد
export function empNet(e) {
  const salary = e.salary || 0;
  const allowances = e.allowances || 0;
  const deductions = e.deductions || 0;
  return salary + allowances - deductions;
}

// ─── كشف جماعي: جدول احترافي ببطاقة ملخص ────────────────────────────
function GroupSheet({ employees, settings, lang, primary, period }) {
  const totals = employees.reduce((acc, e) => ({
    salary: acc.salary + (e.salary || 0),
    allowances: acc.allowances + (e.allowances || 0),
    deductions: acc.deductions + (e.deductions || 0),
    net: acc.net + empNet(e),
  }), { salary: 0, allowances: 0, deductions: 0, net: 0 });

  const isRTL = lang === 'ar';
  const th = {
    padding: '10px 8px', fontSize: 11, fontWeight: 700, color: '#fff',
    backgroundColor: primary, textAlign: isRTL ? 'right' : 'left',
    whiteSpace: 'nowrap',
  };
  const thCenter = { ...th, textAlign: 'center' };
  const td = { padding: '9px 8px', fontSize: 12, borderBottom: '1px solid #e5e7eb' };
  const tdCenter = { ...td, textAlign: 'center' };
  const tdBold = { ...td, fontWeight: 700 };

  return (
    <>
      <DocHeader settings={settings} lang={lang}
        title={t('كشف رواتب جماعي', 'Group Payroll Sheet', lang)} subtitle={period} />

      {/* بطاقة ملخص سريع */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 140px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#15803d', marginBottom: 4 }}>{t('الراتب الأساسي', 'Basic Salary', lang)}</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#166534' }}>{money(totals.salary)}</p>
        </div>
        <div style={{ flex: '1 1 140px', background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#1d4ed8', marginBottom: 4 }}>{t('البدلات', 'Allowances', lang)}</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#1e40af' }}>{money(totals.allowances)}</p>
        </div>
        <div style={{ flex: '1 1 140px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: '#dc2626', marginBottom: 4 }}>{t('الخصومات', 'Deductions', lang)}</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: '#991b1b' }}>{money(totals.deductions)}</p>
        </div>
        <div style={{ flex: '1 1 140px', background: primary + '11', border: `1px solid ${primary}44`, borderRadius: 10, padding: '12px 16px', textAlign: 'center' }}>
          <p style={{ fontSize: 11, color: primary, marginBottom: 4 }}>{t('صافي الإجمالي', 'Total Net', lang)}</p>
          <p style={{ fontSize: 18, fontWeight: 800, color: primary }}>{money(totals.net)}</p>
        </div>
      </div>

      {/* جدول الموظفين */}
      <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}>
        <thead>
          <tr>
            <th style={thCenter}>#</th>
            <th style={th}>{t('الكود', 'Code', lang)}</th>
            <th style={th}>{t('الموظف', 'Employee', lang)}</th>
            <th style={th}>{t('المسمى', 'Position', lang)}</th>
            <th style={th}>{t('القسم', 'Dept', lang)}</th>
            <th style={thCenter}>{t('الراتب', 'Salary', lang)}</th>
            <th style={thCenter}>{t('البدلات', 'Allow.', lang)}</th>
            <th style={thCenter}>{t('الخصم', 'Deduct.', lang)}</th>
            <th style={thCenter}>{t('الصافي', 'Net', lang)}</th>
          </tr>
        </thead>
        <tbody>
          {employees.map((e, i) => (
            <tr key={e.id} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
              <td style={{ ...tdCenter, color: '#9ca3af' }}>{i + 1}</td>
              <td style={{ ...td, fontFamily: 'monospace', color: '#6b7280' }}>{e.code}</td>
              <td style={tdBold}>{isRTL ? (e.nameAr || e.name) : e.name}</td>
              <td style={{ ...td, color: '#6b7280' }}>{e.position || '—'}</td>
              <td style={{ ...td, color: '#6b7280' }}>{e.department || '—'}</td>
              <td style={tdCenter}>{money(e.salary || 0)}</td>
              <td style={{ ...tdCenter, color: '#059669' }}>+{money(e.allowances || 0)}</td>
              <td style={{ ...tdCenter, color: '#dc2626' }}>-{money(e.deductions || 0)}</td>
              <td style={{ ...tdCenter, fontWeight: 800, color: primary }}>{money(empNet(e))}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr style={{ background: '#f3f4f6', fontWeight: 800, borderTop: `2px solid ${primary}` }}>
            <td style={{ ...tdCenter, borderBottom: 'none' }} colSpan={5}>
              {t('الإجمالي', 'Total', lang)} — {employees.length} {t('موظف', 'employees', lang)}
            </td>
            <td style={{ ...tdCenter, borderBottom: 'none' }}>{money(totals.salary)}</td>
            <td style={{ ...tdCenter, borderBottom: 'none', color: '#059669' }}>{money(totals.allowances)}</td>
            <td style={{ ...tdCenter, borderBottom: 'none', color: '#dc2626' }}>{money(totals.deductions)}</td>
            <td style={{ ...tdCenter, borderBottom: 'none', color: primary, fontSize: 14 }}>{money(totals.net)}</td>
          </tr>
        </tfoot>
      </table>

      {/* توقيعات */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 56, fontSize: 12, color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1.5px solid #9ca3af', paddingTop: 6, width: 180 }}>{t('إعداد', 'Prepared by', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1.5px solid #9ca3af', paddingTop: 6, width: 180 }}>{t('مراجعة', 'Reviewed by', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1.5px solid #9ca3af', paddingTop: 6, width: 180 }}>{t('اعتماد', 'Approved by', lang)}</div>
        </div>
      </div>
    </>
  );
}

// ─── كشف فردي (بطاقة راتب احترافية) ──────────────────────────────────
function Payslip({ employee: e, settings, lang, primary, period }) {
  const isRTL = lang === 'ar';
  const net = empNet(e);

  return (
    <>
      <DocHeader settings={settings} lang={lang}
        title={t('بطاقة راتب', 'Payslip', lang)} subtitle={period} />

      {/* بطاقة معلومات الموظف */}
      <div style={{ background: '#f9fafb', border: `1px solid ${primary}22`, borderRadius: 12, padding: '16px 20px', marginBottom: 20, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* صورة/أحرف أولى */}
          <div style={{ width: 52, height: 52, borderRadius: 12, background: primary + '18', color: primary, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 18, flexShrink: 0 }}>
            {(isRTL ? (e.nameAr || e.name) : e.name)?.slice(0, 2).toUpperCase()}
          </div>
          <div>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111827' }}>{isRTL ? (e.nameAr || e.name) : e.name}</p>
            <p style={{ fontSize: 12, color: '#6b7280' }}>{e.position || '—'} {e.department ? ` • ${e.department}` : ''}</p>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12, color: '#6b7280', alignContent: 'center' }}>
          <div><span style={{ color: '#9ca3af' }}>{t('الكود', 'Code', lang)}: </span><b style={{ color: '#374151' }}>{e.code}</b></div>
          {e.nationalId && <div><span style={{ color: '#9ca3af' }}>{t('الهوية', 'ID', lang)}: </span><b style={{ color: '#374151' }}>{e.nationalId}</b></div>}
          {e.iban && <div><span style={{ color: '#9ca3af' }}>IBAN: </span><b style={{ color: '#374151' }}>{e.iban}</b></div>}
          {e.bankAccount && <div><span style={{ color: '#9ca3af' }}>{t('الحساب', 'Account', lang)}: </span><b style={{ color: '#374151' }}>{e.bankAccount}</b></div>}
        </div>
      </div>

      {/* جدول الراتب بأقسام ملونة */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
        {/* المستحقات */}
        <div style={{ border: '1px solid #bbf7d0', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#f0fdf4', padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#15803d', borderBottom: '1px solid #bbf7d0' }}>
            {t('المستحقات', 'Earnings', lang)}
          </div>
          <div style={{ padding: '4px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f0fdf4', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{t('الراتب الأساسي', 'Basic Salary', lang)}</span>
              <span style={{ fontWeight: 600 }}>{money(e.salary || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{t('البدلات', 'Allowances', lang)}</span>
              <span style={{ fontWeight: 600, color: '#059669' }}>+{money(e.allowances || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #bbf7d0', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: '#15803d' }}>{t('إجمالي المستحقات', 'Total Earnings', lang)}</span>
              <span style={{ color: '#15803d' }}>{money((e.salary || 0) + (e.allowances || 0))}</span>
            </div>
          </div>
        </div>

        {/* الخصومات */}
        <div style={{ border: '1px solid #fecaca', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ background: '#fef2f2', padding: '8px 14px', fontSize: 12, fontWeight: 700, color: '#dc2626', borderBottom: '1px solid #fecaca' }}>
            {t('الخصومات', 'Deductions', lang)}
          </div>
          <div style={{ padding: '4px 14px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #fef2f2', fontSize: 13 }}>
              <span style={{ color: '#6b7280' }}>{t('الخصومات', 'Deductions', lang)}</span>
              <span style={{ fontWeight: 600, color: '#dc2626' }}>-{money(e.deductions || 0)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', fontSize: 12, color: '#9ca3af' }}>
              <span>{t('سلف مستقطعة', 'Advances', lang)}</span>
              <span>—</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderTop: '2px solid #fecaca', fontSize: 13, fontWeight: 700 }}>
              <span style={{ color: '#dc2626' }}>{t('إجمالي الخصومات', 'Total Deductions', lang)}</span>
              <span style={{ color: '#dc2626' }}>{money(e.deductions || 0)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* صافي الراتب — بارز */}
      <div style={{ background: `linear-gradient(135deg, ${primary}08, ${primary}15)`, border: `2px solid ${primary}33`, borderRadius: 12, padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 13, color: '#6b7280', marginBottom: 2 }}>{t('صافي الراتب المستحق', 'Net Payable Salary', lang)}</p>
          <p style={{ fontSize: 11, color: '#9ca3af' }}>{period}</p>
        </div>
        <p style={{ fontSize: 28, fontWeight: 800, color: primary }}>{money(net)}</p>
      </div>

      {/* توقيعات */}
      <div style={{ display: 'flex', justifyContent: 'space-around', marginTop: 56, fontSize: 12, color: '#6b7280' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1.5px solid #9ca3af', paddingTop: 6, width: 180 }}>{t('توقيع الموظف', 'Employee Signature', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1.5px solid #9ca3af', paddingTop: 6, width: 180 }}>{t('توقيع المسؤول', 'Authorized Signature', lang)}</div>
        </div>
      </div>
    </>
  );
}

// المستند الرئيسي
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
