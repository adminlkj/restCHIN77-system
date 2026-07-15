import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

// سند استلام بضاعة مطبوع — يعرض بيانات السند وبنوده المستلمة.
const money = (n) => `${formatNumber(n || 0)}\u00A0${RIYAL_SYMBOL}`;

export default function GoodsReceiptDocument({ receipt, lines = [], settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#d97706';
  const th = { padding: '8px 6px', textAlign: lang === 'ar' ? 'right' : 'left', fontSize: 12, borderBottom: `2px solid ${primary}` };
  const td = { padding: '7px 6px', fontSize: 12, borderBottom: '1px solid #e5e7eb' };

  const infoRow = (label, value) => (
    <div><span style={{ color: '#6b7280' }}>{label}: </span><b>{value || '—'}</b></div>
  );

  return (
    <div ref={innerRef} style={{ direction: lang === 'ar' ? 'rtl' : 'ltr', color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('سند استلام بضاعة', 'Goods Receipt', lang)} docNo={receipt.receiptNo} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16, fontSize: 13 }}>
        {infoRow(t('التاريخ', 'Date', lang), formatDate(receipt.date, lang))}
        {infoRow(t('أمر الشراء', 'PO', lang), receipt.orderNo)}
        {infoRow(t('المورد', 'Supplier', lang), receipt.supplierName)}
        {infoRow(t('المخزن', 'Warehouse', lang), receipt.warehouseName)}
        {receipt.projectName && infoRow(t('المشروع', 'Project', lang), receipt.projectName)}
      </div>

      {lines.length > 0 && (
        <table style={{ marginBottom: 16 }}>
          <thead>
            <tr style={{ background: '#f9fafb' }}>
              <th style={th}>#</th>
              <th style={th}>{t('البند', 'Item', lang)}</th>
              <th style={{ ...th, textAlign: 'center' }}>{t('الكمية', 'Qty', lang)}</th>
              <th style={{ ...th, textAlign: 'center' }}>{t('سعر الوحدة', 'Unit Price', lang)}</th>
              <th style={{ ...th, textAlign: 'center' }}>{t('الإجمالي', 'Total', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{l.description}{l.unit ? ` (${l.unit})` : ''}</td>
                <td style={{ ...td, textAlign: 'center' }}>{formatNumber(l.quantity, 0)}</td>
                <td style={{ ...td, textAlign: 'center' }}>{money(l.unitPrice)}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{money((l.quantity || 0) * (l.unitPrice || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ background: '#f9fafb', border: `1px solid ${primary}`, borderRadius: 8, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontSize: 15, fontWeight: 700 }}>{t('إجمالي المستلم', 'Total Received', lang)}</span>
        <span style={{ fontSize: 20, fontWeight: 800, color: primary }}>{money(receipt.receivedAmount)}</span>
      </div>

      {receipt.notes && <div style={{ fontSize: 12, color: '#374151', marginTop: 14 }}><span style={{ color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: </span>{receipt.notes}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('أمين المخزن', 'Storekeeper', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المستلم', 'Received by', lang)}</div></div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}