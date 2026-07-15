import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const money = (n) => `${formatNumber(n || 0)}\u00A0${RIYAL_SYMBOL}`;

export default function ContractDocument({ contract, settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#0f766e';
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';

  const infoRow = (label, value) => (
    <tr>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280', width: '38%' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{value || '—'}</td>
    </tr>
  );

  return (
    <div ref={innerRef} style={{ direction: dir, color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('عقد مشروع', 'Project Contract', lang)} docNo={contract.contractNo} />

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20, width: '100%' }}>
        <tbody>
          {infoRow(t('المشروع', 'Project', lang), contract.projectName)}
          {infoRow(t('العميل', 'Client', lang), contract.clientName)}
          {infoRow(t('تاريخ البدء', 'Start Date', lang), formatDate(contract.startDate, lang))}
          {infoRow(t('تاريخ الانتهاء', 'End Date', lang), formatDate(contract.endDate, lang))}
          {contract.status && infoRow(t('الحالة', 'Status', lang), contract.status)}
        </tbody>
      </table>

      <div style={{ background: '#f9fafb', border: `1px solid ${primary}`, borderRadius: 8, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('القيمة الإجمالية للعقد', 'Total Contract Value', lang)}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: primary }}>{money(contract.totalValue)}</span>
      </div>

      {contract.description && (
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 20, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: '#6b7280' }}>{t('الوصف', 'Description', lang)}</div>
          {contract.description}
        </div>
      )}

      {contract.notes && (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 20 }}>
          <span style={{ color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: </span>{contract.notes}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('ممثل الشركة', 'Company Representative', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('ممثل العميل', 'Client Representative', lang)}</div>
        </div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}
