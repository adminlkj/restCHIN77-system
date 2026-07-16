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
  // خصومات تفصيلية (من notes إن وُجدت)
  let notesObj = {};
  try {
    notesObj = typeof invoice.notes === 'string' && invoice.notes.trim().startsWith('{')
      ? JSON.parse(invoice.notes)
      : (typeof invoice.notes === 'object' && invoice.notes ? invoice.notes : {});
  } catch { notesObj = {}; }
  const itemDiscountsTotal = Number(notesObj.itemDiscountsTotal || invoice.itemDiscountsTotal || 0);
  const customerDiscountAmount = Number(notesObj.customerDiscountAmount || invoice.customerDiscountAmount || 0);
  const manualDiscountAmount = Number(notesObj.manualDiscount?.amount || invoice.manualDiscountAmount || 0);
  const discountAmount = invoice.discountAmount || (customerDiscountAmount + manualDiscountAmount);
  const deliveryFee = invoice.deliveryFee || Number(notesObj.deliveryFee) || 0;
  const vat = invoice.vatAmount || 0;
  const total = invoice.totalAmount || 0;
  const paid = invoice.paidAmount || 0;
  const balance = total - paid;
  // النقد المستلم من الزبون (قد يزيد عن الإجمالي — الباقي للزبون)
  const cashReceived = Number(notesObj.cashReceived) || 0;
  const change = cashReceived > total ? cashReceived - total : (paid > total ? paid - total : 0);
  const items = resolveLineItems(invoice, lang);

  // نوع البيع (شارة واضحة في الإيصال)
  const saleType = notesObj.saleType || invoice.saleType || '';
  const SALE_TYPE_LABELS = {
    DINE_IN: { ar: 'صالة', en: 'Dine-in' },
    TAKEAWAY: { ar: 'استلام', en: 'Takeaway' },
    DIRECT_DELIVERY: { ar: 'توصيل مباشر', en: 'Direct Delivery' },
    PLATFORM: { ar: 'منصة', en: 'Platform' },
    CREDIT: { ar: 'آجل', en: 'Credit' },
  };
  const saleTypeLabel = SALE_TYPE_LABELS[saleType] || null;

  // بيانات المنصة (لطلبات التوصيل)
  const platformName = invoice.platformName || notesObj.platform?.platformName || '';
  const platformCommission = invoice.platformCommission || notesObj.platform?.platformCommission || 0;

  // طرق الدفع المطبّقة (من notes.payments)
  const PAYMENT_LABELS = {
    CASH:       { ar: 'نقداً',     en: 'Cash' },
    CARD_MADA:  { ar: 'مدى',       en: 'Mada' },
    CARD_VISA:  { ar: 'فيزا',      en: 'Visa' },
    CARD_MC:    { ar: 'ماستركارد', en: 'Mastercard' },
    CARD_OTHER: { ar: 'بطاقة أخرى', en: 'Other Card' },
    BANK:       { ar: 'تحويل بنكي', en: 'Bank Transfer' },
    CREDIT:     { ar: 'آجل',       en: 'Credit' },
  };
  let appliedPayments = [];
  const rawPayments = Array.isArray(notesObj.payments) ? notesObj.payments : (Array.isArray(invoice.payments) ? invoice.payments : []);
  const mergedPayments = {};
  for (const p of rawPayments) {
    const m = p.method || p.type || 'CASH';
    mergedPayments[m] = (mergedPayments[m] || 0) + (parseFloat(p.amount) || 0);
  }
  appliedPayments = Object.entries(mergedPayments).map(([method, amount]) => ({ method, amount: +amount.toFixed(2) }));

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
      {/* ═══════════════════════════════════════════════════════════════
          ترويسة الإيصال الحراري — نمط احترافي متّبع في أنظمة نقاط البيع
          (Oracle Simphony / Toast / Square / Lightspeed):

            [LOGO]              ← منفرد في الأعلى، وسط/يمين/يسار حسب الإعداد
            اسم الشركة (عربي)   ← وسط
            اسم الشركة (إنجليزي) ← وسط
            السجل التجاري        ← وسط
            الرقم الضريبي        ← وسط
            ──────────────
            اسم الفرع            ← وسط
            العنوان              ← وسط
            هاتف / هاتف2         ← وسط
          ═══════════════════════════════════════════════════════════════ */}

      {/* ─── (1) الشعار: مستقل عن شعار الفاتورة A4 ─── */}
      {(() => {
        // مصدر الشعار: BRANCH=شعار الفرع العام، CUSTOM=شعار مخصص للإيصال
        const enabled = settings.thermalLogoEnabled !== false;
        if (!enabled) return null;
        const source = settings.thermalLogoSource || 'BRANCH';
        const logoUrl = source === 'CUSTOM'
          ? (settings.thermalLogoUrl || '')
          : (settings.logoUrl || ''); // شعار الفرع العام
        if (!logoUrl) return null;

        // الأبعاد: تحكم كامل حسب نوع الطابعة (58mm/80mm)
        const width = Math.min(Number(settings.thermalLogoWidth) || 180, 220);  // حد أقصى 220
        const height = Math.min(Number(settings.thermalLogoHeight) || 90, 120); // حد أقصى 120
        const marginBottom = Number(settings.thermalLogoMarginBottom) || 10;
        const align = (settings.thermalLogoAlign || 'CENTER').toLowerCase();
        const fit = (settings.thermalLogoFit || 'CONTAIN').toLowerCase();

        // objectFit: ORIGINAL → لا نحدّد width/height قسراً
        const imgStyle = fit === 'original'
          ? { maxWidth: `${width}px`, maxHeight: `${height}px` }
          : { width: `${width}px`, height: `${height}px`, objectFit: fit };

        return (
          <div style={{ textAlign: align, marginBottom, marginTop: 2 }}>
            <img
              src={logoUrl}
              alt="logo"
              style={{ ...imgStyle, display: align === 'center' ? 'inline-block' : 'block', margin: align === 'center' ? '0 auto' : (align === 'right' ? '0 0 0 auto' : '0 auto 0 0') }}
            />
          </div>
        );
      })()}

      {/* ─── (2) اسم الشركة (عربي) ─── */}
      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 15, color: accent, marginTop: 2 }}>
        {(rtl ? settings.companyName : (settings.companyNameEn || settings.companyName)) || (rtl ? 'مطعمنا' : 'Our Restaurant')}
      </div>

      {/* ─── (3) اسم الشركة (إنجليزي) ─── */}
      {settings.companyNameEn && rtl && settings.companyName ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#555', marginBottom: 2 }}>{settings.companyNameEn}</div>
      ) : null}

      {/* ─── (4) السجل التجاري ─── */}
      {settings.crNumber ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {T('السجل التجاري', 'CR')}: <span dir="ltr">{settings.crNumber}</span>
        </div>
      ) : null}

      {/* ─── (5) الرقم الضريبي ─── */}
      {settings.vatNumber ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {T('الرقم الضريبي', 'VAT')}: <span dir="ltr">{settings.vatNumber}</span>
        </div>
      ) : null}

      {/* ─── فاصل بين بيانات الشركة وبيانات الفرع ─── */}
      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0 2px' }}>{divider}</div>

      {/* ─── (6) اسم الفرع ─── */}
      {settings.branchName ? (
        <div style={{ textAlign: 'center', fontSize: 11, color: primary, fontWeight: 700, marginTop: 2 }}>
          {settings.branchName}{settings.branchNameEn ? ` — ${settings.branchNameEn}` : ''}
        </div>
      ) : null}

      {/* ─── (7) عنوان الفرع (المدينة + العنوان التفصيلي) ─── */}
      {settings.city || settings.address ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555', maxWidth: '95%', margin: '1px auto' }}>
          {[
            settings.city,
            settings.address && settings.address !== settings.city ? settings.address : '',
          ].filter(Boolean).join(' - ')}
        </div>
      ) : null}

      {/* ─── (8) هاتف الفرع (هاتف + هاتف2) ─── */}
      {settings.phone ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {T('هاتف', 'Tel')}: <span dir="ltr">{settings.phone}</span>
          {settings.phone2 ? ` · ${settings.phone2}` : ''}
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── بيانات الإيصال ─── */}
      <div style={{ fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span style={{ fontWeight: 700 }}>{T('إيصال رقم', 'Receipt No.')}</span>
          <span dir="ltr" style={{ fontWeight: 700 }}>{invoice.invoiceNo || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('التاريخ', 'Date')}</span>
          <span dir="ltr">{dateTime.split(' ')[0]}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('الوقت', 'Time')}</span>
          <span dir="ltr">{dateTime.split(' ')[1] || ''}</span>
        </div>
        {/* نوع الطلب — يصف العملية (صالة/استلام/توصيل) */}
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>{T('نوع الطلب', 'Order Type')}</span>
          <span style={{ fontWeight: 600 }}>
            {saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY'
              ? T('توصيل', 'Delivery')
              : saleType === 'TAKEAWAY'
                ? T('استلام', 'Takeaway')
                : T('صالة', 'Dine-in')}
          </span>
        </div>
        {/* منصة التوصيل — قناة البيع (منفصلة عن العميل) */}
        {platformName && (saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY') ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{T('منصة التوصيل', 'Delivery Platform')}</span>
            <span style={{ fontWeight: 600 }}>{platformName}</span>
          </div>
        ) : null}
        {/* الزبون — العميل النهائي (ليس المنصة) */}
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
        {/* رقم الطاولة — فقط للصالة، مخفي للمنصات */}
        {saleType !== 'PLATFORM' && saleType !== 'DIRECT_DELIVERY' && invoice.tableNo ? (
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span>{T('الطاولة', 'Table')}</span>
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

      {/* ─── ملخّص الإجماليات ─── */}
      <div style={{ fontSize: 11 }}>
        {/* (1) المجموع الفرعي (قبل الخصومات) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0' }}>
          <span>{T('المجموع الفرعي', 'Subtotal')}</span>
          <span dir="ltr"><Money value={subtotal + discountAmount} /></span>
        </div>
        {/* (أُزيل خصم الأصناف — القاعدة 4: الخصم على الفاتورة لا على الأصناف) */}
        {/* (2) خصم العميل — تلقائي من بطاقة العميل */}
        {customerDiscountAmount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: '#dc2626' }}>
            <span>{T(`خصم العميل (${Math.round(discountPercentage)}%)`, `Customer Discount (${Math.round(discountPercentage)}%)`)}</span>
            <span dir="ltr">-<Money value={customerDiscountAmount} /></span>
          </div>
        ) : null}
        {/* (3) خصم المنصة — للفواتير المنصة فقط (القواعد 3 + 6) */}
        {manualDiscountAmount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', color: '#dc2626' }}>
            <span>{T('خصم المنصة', 'Platform Discount')}</span>
            <span dir="ltr">-<Money value={manualDiscountAmount} /></span>
          </div>
        ) : null}
        {/* صافي قبل الضريبة (القاعدة الخاضعة للضريبة) */}
        {(customerDiscountAmount > 0 || manualDiscountAmount > 0) ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 600, borderTop: '1px dotted #ddd', paddingTop: 2 }}>
            <span>{T('صافي قبل الضريبة', 'Net before VAT')}</span>
            <span dir="ltr"><Money value={subtotal} /></span>
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
          <span>{T('الإجمالي', 'Total')}</span>
          <span dir="ltr"><Money value={total} /></span>
        </div>

        {/* ─── طرق السداد / حالة السداد ─── */}
        <div style={{ borderTop: '1px dotted #ccc', marginTop: 4, paddingTop: 4 }}>
          {saleType === 'PLATFORM' ? (
            /* بيع منصة: آجل على المنصة — لا نطبع العمولة للعميل */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <span>{T('طريقة السداد', 'Payment Method')}</span>
                <span style={{ fontWeight: 600 }}>{T('آجل - ' + platformName, 'Credit - ' + platformName)}</span>
              </div>
              {balance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                  <span>{T('المبلغ المستحق', 'Amount Due')}</span>
                  <span dir="ltr"><Money value={balance} /></span>
                </div>
              ) : null}
            </>
          ) : cashReceived > 0 ? (
            /* بيع نقدي: المستلم + الباقي */
            <>
              <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>{T('طريقة السداد', 'Payment Method')}:</div>
              {appliedPayments.map((p, i) => {
                const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10 }}>
                    <span>{rtl ? label.ar : label.en}</span>
                    <span dir="ltr"><Money value={p.amount} /></span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <span>{T('المستلم', 'Received')}</span>
                <span dir="ltr"><Money value={cashReceived} /></span>
              </div>
              {change > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700, color: '#1d4ed8' }}>
                  <span>{T('الباقي', 'Change')}</span>
                  <span dir="ltr"><Money value={change} /></span>
                </div>
              ) : null}
            </>
          ) : paid > 0 ? (
            /* مدفوع جزئياً أو كلياً بدون cashReceived */
            <>
              <div style={{ fontSize: 9, color: '#666', marginBottom: 2 }}>{T('طريقة السداد', 'Payment Method')}:</div>
              {appliedPayments.map((p, i) => {
                const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10 }}>
                    <span>{rtl ? label.ar : label.en}</span>
                    <span dir="ltr"><Money value={p.amount} /></span>
                  </div>
                );
              })}
              {balance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                  <span>{T('المبلغ المستحق', 'Amount Due')}</span>
                  <span dir="ltr"><Money value={balance} /></span>
                </div>
              ) : null}
            </>
          ) : balance > 0 ? (
            /* آجل بدون منصة */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <span>{T('طريقة السداد', 'Payment Method')}</span>
                <span style={{ fontWeight: 600 }}>{T('آجل', 'Credit')}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                <span>{T('المبلغ المستحق', 'Amount Due')}</span>
                <span dir="ltr"><Money value={balance} /></span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ─── QR رمز ZATCA ─── */}
      {qrPayload ? (
        <div style={{ textAlign: 'center', marginTop: 6 }}>
          <img src={zatcaQrImageUrl(qrPayload, 100)} alt="ZATCA QR" style={{ width: 100, height: 100 }} />
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '6px 0 2px' }}>{lightDivider}</div>

      {/* ─── التذييل ─── */}
      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: accent }}>
        {(settings.receiptFooterMessage)
          ? settings.receiptFooterMessage.split('\n')[0]
          : T('شكراً لزيارتكم', 'Thank you for visiting')}
      </div>
      {(settings.receiptFooterMessage
        ? settings.receiptFooterMessage.split('\n')[1]
        : T('نتمنى لكم وجبة شهية', 'We hope you enjoyed your meal'))
        ? <div style={{ textAlign: 'center', fontSize: 9, color: '#666' }}>
            {(settings.receiptFooterMessage
              ? settings.receiptFooterMessage.split('\n')[1]
              : T('نتمنى لكم وجبة شهية', 'We hope you enjoyed your meal'))}
          </div>
        : null}
      {settings.phone ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#888', marginTop: 2 }}>
          {T('للاستفسارات', 'Inquiries')}: <span dir="ltr">{settings.phone}</span>
        </div>
      ) : null}
      {settings.email ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#888' }}>{settings.email}</div>
      ) : null}
      {settings.website ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#888', marginTop: 2 }}>{settings.website}</div>
      ) : null}
    </div>
  );
}
