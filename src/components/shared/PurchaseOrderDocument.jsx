import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const money = (n) => `${formatNumber(n || 0)}\u00A0${RIYAL_SYMBOL}`;

export default function PurchaseOrderDocument({ order, settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#d97706';
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';

  const th = { padding: '8px 6px', textAlign: rtl ? 'right' : 'left', fontSize: 12, borderBottom: `2px solid ${primary}` };
  const td = { padding: '7px 6px', fontSize: 12, borderBottom: '1px solid #e5e7eb' };

  const items = order.items || [];
  const subtotal = order.totalAmount || items.reduce((s, l) => s + (Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0), 0);
  const vat = order.vatAmount || 0;
  const total = subtotal + vat;

  const infoRow = (label, value) => (
    <tr>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280', width: '38%' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{value || '—'}</td>
    </tr>
  );

  return (
    <div ref={innerRef} style={{ direction: dir, color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('أمر شراء', 'Purchase Order', lang)} docNo={order.orderNo} />

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 16, width: '100%' }}>
        <tbody>
          {infoRow(t('التاريخ', 'Date', lang), formatDate(order.date, lang))}
          {infoRow(t('المورد', 'Supplier', lang), order.supplierName)}
          {infoRow(t('المشروع', 'Project', lang), order.projectName)}
          {infoRow(t('المخزن', 'Warehouse', lang), order.warehouseName)}
          {order.expectedDelivery && infoRow(t('التسليم المتوقع', 'Expected Delivery', lang), formatDate(order.expectedDelivery, lang))}
        </tbody>
      </table>

      {items.length > 0 && (
        <table style={{ marginBottom: 16, width: '100%' }}>
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
            {items.map((l, i) => (
              <tr key={i}>
                <td style={td}>{i + 1}</td>
                <td style={{ ...td, fontWeight: 600 }}>{l.description}{l.unit ? ` (${l.unit})` : ''}</td>
                <td style={{ ...td, textAlign: 'center' }}>{formatNumber(l.orderedQty, 0)}</td>
                <td style={{ ...td, textAlign: 'center' }}>{money(l.unitPrice)}</td>
                <td style={{ ...td, textAlign: 'center', fontWeight: 600 }}>{money((Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <table style={{ width: '260px', fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('المجموع الصافي', 'Subtotal', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 600 }}>{money(subtotal)}</td></tr>
            {vat > 0 && <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('ضريبة القيمة المضافة', 'VAT', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 600 }}>{money(vat)}</td></tr>}
            <tr style={{ borderTop: `2px solid ${primary}` }}><td style={{ padding: '8px 0', fontWeight: 800, color: primary }}>{t('الإجمالي', 'Total', lang)}</td><td style={{ padding: '8px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 800, color: primary, fontSize: 16 }}>{money(total)}</td></tr>
          </tbody>
        </table>
      </div>

      {order.notes && <div style={{ fontSize: 12, color: '#374151', marginBottom: 16 }}><span style={{ color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: </span>{order.notes}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المشتريات', 'Procurement', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('الاعتماد', 'Approved by', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المورد', 'Supplier', lang)}</div></div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}
