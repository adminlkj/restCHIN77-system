import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const MONTHS_AR = { 1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر' };
const MONTHS_EN = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December' };
const money = (n) => `${formatNumber(n)}\u00A0${RIYAL_SYMBOL}`;

// مستند مسيّر رواتب: يعرض بنود الموظفين المختارين (إن وُجدت) + ملخص المجاميع.
export default function PayrollRunDocument({ run, settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#7c3aed';
  const period = `${lang === 'ar' ? MONTHS_AR[run.month] : MONTHS_EN[run.month]} ${run.year}`;
  const lines = Array.isArray(run.employeeLines) ? run.employeeLines : [];
  const isRTL = lang === 'ar';

  const th = { padding: '8px 10px', fontSize: 11, fontWeight: 700, color: '#fff', backgroundColor: primary, textAlign: isRTL ? 'right' : 'left', whiteSpace: 'nowrap' };
  const thCenter = { ...th, textAlign: 'center' };
  const td = { padding: '7px 10px', fontSize: 12, borderBottom: '1px solid #e5e7eb' };
  const tdCenter = { ...td, textAlign: 'center' };

  return (
    <div ref={innerRef} style={{ direction: isRTL ? 'rtl' : 'ltr', color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('مسيّر رواتب', 'Payroll Run', lang)} docNo={run.code} subtitle={period} />

      {/* تفاصيل الموظفين المختارين */}
      {lines.length > 0 ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', borderRadius: 8, overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.08)', marginBottom: 14 }}>
          <thead>
            <tr>
              <th style={thCenter}>#</th>
              <th style={th}>{t('الكود', 'Code', lang)}</th>
              <th style={th}>{t('الموظف', 'Employee', lang)}</th>
              <th style={thCenter}>{t('الراتب', 'Salary', lang)}</th>
              <th style={thCenter}>{t('البدلات', 'Allow.', lang)}</th>
              <th style={thCenter}>{t('الخصم', 'Deduct.', lang)}</th>
              <th style={thCenter}>{t('الصافي', 'Net', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={l.employeeId} style={{ background: i % 2 === 0 ? '#fff' : '#f9fafb' }}>
                <td style={{ ...tdCenter, color: '#9ca3af' }}>{i + 1}</td>
                <td style={{ ...td, fontFamily: 'monospace', color: '#6b7280' }}>{l.code}</td>
                <td style={{ ...td, fontWeight: 600 }}>{l.name}{l.department ? ` · ${l.department}` : ''}</td>
                <td style={tdCenter}>{money(l.salary || 0)}</td>
                <td style={{ ...tdCenter, color: '#059669' }}>+{money(l.allowances || 0)}</td>
                <td style={{ ...tdCenter, color: '#dc2626' }}>-{money(l.deductions || 0)}</td>
                <td style={{ ...tdCenter, fontWeight: 800, color: primary }}>{money(l.net || 0)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: '#f3f4f6', fontWeight: 800, borderTop: `2px solid ${primary}` }}>
              <td style={{ ...tdCenter, borderBottom: 'none' }} colSpan={3}>{t('الإجمالي', 'Total', lang)} — {lines.length} {t('موظف', 'employees', lang)}</td>
              <td style={{ ...tdCenter, borderBottom: 'none' }}>{money(run.totalSalaries)}</td>
              <td style={{ ...tdCenter, borderBottom: 'none', color: '#059669' }}>{money(run.totalAllowances)}</td>
              <td style={{ ...tdCenter, borderBottom: 'none', color: '#dc2626' }}>{money(run.totalDeductions)}</td>
              <td style={{ ...tdCenter, borderBottom: 'none', color: primary, fontSize: 13 }}>{money(run.netAmount)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        // للمسيرات القديمة التي لم تخزّن بنوداً — ملخص فقط.
        <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 14 }}>
          <tbody>
            <tr>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{t('إجمالي الرواتب', 'Total Salaries', lang)}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', textAlign: isRTL ? 'left' : 'right', fontWeight: 600 }}>{money(run.totalSalaries)}</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{t('إجمالي البدلات', 'Total Allowances', lang)}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', textAlign: isRTL ? 'left' : 'right', fontWeight: 600, color: '#059669' }}>{money(run.totalAllowances)}</td>
            </tr>
            <tr>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{t('إجمالي الخصومات', 'Total Deductions', lang)}</td>
              <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', textAlign: isRTL ? 'left' : 'right', fontWeight: 600, color: '#dc2626' }}>{money(run.totalDeductions)}</td>
            </tr>
            <tr style={{ background: '#f9fafb' }}>
              <td style={{ padding: '13px 12px', fontSize: 15, fontWeight: 700 }}>{t('صافي المسيّر', 'Net Total', lang)}</td>
              <td style={{ padding: '13px 12px', fontSize: 16, fontWeight: 800, textAlign: isRTL ? 'left' : 'right', color: primary }}>{money(run.netAmount)}</td>
            </tr>
          </tbody>
        </table>
      )}

      {run.notes && <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: {run.notes}</div>}
      <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>{t('تاريخ الطباعة', 'Print date', lang)}: {formatDate(new Date().toISOString(), lang)}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('إعداد', 'Prepared by', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('مراجعة', 'Reviewed by', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('اعتماد', 'Approved by', lang)}</div></div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}
