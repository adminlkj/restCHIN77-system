import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const MONTHS_AR = { 1: 'يناير', 2: 'فبراير', 3: 'مارس', 4: 'أبريل', 5: 'مايو', 6: 'يونيو', 7: 'يوليو', 8: 'أغسطس', 9: 'سبتمبر', 10: 'أكتوبر', 11: 'نوفمبر', 12: 'ديسمبر' };
const MONTHS_EN = { 1: 'January', 2: 'February', 3: 'March', 4: 'April', 5: 'May', 6: 'June', 7: 'July', 8: 'August', 9: 'September', 10: 'October', 11: 'November', 12: 'December' };
const money = (n) => `${formatNumber(n)}\u00A0${RIYAL_SYMBOL}`;

// مستند ملخّص مسيّر رواتب (إجماليات الشهر) للطباعة/التصدير.
export default function PayrollRunDocument({ run, settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#7c3aed';
  const period = `${lang === 'ar' ? MONTHS_AR[run.month] : MONTHS_EN[run.month]} ${run.year}`;

  const row = (label, value, color) => (
    <tr>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', textAlign: lang === 'ar' ? 'left' : 'right', fontWeight: 600, color: color || '#111827' }}>{value}</td>
    </tr>
  );

  return (
    <div ref={innerRef} style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('مسيّر رواتب', 'Payroll Run', lang)} docNo={run.code} subtitle={period} />

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
        <tbody>
          {row(t('إجمالي الرواتب', 'Total Salaries', lang), money(run.totalSalaries))}
          {row(t('إجمالي البدلات', 'Total Allowances', lang), money(run.totalAllowances), '#059669')}
          {row(t('إجمالي الخصومات', 'Total Deductions', lang), money(run.totalDeductions), '#dc2626')}
          <tr style={{ background: '#f9fafb' }}>
            <td style={{ padding: '13px 12px', fontSize: 15, fontWeight: 700 }}>{t('صافي المسيّر', 'Net Total', lang)}</td>
            <td style={{ padding: '13px 12px', fontSize: 16, fontWeight: 800, textAlign: lang === 'ar' ? 'left' : 'right', color: primary }}>{money(run.netAmount)}</td>
          </tr>
        </tbody>
      </table>

      {run.notes && <div style={{ marginTop: 14, fontSize: 12, color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: {run.notes}</div>}

      <div style={{ marginTop: 8, fontSize: 11, color: '#9ca3af' }}>{t('تاريخ الطباعة', 'Print date', lang)}: {formatDate(new Date().toISOString(), lang)}</div>

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('إعداد', 'Prepared by', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('مراجعة', 'Reviewed by', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 160 }}>{t('اعتماد', 'Approved by', lang)}</div></div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}