import React from 'react';
import { formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { buildZatcaQrPayload, zatcaQrImageUrl } from '@/lib/zatcaQr';

// ═══════════════════════════════════════════════════════════════════════
// مستند إيصال حراري بعرض 80mm لطابعات الإيصالات الحرارية.
// يعيد استخدام محرك ZATCA QR الموجود (zatcaQr.js) دون أي تعديل عليه.
// innerRef يُمرّر إلى العنصر الجذر لالتقاط HTML عند الطباعة.
// ═══════════════════════════════════════════════════════════════════════

const TYPE_LABEL = {
  CONSTRUCTION: { ar: 'صالة',      en: 'Dine-in' },
  SERVICE:      { ar: 'توصيل',    en: 'Delivery' },
  RENTAL:       { ar: 'حجز',      en: 'Reservation' },
};

// يبني قائمة عناصر الإيصال. إن لم توجد بنود تفصيلية نُنشئ بنداً واحداً.
function resolveLineItems(invoice, lang) {
  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) return invoice.lineItems;
  const net = (invoice.totalAmount || 0) - (invoice.vatAmount || 0);
  return [{
    description: invoice.description || (lang === 'ar' ? 'قيمة الأصناف' : 'Items value'),
    qty: 1,
    unitPrice: net,
    total: net,
  }];
}

