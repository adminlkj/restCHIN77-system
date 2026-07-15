import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

// سند مالي موحّد (قبض / صرف) — يُستخدم لسندات تحصيل العملاء وسداد الموردين.
// kind: 'RECEIPT' (قبض) | 'PAYMENT' (صرف)

const money = (n) => `${formatNumber(n || 0)}\u00A0${RIYAL_SYMBOL}`;

const METHOD_LABELS = {
  CASH: { ar: 'نقدي', en: 'Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  CHEQUE: { ar: 'شيك', en: 'Cheque' },
  CARD: { ar: 'بطاقة', en: 'Card' },
};

export default function VoucherDocument({ kind, voucher, settings, lang, innerRef }) {
  const primary = settings.primaryColor || (kind === 'RECEIPT' ? '#059669' : '#dc2626');
  const title = kind === 'RECEIPT' ? t('سند قبض', 'Receipt Voucher', lang) : t('سند صرف', 'Payment Voucher', lang);
  const partyLabel = kind === 'RECEIPT' ? t('استلمنا من', 'Received from', lang) : t('صرفنا إلى', 'Paid to', lang);
  const partyName = voucher.clientName || voucher.supplierName || '—';
  const method = METHOD_LABELS[voucher.method] || null;

  const infoRow = (label, value) => (
    <tr>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280', width: '38%' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{value}</td>
    </tr>
  );

  return (
    <div ref={innerRef} style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={title} docNo={voucher.paymentNo} />

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20 }}>
        <tbody>
          {infoRow(t('التاريخ', 'Date', lang), formatDate(voucher.date, lang))}
          {infoRow(partyLabel, partyName)}
          {method && infoRow(t('طريقة الدفع', 'Payment Method', lang), lang === 'ar' ? method.ar : method.en)}
          {voucher.cashAccountName && infoRow(t('الحساب النقدي', 'Cash Account', lang), voucher.cashAccountName)}
          {voucher.reference && infoRow(t('المرجع', 'Reference', lang), voucher.reference)}
          {voucher.projectName && infoRow(t('المشروع', 'Project', lang), voucher.projectName)}
        </tbody>
      </table>

      <div style={{ background: '#f9fafb', border: `1px solid ${primary}`, borderRadius: 8, padding: '16px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('المبلغ', 'Amount', lang)}</span>
        <span style={{ fontSize: 22, fontWeight: 800, color: primary }}>{money(voucher.amount)}</span>
      </div>

      {voucher.notes && (
        <div style={{ fontSize: 12, color: '#374151', marginBottom: 20 }}>
          <span style={{ color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: </span>{voucher.notes}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 56, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{kind === 'RECEIPT' ? t('المستلم', 'Received by', lang) : t('المستلم', 'Recipient', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المحاسب', 'Accountant', lang)}</div>
        </div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('الاعتماد', 'Approved by', lang)}</div>
        </div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}