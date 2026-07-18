import React from 'react';
import { formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { buildZatcaQrPayload, zatcaQrImageUrl } from '@/lib/zatcaQr';
import BiLabel from '@/components/shared/BiLabel';

// ═══════════════════════════════════════════════════════════════════════
// مستند إيصال حراري بعرض 80mm لطابعات الإيصالات الحرارية.
// يعيد استخدام محرك ZATCA QR الموجود (zatcaQr.js) دون أي تعديل عليه.
// innerRef يُمرّر إلى العنصر الجذر لالتقاط HTML عند الطباعة.
// ═══════════════════════════════════════════════════════════════════════

const _TYPE_LABEL = {
  CONSTRUCTION: { ar: 'صالة',      en: 'Dine-in' },
  SERVICE:      { ar: 'توصيل',    en: 'Delivery' },
  RENTAL:       { ar: 'حجز',      en: 'Reservation' },
};

// يبني قائمة عناصر الإيصال. المصدر الأساسي invoice.lineItems، ثم notes.items
// (سجل الخادم يُخزّن البنود داخل notes)، وإلا نُنشئ بنداً واحداً.
function resolveLineItems(invoice, notesObj, lang) {
  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) return invoice.lineItems;
  if (Array.isArray(notesObj?.items) && notesObj.items.length) return notesObj.items;
  const net = (invoice.totalAmount || 0) - (invoice.vatAmount || 0);
  return [{
    description: invoice.description || (lang === 'ar' ? 'قيمة الأصناف' : 'Items value'),
    qty: 1,
    unitPrice: net,
    total: net,
  }];
}

