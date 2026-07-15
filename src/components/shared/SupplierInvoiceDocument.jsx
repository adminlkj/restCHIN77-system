import React from 'react';
import { t, formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { DocumentHeader, DocumentFooter } from '@/components/shared/DocumentChrome';

const money = (n) => `${formatNumber(n || 0)}\u00A0${RIYAL_SYMBOL}`;

export default function SupplierInvoiceDocument({ invoice, settings, lang, innerRef }) {
  const primary = settings.primaryColor || '#1e40af';
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';

  const base = invoice.baseAmount || 0;
  const vat = invoice.vatAmount || 0;
  const total = invoice.totalAmount || (base + vat);
  const paid = invoice.paidAmount || 0;
  const balance = total - paid;

  const infoRow = (label, value) => (
    <tr>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', color: '#6b7280', width: '38%' }}>{label}</td>
      <td style={{ padding: '10px 12px', fontSize: 13, borderBottom: '1px solid #e5e7eb', fontWeight: 600 }}>{value || '—'}</td>
    </tr>
  );

  return (
    <div ref={innerRef} style={{ direction: dir, color: '#111827' }}>
      <DocumentHeader settings={settings} lang={lang} title={t('فاتورة مورد', 'Supplier Invoice', lang)} docNo={invoice.invoiceNo} />

      <table style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden', marginBottom: 20, width: '100%' }}>
        <tbody>
          {infoRow(t('المورد', 'Supplier', lang), invoice.supplierName)}
          {infoRow(t('التاريخ', 'Date', lang), formatDate(invoice.date, lang))}
          {invoice.dueDate && infoRow(t('تاريخ الاستحقاق', 'Due Date', lang), formatDate(invoice.dueDate, lang))}
          {invoice.orderNo && infoRow(t('أمر الشراء', 'PO', lang), invoice.orderNo)}
          {invoice.receiptNo && infoRow(t('سند الاستلام', 'Receipt', lang), invoice.receiptNo)}
          {invoice.projectName && infoRow(t('المشروع', 'Project', lang), invoice.projectName)}
        </tbody>
      </table>

      {invoice.description && (
        <div style={{ fontSize: 13, color: '#374151', marginBottom: 16, lineHeight: 1.8 }}>
          <div style={{ fontWeight: 700, marginBottom: 4, color: '#6b7280' }}>{t('الوصف', 'Description', lang)}</div>
          {invoice.description}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
        <table style={{ width: '300px', fontSize: 13 }}>
          <tbody>
            <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('المبلغ الصافي', 'Subtotal', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 600 }}>{money(base)}</td></tr>
            {vat > 0 && <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('ضريبة القيمة المضافة', 'VAT', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 600 }}>{money(vat)}</td></tr>}
            <tr style={{ borderTop: `2px solid ${primary}` }}><td style={{ padding: '8px 0', fontWeight: 800, color: primary }}>{t('الإجمالي', 'Total', lang)}</td><td style={{ padding: '8px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 800, color: primary, fontSize: 16 }}>{money(total)}</td></tr>
            {paid > 0 && <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('المسدد', 'Paid', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 600, color: '#059669' }}>{money(paid)}</td></tr>}
            {balance > 0 && <tr><td style={{ padding: '6px 0', color: '#6b7280' }}>{t('المتبقي', 'Balance', lang)}</td><td style={{ padding: '6px 0', textAlign: rtl ? 'left' : 'right', fontWeight: 700, color: '#dc2626' }}>{money(balance)}</td></tr>}
          </tbody>
        </table>
      </div>

      {invoice.notes && <div style={{ fontSize: 12, color: '#374151', marginBottom: 16 }}><span style={{ color: '#6b7280' }}>{t('ملاحظات', 'Notes', lang)}: </span>{invoice.notes}</div>}

      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 48, fontSize: 12 }}>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المشتريات', 'Procurement', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المحاسب', 'Accountant', lang)}</div></div>
        <div style={{ textAlign: 'center' }}><div style={{ borderTop: '1px solid #9ca3af', paddingTop: 6, width: 170 }}>{t('المورد', 'Supplier', lang)}</div></div>
      </div>

      <DocumentFooter settings={settings} lang={lang} />
    </div>
  );
}
