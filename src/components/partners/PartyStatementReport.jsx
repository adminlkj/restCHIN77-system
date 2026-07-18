import React from 'react';
import { Printer, X, ArrowDownCircle, ArrowUpCircle, Scale, Building2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { t, formatCurrency as fmt, formatDate } from '@/lib/utils-binaa';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import { printHtml } from '@/lib/printDocument';

const SOURCE_LABELS = (lang) => ({
  SalesInvoice: t('فاتورة مبيعات', 'Sales Invoice', lang),
  ClientPayment: t('سند قبض', 'Receipt', lang),
  SupplierInvoice: t('فاتورة مورد', 'Supplier Invoice', lang),
  PurchaseOrder: t('أمر شراء', 'Purchase Order', lang),
  SupplierPayment: t('سند صرف', 'Payment Voucher', lang),
});

/**
 * تقرير كشف حساب احترافي لطرف واحد (عميل/مورد).
 * يعرض ترويسة رسمية، ملخّص أرصدة، وجدول حركات برصيد جارٍ، مع طباعة رسمية.
 */
export default function PartyStatementReport({ party, statement, partyType, onClose }) {
  const { lang } = useStore();
  const { settings } = useCompanySettings();
  const isSupplier = partyType === 'SUPPLIER';
  const labels = SOURCE_LABELS(lang);

  const outstandingLabel = isSupplier
    ? t('مستحق للمورد', 'Owed to Supplier', lang)
    : t('مستحق على العميل', 'Owed by Client', lang);

  const rows = statement?.rows || [];
  const dateRange = rows.length
    ? `${formatDate(rows[0].date, lang)} — ${formatDate(rows[rows.length - 1].date, lang)}`
    : '—';

  const handlePrint = () => {
    printHtml(buildPrintHtml({ party, statement, partyType, settings, lang, labels, outstandingLabel, dateRange }), {
      title: `${t('كشف حساب', 'Statement of Account', lang)} - ${party.name}`,
      lang,
    });
  };

  return (
    <Card className="overflow-hidden border-t-4" style={{ borderTopColor: settings.primaryColor }}>
      {/* الترويسة */}
      <div className="flex items-start justify-between gap-4 p-5 bg-muted/30 border-b">
        <div className="flex items-start gap-3">
          {settings.logoUrl ? (
            <img src={settings.logoUrl} alt="" className="h-12 w-12 object-contain rounded" />
          ) : (
            <div className="h-12 w-12 rounded flex items-center justify-center bg-muted">
              <Building2 className="size-6 text-muted-foreground" />
            </div>
          )}
          <div>
            <p className="font-bold text-base leading-tight">{lang === 'ar' ? settings.companyName : (settings.companyNameEn || settings.companyName)}</p>
            {settings.vatNumber && <p className="text-xs text-muted-foreground">{t('الرقم الضريبي', 'VAT No.', lang)}: {settings.vatNumber}</p>}
            {settings.phone && <p className="text-xs text-muted-foreground">{settings.phone}</p>}
          </div>
        </div>
        <div className="text-end">
          <h3 className="font-bold text-lg" style={{ color: settings.primaryColor }}>{t('كشف حساب', 'Statement of Account', lang)}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{t('الفترة', 'Period', lang)}: <span dir="ltr">{dateRange}</span></p>
        </div>
      </div>

      {/* بيانات الطرف */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1 px-5 py-4 text-sm border-b">
        <div className="flex justify-between sm:block">
          <span className="text-muted-foreground text-xs">{isSupplier ? t('المورد', 'Supplier', lang) : t('العميل', 'Client', lang)}</span>
          <p className="font-semibold">{party.name}</p>
        </div>
        {party.code && <div className="flex justify-between sm:block"><span className="text-muted-foreground text-xs">{t('الكود', 'Code', lang)}</span><p className="font-medium font-mono text-xs">{party.code}</p></div>}
        {party.phone && <div className="flex justify-between sm:block"><span className="text-muted-foreground text-xs">{t('الجوال', 'Phone', lang)}</span><p className="font-medium">{party.phone}</p></div>}
        {party.taxNumber && <div className="flex justify-between sm:block"><span className="text-muted-foreground text-xs">{t('الرقم الضريبي', 'VAT No.', lang)}</span><p className="font-medium">{party.taxNumber}</p></div>}
      </div>

      {/* بطاقات الملخّص */}
      <div className="grid grid-cols-3 divide-x divide-x-reverse divide-border border-b">
        <SummaryTile icon={ArrowDownCircle} tint="text-sky-600" label={isSupplier ? t('إجمالي المسدّد', 'Total Paid', lang) : t('إجمالي المُحصّل', 'Total Collected', lang)} value={fmt(isSupplier ? statement.totalDebit : statement.totalCredit)} />
        <SummaryTile icon={ArrowUpCircle} tint="text-slate-600" label={isSupplier ? t('إجمالي الفواتير', 'Total Invoiced', lang) : t('إجمالي المستحقات', 'Total Billed', lang)} value={fmt(isSupplier ? statement.totalCredit : statement.totalDebit)} />
        <SummaryTile icon={Scale} tint={isSupplier ? 'text-amber-600' : 'text-emerald-600'} label={outstandingLabel} value={fmt(statement.outstanding)} strong />
      </div>

      {/* جدول الحركات */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/40 text-xs text-muted-foreground">
              <th className="text-start font-medium px-4 py-2.5">{t('التاريخ', 'Date', lang)}</th>
              <th className="text-start font-medium px-4 py-2.5">{t('المستند', 'Document', lang)}</th>
              <th className="text-start font-medium px-4 py-2.5">{t('البيان', 'Description', lang)}</th>
              <th className="text-end font-medium px-4 py-2.5">{t('مدين', 'Debit', lang)}</th>
              <th className="text-end font-medium px-4 py-2.5">{t('دائن', 'Credit', lang)}</th>
              <th className="text-end font-medium px-4 py-2.5">{t('الرصيد', 'Balance', lang)}</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد حركات مرحّلة لهذا الطرف', 'No posted movements for this party', lang)}</td></tr>
            ) : rows.map((m, i) => (
              <tr key={i} className="border-t hover:bg-muted/20">
                <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground font-mono" dir="ltr">{formatDate(m.date, lang)}</td>
                <td className="px-4 py-2.5">
                  <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium">{labels[m.sourceType] || m.sourceType || '—'}</span>
                  <span className="block text-[11px] text-muted-foreground font-mono mt-0.5">{m.entryNo}</span>
                </td>
                <td className="px-4 py-2.5">{m.description}</td>
                <td className="px-4 py-2.5 text-end tabular-nums text-sky-700">{m.debit ? fmt(m.debit) : '—'}</td>
                <td className="px-4 py-2.5 text-end tabular-nums text-rose-600">{m.credit ? fmt(m.credit) : '—'}</td>
                <td className="px-4 py-2.5 text-end tabular-nums font-semibold">{fmt(Math.abs(m.balance))}</td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="border-t-2 bg-muted/40 font-semibold">
                <td colSpan={3} className="px-4 py-3 text-start">{t('الإجمالي', 'Total', lang)}</td>
                <td className="px-4 py-3 text-end tabular-nums text-sky-700">{fmt(statement.totalDebit)}</td>
                <td className="px-4 py-3 text-end tabular-nums text-rose-600">{fmt(statement.totalCredit)}</td>
                <td className="px-4 py-3 text-end tabular-nums" style={{ color: isSupplier ? '#b45309' : '#047857' }}>{fmt(statement.outstanding)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      {/* أزرار */}
      <div className="flex items-center justify-end gap-2 p-4 border-t bg-muted/20">
        {onClose && <Button variant="ghost" size="sm" className="gap-1.5" onClick={onClose}><X className="size-4" />{t('إغلاق', 'Close', lang)}</Button>}
        <Button size="sm" className="gap-1.5" onClick={handlePrint} disabled={rows.length === 0}><Printer className="size-4" />{t('طباعة الكشف', 'Print Statement', lang)}</Button>
      </div>
    </Card>
  );
}

function SummaryTile({ icon: Icon, tint, label, value, strong }) {
  return (
    <div className="px-4 py-3.5 flex items-center gap-3">
      <Icon className={`size-5 shrink-0 ${tint}`} />
      <div className="min-w-0">
        <p className="text-[11px] text-muted-foreground truncate">{label}</p>
        <p className={`tabular-nums ${strong ? 'text-base font-bold' : 'text-sm font-semibold'} ${strong ? tint : ''}`}>{value}</p>
      </div>
    </div>
  );
}

/* ————— قالب الطباعة الرسمي ————— */
function buildPrintHtml({ party, statement, partyType, settings, lang, labels, outstandingLabel, dateRange }) {
  const isSupplier = partyType === 'SUPPLIER';
  const primary = settings.primaryColor || '#059669';
  const rows = statement?.rows || [];
  const money = (v) => fmt(v, lang);

  const infoRow = (label, val) => val ? `<div style="margin-bottom:3px"><span style="color:#6b7280;font-size:11px">${label}:</span> <strong>${val}</strong></div>` : '';

  const contactBits = [
    settings.address && [settings.address, settings.city].filter(Boolean).join('، '),
    settings.phone && `${t('هاتف', 'Tel', lang)}: ${settings.phone}`,
    settings.email,
    settings.website,
    settings.vatNumber && `${t('الرقم الضريبي', 'VAT', lang)}: ${settings.vatNumber}`,
    settings.crNumber && `${t('السجل التجاري', 'CR', lang)}: ${settings.crNumber}`,
  ].filter(Boolean);
  const companyName = lang === 'ar' ? (settings.companyName || settings.companyNameEn || '') : (settings.companyNameEn || settings.companyName || '');

  const bodyRows = rows.map(m => `
    <tr style="border-top:1px solid #e5e7eb">
      <td style="padding:7px 10px;white-space:nowrap;color:#6b7280;font-family:monospace" dir="ltr">${formatDate(m.date, lang)}</td>
      <td style="padding:7px 10px"><div>${labels[m.sourceType] || m.sourceType || '—'}</div><div style="font-size:10px;color:#9ca3af">${m.entryNo || ''}</div></td>
      <td style="padding:7px 10px">${m.description || ''}</td>
      <td style="padding:7px 10px;text-align:end">${m.debit ? money(m.debit) : '—'}</td>
      <td style="padding:7px 10px;text-align:end">${m.credit ? money(m.credit) : '—'}</td>
      <td style="padding:7px 10px;text-align:end;font-weight:600">${money(Math.abs(m.balance))}</td>
    </tr>`).join('');

  return `
    <div style="max-width:900px;margin:0 auto">
      ${settings.headerImageUrl ? `<img src="${settings.headerImageUrl}" style="display:block;width:100%;object-fit:cover;margin-bottom:12px" />` : ''}
      <div style="border-bottom:3px solid ${primary};padding-bottom:14px;margin-bottom:16px">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px">
          <div style="display:flex;gap:12px;align-items:center">
            ${settings.logoUrl ? `<img src="${settings.logoUrl}" style="height:60px;width:60px;object-fit:contain" />` : ''}
            <div style="font-weight:800;font-size:19px;color:${primary}">${companyName}</div>
          </div>
          <div style="text-align:end">
            <div style="font-weight:800;font-size:18px;color:${primary}">${t('كشف حساب', 'Statement of Account', lang)}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:4px">${t('الفترة', 'Period', lang)}: <span dir="ltr">${dateRange}</span></div>
          </div>
        </div>
        ${contactBits.length ? `<div style="font-size:10.5px;color:#475569;margin-top:10px;line-height:1.7">${contactBits.join('  •  ')}</div>` : ''}
      </div>

      <div style="display:flex;justify-content:space-between;gap:20px;font-size:12px;margin-bottom:16px">
        <div>
          <div style="font-size:11px;color:#9ca3af;margin-bottom:4px">${isSupplier ? t('المورد', 'Supplier', lang) : t('العميل', 'Client', lang)}</div>
          <div style="font-weight:700;font-size:14px;margin-bottom:4px">${party.name}</div>
          ${infoRow(t('الكود', 'Code', lang), party.code)}
          ${infoRow(t('الجوال', 'Phone', lang), party.phone)}
          ${infoRow(t('الرقم الضريبي', 'VAT No.', lang), party.taxNumber)}
        </div>
        <div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px 16px;text-align:center;min-width:180px;background:#f9fafb">
          <div style="font-size:11px;color:#6b7280">${outstandingLabel}</div>
          <div style="font-size:22px;font-weight:800;color:${isSupplier ? '#b45309' : primary};margin-top:2px">${money(statement.outstanding)}</div>
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse;font-size:12px">
        <thead>
          <tr style="background:${primary};color:#fff">
            <th style="text-align:start;padding:8px 10px">${t('التاريخ', 'Date', lang)}</th>
            <th style="text-align:start;padding:8px 10px">${t('المستند', 'Document', lang)}</th>
            <th style="text-align:start;padding:8px 10px">${t('البيان', 'Description', lang)}</th>
            <th style="text-align:end;padding:8px 10px">${t('مدين', 'Debit', lang)}</th>
            <th style="text-align:end;padding:8px 10px">${t('دائن', 'Credit', lang)}</th>
            <th style="text-align:end;padding:8px 10px">${t('الرصيد', 'Balance', lang)}</th>
          </tr>
        </thead>
        <tbody>${bodyRows || `<tr><td colspan="6" style="text-align:center;padding:30px;color:#9ca3af">${t('لا توجد حركات', 'No movements', lang)}</td></tr>`}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #d1d5db;background:#f3f4f6;font-weight:700">
            <td colspan="3" style="padding:10px">${t('الإجمالي', 'Total', lang)}</td>
            <td style="padding:10px;text-align:end">${money(statement.totalDebit)}</td>
            <td style="padding:10px;text-align:end">${money(statement.totalCredit)}</td>
            <td style="padding:10px;text-align:end;color:${isSupplier ? '#b45309' : primary}">${money(statement.outstanding)}</td>
          </tr>
        </tfoot>
      </table>

      ${settings.footerImageUrl ? `<img src="${settings.footerImageUrl}" style="display:block;width:100%;object-fit:cover;margin-top:24px" />` : ''}
      <div style="margin-top:24px;border-top:2px solid ${primary};padding-top:8px;display:flex;justify-content:space-between;align-items:center;font-size:10px;color:#64748b">
        <span>${companyName}</span>
        <span>${t('تم إصدار هذا الكشف آلياً بتاريخ', 'Generated automatically on', lang)} ${formatDate(new Date().toISOString(), lang)}</span>
      </div>
    </div>`;
}