export default function ThermalReceiptDocument({ invoice, settings: settingsProp, client, lang = 'ar', innerRef }) {
  if (!invoice) return null;

  // تأمين ضد settings فارغة (أثناء تحميل إعدادات الشركة/الفرع) — القراءة المباشرة
  // من undefined كانت ترمي خطأً متكرراً عند فتح معاينة الطباعة.
  const settings = settingsProp || {};

  // الإيصال ثنائي اللغة مع الأولوية للغة النظام النشطة — الاتجاه يتبع lang.
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';

  const c = client || {};
  const customerName = invoice.clientName || c.nameAr || c.name || 'زبون نقدي';
  const customerNameEn = c.name && c.name !== (c.nameAr || '') ? c.name : '';
  const customerVat = invoice.clientVatNumber || c.taxNumber;

  const primary = settings.primaryColor || '#d97706';
  const accent = settings.accentColor || '#1f2d3d';

  const subtotal = invoice.subtotal != null
    ? Number(invoice.subtotal)
    : Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.vatAmount) || 0) - (Number(invoice.deliveryFee) || 0) + (Number(invoice.discountAmount) || 0));
  const discountPercentage = invoice.discountPercentage || 0;
  // خصومات تفصيلية (من notes إن وُجدت)
  let notesObj = {};
  try {
    notesObj = typeof invoice.notes === 'string' && invoice.notes.trim().startsWith('{')
      ? JSON.parse(invoice.notes)
      : (typeof invoice.notes === 'object' && invoice.notes ? invoice.notes : {});
  } catch { notesObj = {}; }
  const _itemDiscountsTotal = Number(notesObj.itemDiscountsTotal || invoice.itemDiscountsTotal || 0);
  const customerDiscountAmount = Number(notesObj.customerDiscountAmount || invoice.customerDiscountAmount || 0);
  const manualDiscountAmount = Number(notesObj.manualDiscount?.amount || invoice.manualDiscountAmount || 0);
  const discountAmount = invoice.discountAmount || (customerDiscountAmount + manualDiscountAmount);
  const deliveryFee = invoice.deliveryFee || Number(notesObj.deliveryFee) || 0;
  // صافي قبل الضريبة = الإجمالي (GROSS) ناقص كل الخصومات = الوعاء الخاضع للضريبة.
  const netBeforeVat = Math.max(0, subtotal - discountAmount);
  const vat = invoice.vatAmount || 0;
  const total = invoice.totalAmount || 0;
  const paid = invoice.paidAmount || 0;
  const balance = total - paid;
  // النقد المستلم من الزبون (قد يزيد عن الإجمالي — الباقي للزبون)
  const cashReceived = Number(notesObj.cashReceived) || 0;
  const change = cashReceived > total ? cashReceived - total : (paid > total ? paid - total : 0);
  const items = resolveLineItems(invoice, notesObj, lang);

  // نوع البيع (شارة واضحة في الإيصال)
  const saleType = notesObj.saleType || invoice.saleType || '';
  const SALE_TYPE_LABELS = {
    DINE_IN: { ar: 'صالة', en: 'Dine-in' },
    TAKEAWAY: { ar: 'استلام', en: 'Takeaway' },
    DIRECT_DELIVERY: { ar: 'توصيل مباشر', en: 'Direct Delivery' },
    PLATFORM: { ar: 'منصة', en: 'Platform' },
    CREDIT: { ar: 'آجل', en: 'Credit' },
  };
  const _saleTypeLabel = SALE_TYPE_LABELS[saleType] || null;

  // بيانات المنصة (لطلبات التوصيل)
  const platformName = invoice.platformName || notesObj.platform?.platformName || '';
  const _platformCommission = invoice.platformCommission || notesObj.platform?.platformCommission || 0;

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
        {settings.companyName || 'مطعمنا'}
      </div>

      {/* ─── (3) اسم الشركة (إنجليزي) — يظهر دائماً إن توفّر ─── */}
      {settings.companyNameEn ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#555', marginBottom: 2 }}>{settings.companyNameEn}</div>
      ) : null}

      {/* ─── (4) السجل التجاري ─── */}
      {settings.crNumber ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {'السجل التجاري / CR'}: <span dir="ltr">{settings.crNumber}</span>
        </div>
      ) : null}

      {/* ─── (5) الرقم الضريبي ─── */}
      {settings.vatNumber ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#555' }}>
          {'الرقم الضريبي / VAT'}: <span dir="ltr">{settings.vatNumber}</span>
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
          {'هاتف / Tel'}: <span dir="ltr">{settings.phone}</span>
          {settings.phone2 ? ` · ${settings.phone2}` : ''}
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── بيانات الإيصال ─── */}
      <div style={{ fontSize: 10 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BiLabel ar="إيصال رقم" en="Receipt No." bold />
          <span dir="ltr" style={{ fontWeight: 700 }}>{invoice.invoiceNo || '—'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BiLabel ar="التاريخ" en="Date" />
          <span dir="ltr">{dateTime.split(' ')[0]}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <BiLabel ar="الوقت" en="Time" />
          <span dir="ltr">{dateTime.split(' ')[1] || ''}</span>
        </div>
        {/* نوع الطلب — يصف العملية (صالة/استلام/توصيل) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BiLabel ar="نوع الطلب" en="Order Type" />
          {(() => {
            const ot = saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY'
              ? { ar: 'توصيل', en: 'Delivery' }
              : saleType === 'TAKEAWAY'
                ? { ar: 'استلام', en: 'Takeaway' }
                : { ar: 'صالة', en: 'Dine-in' };
            return <BiLabel ar={ot.ar} en={ot.en} align="end" bold />;
          })()}
        </div>
        {/* منصة التوصيل — قناة البيع (منفصلة عن العميل) */}
        {platformName && (saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY') ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <BiLabel ar="منصة التوصيل" en="Delivery Platform" />
            <span style={{ fontWeight: 600, textAlign: 'left' }}>{platformName}</span>
          </div>
        ) : null}
        {/* الزبون — العميل النهائي (ليس المنصة) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <BiLabel ar="الزبون" en="Customer" />
          <span style={{ fontWeight: 600, textAlign: 'left' }}>
            {(() => {
              const isAr = lang === 'ar';
              const primaryName = isAr ? customerName : (customerNameEn || customerName);
              const secondaryName = isAr ? customerNameEn : (customerNameEn ? customerName : '');
              return (
                <>
                  <span dir={isAr ? 'rtl' : 'ltr'}>{primaryName}</span>
                  {secondaryName ? <span dir={isAr ? 'ltr' : 'rtl'} style={{ display: 'block', fontSize: 8, color: '#777', fontWeight: 400 }}>{secondaryName}</span> : null}
                </>
              );
            })()}
          </span>
        </div>
        {customerVat ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <BiLabel ar="الرقم الضريبي للزبون" en="Customer VAT" />
            <span dir="ltr">{customerVat}</span>
          </div>
        ) : null}
        {invoice.cashier ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <BiLabel ar="الكاشير" en="Cashier" />
            <span style={{ textAlign: 'left' }}>{invoice.cashier}</span>
          </div>
        ) : null}
        {/* رقم الطاولة — فقط للصالة، مخفي للمنصات */}
        {saleType !== 'PLATFORM' && saleType !== 'DIRECT_DELIVERY' && invoice.tableNo ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <BiLabel ar="الطاولة" en="Table" />
            <span dir="ltr">{invoice.tableNo}</span>
          </div>
        ) : null}
      </div>

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── عناوين الأعمدة — اللغة النشطة بالأعلى والثانوية أصغر بالأسفل ─── */}
      {(() => {
        const H = ({ ar, en }) => (
          <>
            {rtl ? ar : en}
            <br/><span dir={rtl ? 'ltr' : 'rtl'} style={{ color: '#777', fontSize: 7 }}>{rtl ? en : ar}</span>
          </>
        );
        return (
          <div style={{ display: 'flex', fontWeight: 700, fontSize: 9, borderBottom: '1px dashed #ccc', paddingBottom: 2, lineHeight: 1.1 }}>
            <span style={{ flex: '0 0 24px', textAlign: 'center' }}>#</span>
            <span style={{ flex: 1, textAlign: align }}><H ar="الصنف" en="Item" /></span>
            <span style={{ flex: '0 0 30px', textAlign: 'center' }}><H ar="كمية" en="Qty" /></span>
            <span style={{ flex: '0 0 68px', textAlign: 'end' }}><H ar="السعر" en="Price" /></span>
            <span style={{ flex: '0 0 72px', textAlign: 'end' }}><H ar="الإجمالي" en="Total" /></span>
          </div>
        );
      })()}

      {/* ─── بنود الطلب ─── */}
      <div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', fontSize: 10, padding: '2px 0', borderBottom: '1px dotted #eee', alignItems: 'flex-start' }}>
            <span style={{ flex: '0 0 24px', textAlign: 'center', color: '#666' }}>{i + 1}</span>
            <span style={{ flex: 1, textAlign: align, wordBreak: 'break-word' }}>
              {/* الاسم الأساسي = اللغة النشطة (أوضح بالأعلى)، والثانوي أصغر بالأسفل */}
              {(() => {
                const isAr = lang === 'ar';
                const primaryName = isAr ? it.description : (it.descriptionEn || it.description);
                const secondaryName = isAr ? it.descriptionEn : (it.descriptionEn ? it.description : '');
                return (
                  <>
                    <span dir={isAr ? 'rtl' : 'ltr'}>{primaryName}</span>
                    {secondaryName ? <span dir={isAr ? 'ltr' : 'rtl'} style={{ display: 'block', fontSize: 8, color: '#888' }}>{secondaryName}</span> : null}
                  </>
                );
              })()}
            </span>
            <span style={{ flex: '0 0 30px', textAlign: 'center' }}>{it.qty ?? 1}</span>
            <span style={{ flex: '0 0 68px', textAlign: 'end' }} dir="ltr"><Money value={it.unitPrice} /></span>
            <span style={{ flex: '0 0 72px', textAlign: 'end', fontWeight: 600 }} dir="ltr"><Money value={it.total} /></span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '4px 0' }}>{divider}</div>

      {/* ─── ملخّص الإجماليات ─── */}
      <div style={{ fontSize: 11 }}>
        {/* (1) المجموع الفرعي (قبل الخصومات) */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0' }}>
          <BiLabel ar="المجموع الفرعي" en="Subtotal" />
          <span dir="ltr"><Money value={subtotal} /></span>
        </div>
        {/* (أُزيل خصم الأصناف — القاعدة 4: الخصم على الفاتورة لا على الأصناف) */}
        {/* (2) خصم العميل — تلقائي من بطاقة العميل */}
        {customerDiscountAmount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', color: '#dc2626' }}>
            <BiLabel ar={`خصم العميل (${Math.round(discountPercentage)}%)`} en={`Customer Discount (${Math.round(discountPercentage)}%)`} />
            <span dir="ltr">-<Money value={customerDiscountAmount} /></span>
          </div>
        ) : null}
        {/* (3) خصم المنصة — للفواتير المنصة فقط (القواعد 3 + 6) */}
        {manualDiscountAmount > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', color: '#dc2626' }}>
            <BiLabel ar="خصم المنصة" en="Platform Discount" />
            <span dir="ltr">-<Money value={manualDiscountAmount} /></span>
          </div>
        ) : null}
        {/* صافي قبل الضريبة (القاعدة الخاضعة للضريبة) */}
        {(customerDiscountAmount > 0 || manualDiscountAmount > 0) ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontWeight: 600, borderTop: '1px dotted #ddd', paddingTop: 2 }}>
            <BiLabel ar="صافي قبل الضريبة" en="Net before VAT" bold />
            <span dir="ltr"><Money value={netBeforeVat} /></span>
          </div>
        ) : null}
        {deliveryFee > 0 ? (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0' }}>
            <BiLabel ar="رسوم التوصيل" en="Delivery Fee" />
            <span dir="ltr"><Money value={deliveryFee} /></span>
          </div>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0' }}>
          <BiLabel ar={`ضريبة القيمة المضافة (${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%)`} en={`VAT (${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%)`} />
          <span dir="ltr"><Money value={vat} /></span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', fontWeight: 800, fontSize: 13, borderTop: '1px dashed #999', marginTop: 2, color: primary }}>
          <BiLabel ar="الإجمالي" en="Total" bold size={13} />
          <span dir="ltr"><Money value={total} /></span>
        </div>

        {/* ─── طرق السداد / حالة السداد ─── */}
        <div style={{ borderTop: '1px dotted #ccc', marginTop: 4, paddingTop: 4 }}>
          {saleType === 'PLATFORM' ? (
            /* بيع منصة: آجل على المنصة — لا نطبع العمولة للعميل */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <BiLabel ar="طريقة السداد" en="Payment Method" size={9} />
                <span style={{ textAlign: 'left' }}>
                  <BiLabel ar="آجل" en="Credit" align="end" bold />
                  {platformName ? <span style={{ display: 'block', fontSize: 8, color: '#777' }}>{platformName}</span> : null}
                </span>
              </div>
              {balance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                  <BiLabel ar="المبلغ المستحق" en="Amount Due" bold />
                  <span dir="ltr"><Money value={balance} /></span>
                </div>
              ) : null}
            </>
          ) : cashReceived > 0 ? (
            /* بيع نقدي: المستلم + الباقي */
            <>
              <div style={{ fontSize: 9, color: '#666', marginBottom: 2, fontWeight: 700 }}>
                طريقة السداد <span dir="ltr" style={{ color: '#999' }}>/ Payment Method</span>
              </div>
              {appliedPayments.map((p, i) => {
                const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontSize: 10 }}>
                    <BiLabel ar={label.ar} en={label.en} size={9} />
                    <span dir="ltr"><Money value={p.amount} /></span>
                  </div>
                );
              })}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <BiLabel ar="المدفوع" en="Paid" size={9} />
                <span dir="ltr"><Money value={cashReceived} /></span>
              </div>
              {change > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontWeight: 700, color: '#1d4ed8' }}>
                  <BiLabel ar="الباقي" en="Change" bold />
                  <span dir="ltr"><Money value={change} /></span>
                </div>
              ) : null}
            </>
          ) : paid > 0 ? (
            /* مدفوع جزئياً أو كلياً بدون cashReceived */
            <>
              <div style={{ fontSize: 9, color: '#666', marginBottom: 2, fontWeight: 700 }}>
                طريقة السداد <span dir="ltr" style={{ color: '#999' }}>/ Payment Method</span>
              </div>
              {appliedPayments.map((p, i) => {
                const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
                return (
                  <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontSize: 10 }}>
                    <BiLabel ar={label.ar} en={label.en} size={9} />
                    <span dir="ltr"><Money value={p.amount} /></span>
                  </div>
                );
              })}
              {balance > 0 ? (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                  <BiLabel ar="المبلغ المستحق" en="Amount Due" bold />
                  <span dir="ltr"><Money value={balance} /></span>
                </div>
              ) : null}
            </>
          ) : balance > 0 ? (
            /* آجل بدون منصة */
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', padding: '1px 0', fontSize: 10, color: '#666' }}>
                <BiLabel ar="طريقة السداد" en="Payment Method" size={9} />
                <BiLabel ar="آجل" en="Credit" align="end" bold />
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1px 0', fontWeight: 700, color: '#b91c1c' }}>
                <BiLabel ar="المبلغ المستحق" en="Amount Due" bold />
                <span dir="ltr"><Money value={balance} /></span>
              </div>
            </>
          ) : null}
        </div>
      </div>

      {/* ─── QR رمز ZATCA ─── */}
      {qrPayload ? (
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 6 }}>
          <img src={zatcaQrImageUrl(qrPayload, 100)} alt="ZATCA QR" style={{ width: 100, height: 100, display: 'block' }} />
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#999', fontSize: 9, margin: '6px 0 2px' }}>{lightDivider}</div>

      {/* ─── التذييل ─── */}
      <div style={{ textAlign: 'center', fontSize: 10, fontWeight: 700, color: accent }}>
        {(settings.receiptFooterMessage)
          ? settings.receiptFooterMessage.split('\n')[0]
          : 'شكراً لزيارتكم'}
      </div>
      {!settings.receiptFooterMessage ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 9, color: '#666' }}>Thank you for visiting</div>
      ) : null}
      {(settings.receiptFooterMessage
        ? settings.receiptFooterMessage.split('\n')[1]
        : 'نتمنى لكم وجبة شهية')
        ? <div style={{ textAlign: 'center', fontSize: 9, color: '#666' }}>
            {(settings.receiptFooterMessage
              ? settings.receiptFooterMessage.split('\n')[1]
              : 'نتمنى لكم وجبة شهية / We hope you enjoyed your meal')}
          </div>
        : null}
      {settings.phone ? (
        <div style={{ textAlign: 'center', fontSize: 9, color: '#888', marginTop: 2 }}>
          {'للاستفسارات / Inquiries'}: <span dir="ltr">{settings.phone}</span>
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