export default function ThermalReceiptDocument({ invoice, settings, client, lang = 'ar', innerRef }) {
  if (!invoice) return null;

  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';

  const c = client || {};
  const customerName = invoice.clientName || (rtl ? (c.nameAr || c.name || 'زبون نقدي') : (c.name || 'Cash Customer'));
  const customerVat = invoice.clientVatNumber || c.taxNumber;

  const primary = settings.primaryColor || '#d97706';
  const accent = settings.accentColor || '#1f2d3d';

  const subtotal = invoice.subtotal != null ? invoice.subtotal : (invoice.totalAmount || 0) - (invoice.vatAmount || 0);
  const discountPercentage = invoice.discountPercentage || 0;
  const discountAmount = invoice.discountAmount || (discountPercentage > 0 ? subtotal * (discountPercentage / 100) : 0);
  const deliveryFee = invoice.deliveryFee || 0;
  const vat = invoice.vatAmount || 0;
  const total = invoice.totalAmount || 0;
  const paid = invoice.paidAmount || 0;
  const balance = total - paid;
  const change = paid > total ? paid - total : 0;
  const items = resolveLineItems(invoice, lang);

  // بيانات المنصة (لطلبات التوصيل)
  const platformName = invoice.platformName || '';
  const platformCommission = invoice.platformCommission || 0;

  // طرق الدفع المطبّقة (من notes.payments)
  const PAYMENT_LABELS = {
    CASH:       { ar: 'نقداً',     en: 'Cash' },
    CARD_MADA:  { ar: 'مدى',       en: 'Mada' },
    CARD_VISA:  { ar: 'فيزا',      en: 'Visa' },
    CARD_MC:    { ar: 'ماستركارد', en: 'Mastercard' },
    CARD_OTHER: { ar: 'بطاقة أخرى', en: 'Other Card' },
    WALLET:     { ar: 'محفظة',     en: 'Wallet' },
    CREDIT:     { ar: 'آجل',       en: 'Credit' },
  };
  let appliedPayments = [];
  try {
    const notes = invoice.notes ? JSON.parse(invoice.notes) : {};
    const rawPayments = Array.isArray(notes.payments) ? notes.payments : [];
    // دمج طرق الدفع المتكررة من نفس النوع في سطر واحد (مثلاً دفعتين نقداً → نقداً بمجموع المبلغ).
    const merged = {};
    for (const p of rawPayments) {
      const m = p.method || p.type || 'CASH';
      merged[m] = (merged[m] || 0) + (parseFloat(p.amount) || 0);
    }
    appliedPayments = Object.entries(merged).map(([method, amount]) => ({ method, amount: +amount.toFixed(2) }));
  } catch { /* ignore */ }

  const typeLabel = TYPE_LABEL[invoice.invoiceType] || TYPE_LABEL.CONSTRUCTION;
  const T = (ar, en) => (rtl ? ar : en);

  // تاريخ ووقت الإيصال
  const dateTime = invoice.date
    ? (() => {
        try {
          const d = new Date(invoice.date);
          if (!isNaN(d.getTime())) {
            const y = d.getFullYear();
            const m = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            const hh = String(d.getHours()).padStart(2, '0');
            const mm = String(d.getMinutes()).padStart(2, '0');
            return `${y}-${m}-${day} ${hh}:${mm}`;
          }
        } catch { /* ignore */ }
        return formatDate(invoice.date, lang);
      })()
    : formatDate(new Date().toISOString(), lang);

  // QR رمز ZATCA — إعادة استخدام الدوال الموجودة دون أي تعديل.
  const qrPayload = settings.showQr !== false && settings.vatNumber
    ? buildZatcaQrPayload({
        sellerName: settings.companyName,
        vatNumber: settings.vatNumber,
        timestamp: invoice.date ? new Date(invoice.date).toISOString() : new Date().toISOString(),
        total,
        vatTotal: vat,
      })
    : null;

  // عرض المبلغ برمز الريال
  const Money = ({ value }) => (
    <span dir="ltr" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
      {formatNumber(value)}
      <span style={{ fontFamily: "'saudi_riyal'", fontSize: '1em', margin: '0 1px' }}>{RIYAL_SYMBOL}</span>
    </span>
  );

  const divider = '─'.repeat(32);
  const lightDivider = '·'.repeat(40);

  return (
    <div
      ref={innerRef}
      dir={dir}
      style={{
        background: '#fff',
        color: '#000',
        fontFamily: "'Cairo', 'Tahoma', monospace",
        fontSize: 11,
        lineHeight: 1.45,
        width: '100%',
        maxWidth: '280px',
        margin: '0 auto',
        padding: '6px 8px',
        direction: dir,
        textAlign: align,
      }}
    >
      {/* ─── ترويسة المطعم ─── */}
      {settings.logoUrl ? (
        <div style={{ textAlign: 'center', marginBottom: 4 }}>
          <img src={settings.logoUrl} alt="logo" style={{ maxWidth: '120px', maxHeight: '60px', objectFit: 'contain' }} />
        </div>
      ) : null}

      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: accent }}>
        {(rtl ? settings.companyName : (settings.companyNameEn || settings.companyName)) || (rtl ? 'مطعمنا' : 'Our Restaurant')}
      </div>

      {settings.companyNameEn && rtl && settings.companyName ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#555', marginBottom: 2 }}>{settings.companyNameEn}</div>
      ) : null}

      {/* اسم الفرع — يظهر إن كان الإيصال مرتبطاً بفرع محدّد */}
      {settings.branchName ? (
        <div style={{ textAlign: 'center', fontSize: 10, color: primary, fontWeight: 700 }}>
          {T('فرع:', 'Branch:')} {settings.branchName}
        </div>
      ) : null}

      {settings.vatNumber ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {T('الرقم الضريبي', 'VAT No.')}: <span dir="ltr">{settings.vatNumber}</span>
        </div>
      ) : null}

      {settings.phone ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {T('هاتف', 'Tel')}: <span dir="ltr">{settings.phone}</span>
        </div>
      ) : null}

      {(settings.address || settings.city) ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555', maxWidth: '95%', margin: '0 auto' }}>
          {[settings.address, settings.city].filter(Boolean).join(' - ')}
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── بيانات الإيصال ─── */}
      <div style={{ fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>{T('إيصال', 'Receipt')} #</span>
          <span dir="ltr" style={{ fontWeight: 700 }}>{invoice.invoiceNo || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('التاريخ والوقت', 'Date & Time')}</span>
          <span dir="ltr">{dateTime}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('النوع', 'Type')}</span>
          <span style={{ fontWeight: 600 }}>{rtl ? typeLabel.ar : typeLabel.en}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('الزبون', 'Customer')}</span>
          <span style={{ fontWeight: 600 }}>{customerName}</span>
        </div>
        {customerVat ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{T('الرقم الضريبي للزبون', 'Customer VAT')}</span>
            <span dir="ltr">{customerVat}</span>
          </div>
        ) : null}
        {invoice.cashier ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{T('الكاشير', 'Cashier')}</span>
            <span>{invoice.cashier}</span>
          </div>
        ) : null}
        {invoice.tableNo ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{T('رقم الطاولة', 'Table No.')}</span>
            <span dir="ltr">{invoice.tableNo}</span>
          </div>
        ) : null}
      </div>

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── عناوين الأعمدة ─── */}
      <div style={{ display: 'flex', fontWeight: 700, fontSize: 10, borderBottom: '1px dashed #ccc', paddingBottom: 2 }}>
        <span style={{ flex: '0 0 28px', textAlign: 'center' }}>{T('#', '#')}</span>
        <span style={{ flex: 1, textAlign: align }}>{T('الصنف', 'Item')}</span>
        <span style={{ flex: '0 0 32px', textAlign: 'center' }}>{T('كمية', 'Qty')}</span>
        <span style={{ flex: '0 0 70px', textAlign: 'end' }}>{T('السعر', 'Price')}</span>
        <span style={{ flex: '0 0 75px', textAlign: 'end' }}>{T('الإجمالي', 'Total')}</span>
      </div>

      {/* ─── بنود الطلب ─── */}
      <div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', fontSize: 10, padding: '2px 0', borderBottom: '1px dotted #eee' }}>
            <span style={{ flex: '0 0 28px', textAlign: 'center', color: '#666' }}>{i + 1}</span>
            <span style={{ flex: 1, textAlign: align, wordBreak: 'break-word' }}>
              {it.description}
              {it.descriptionEn ? <span style={{ display: 'block', fontSize: 8, color: '#888' }}>{it.descriptionEn}</span> : null}
            </span>
            <span style={{ flex: '0 0 32px', textAlign: 'center' }}>{it.qty ?? 1}</span>
            <span style={{ flex: '0 0 70px', textAlign: 'end' }} dir="ltr"><Money value={it.unitPrice} /></span>
            <span style={{ flex: '0 0 75px', textAlign: 'end', fontWeight: 600 }} dir="ltr"><Money value={it.total} /></span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── الملخّص المالي ─── */}
      <div style={{ fontSize: 11 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
          <span>{T('المجموع الفرعي', 'Subtotal')}</span>
          <span dir="ltr"><Money value={subtotal} /></span>
        </div>
        {discountAmount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: '#16a34a' }}>
            <span>{T(`خصم (${Math.round(discountPercentage)}%)`, `Discount (${Math.round(discountPercentage)}%)`)}</span>
            <span dir="ltr">-<Money value={discountAmount} /></span>
          </div>
        ) : null}
        {deliveryFee > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
            <span>{T('رسوم التوصيل', 'Delivery Fee')}</span>
            <span dir="ltr"><Money value={deliveryFee} /></span>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
          <span>{T(`ضريبة القيمة المضافة (${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%)`, `VAT (${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%)`)}</span>
          <span dir="ltr"><Money value={vat} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', fontWeight: 800, fontSize: 13, borderTop: '1px dashed #999', marginTop: 2, color: primary }}>
          <span>{T('الإجمالي الكلي', 'Total Amount')}</span>
          <span dir="ltr"><Money value={total} /></span>
        </div>
        {platformName ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 9, color: '#666' }}>
            <span>{T('المنصة', 'Platform')}: {platformName}</span>
            {platformCommission > 0 ? (
              <span dir="ltr">({T('عمولة', 'Comm.')}: <Money value={platformCommission} />)</span>
            ) : null}
          </div>
        ) : null}
        {paid > 0 ? (
          <>
            {/* طرق الدفع المطبّقة */}
            {appliedPayments.length > 0 && (
              <div style={{ borderTop: '1px dotted #ccc', marginTop: 4, paddingTop: 4 }}>
                {appliedPayments.map((p, i) => {
                  const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
                  return (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10 }}>
                      <span>{rtl ? label.ar : label.en}</span>
                      <span dir="ltr"><Money value={p.amount} /></span>
                    </div>
                  );
                })}
              </div>
            )}
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
              <span>{T('المدفوع', 'Paid')}</span>
              <span dir="ltr"><Money value={paid} /></span>
            </div>
            {change > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700 }}>
                <span>{T('الباقي للزبون', 'Change')}</span>
                <span dir="ltr"><Money value={change} /></span>
              </div>
            ) : balance > 0 ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                <span>{T('المتبقي', 'Balance Due')}</span>
                <span dir="ltr"><Money value={balance} /></span>
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {/* ─── QR رمز ZATCA ─── */}
      {qrPayload ? (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <img src={zatcaQrImageUrl(qrPayload, 100)} alt="ZATCA QR" style={{ width: 100, height: 100 }} />
          <div style={{ fontSize: 8, color: '#888' }}>{T('امسح للتحقق من الإيصال', 'Scan to verify receipt')}</div>
        </div>
      ) : (settings.showQr !== false && !settings.vatNumber) ? (
        <div style={{ textAlign: 'center', marginTop: 6, fontSize: 8, color: '#888' }}>
          {T('أدخل الرقم الضريبي في الإعدادات لإظهار QR', 'Add a VAT number in Settings to show QR')}
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '6px 0 2px' }}>{lightDivider}</div>

      {/* ─── التذييل ─── */}
      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: accent }}>
        {T('شكراً لزيارتكم', 'Thank you for visiting')}
      </div>
      <div style={{ textAlign: 'center', fontSize: 9, color: '#666' }}>
        {T('نتمنى لكم وجبة شهية', 'We hope you enjoyed your meal')}
      </div>
      {settings.website ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#888', marginTop: 2 }}>{settings.website}</div>
      ) : null}
      {settings.email ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#888' }}>{settings.email}</div>
      ) : null}
    </div>
  );
}
