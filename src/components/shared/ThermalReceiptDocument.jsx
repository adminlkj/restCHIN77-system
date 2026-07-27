import React from 'react';
import { formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { buildZatcaQrPayload, zatcaQrImageUrl } from '@/lib/zatcaQr';

// ═══════════════════════════════════════════════════════════════════════
// مستند إيصال حراري مُحكم — مُصمّم للعمل على كل الطابعات الحرارية
// (القديمة والجديدة، 58mm و 80mm).
//
// مبادئ التصميم:
//  1. عرض ضيق + خط صغير = طباعة سريعة وواضحة.
//  2. كل صف تسمية + قيمة بـ gap صغير ثابت (لا space-between يُترك فراغ).
//  3. محاذاة موحدة: الترويسة والتذييل بالوسط، التفاصيل بمحاذاة start.
//  4. خط monospace للأرقام ليصطفّ عمودياً بدقة على الطابعة.
//  5. فاصل نصي واحد (لا إطارات/خلفيات تستهلك الحبر).
// ═══════════════════════════════════════════════════════════════════════

const _TYPE_LABEL = {
  CONSTRUCTION: { ar: 'صالة', en: 'Dine-in' },
  SERVICE: { ar: 'توصيل', en: 'Delivery' },
  RENTAL: { ar: 'حجز', en: 'Reservation' },
};

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
  const settings = settingsProp || {};
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';

  const c = client || {};
  const customerName = invoice.clientName || c.nameAr || c.name || (rtl ? 'زبون نقدي' : 'Cash Customer');

  // ─── إعدادات الطباعة (يتحكم بها المستخدم من شاشة الإعدادات) ───
  // قيم افتراضية مُحكمة تناسب كل الطابعات الحرارية.
  const fontW = Number(settings.thermalFontWeight) || 700;
  const fontS = Number(settings.thermalFontSize) || 10;
  const recW = Number(settings.thermalReceiptWidth) || 240;
  const lineH = Number(settings.thermalLineHeight) || 1.35;
  const inkSaving = settings.thermalInkSaving === true;
  const secondaryColor = inkSaving ? '#666' : '#000';
  const secondaryFontW = inkSaving ? 400 : Math.max(fontW - 100, 400);

  const subtotal = invoice.subtotal != null
    ? Number(invoice.subtotal)
    : Math.max(0, (Number(invoice.totalAmount) || 0) - (Number(invoice.vatAmount) || 0) - (Number(invoice.deliveryFee) || 0) + (Number(invoice.discountAmount) || 0));
  let notesObj = {};
  try {
    notesObj = typeof invoice.notes === 'string' && invoice.notes.trim().startsWith('{')
      ? JSON.parse(invoice.notes)
      : (typeof invoice.notes === 'object' && invoice.notes ? invoice.notes : {});
  } catch { notesObj = {}; }
  const customerDiscountAmount = Number(notesObj.customerDiscountAmount || invoice.customerDiscountAmount || 0);
  const manualDiscountAmount = Number(notesObj.manualDiscount?.amount || invoice.manualDiscountAmount || 0);
  const discountAmount = invoice.discountAmount || (customerDiscountAmount + manualDiscountAmount);
  const discountPercentage = invoice.discountPercentage || 0;
  const deliveryFee = invoice.deliveryFee || Number(notesObj.deliveryFee) || 0;
  const netBeforeVat = Math.max(0, subtotal - discountAmount);
  const vat = invoice.vatAmount || 0;
  const total = invoice.totalAmount || 0;
  const paid = invoice.paidAmount || 0;
  const balance = total - paid;
  const cashReceived = Number(notesObj.cashReceived) || 0;
  const change = cashReceived > total ? cashReceived - total : (paid > total ? paid - total : 0);
  const items = resolveLineItems(invoice, notesObj, lang);

  const saleType = notesObj.saleType || invoice.saleType || '';
  const platformName = invoice.platformName || notesObj.platform?.platformName || '';

  const PAYMENT_LABELS = {
    CASH: { ar: 'نقداً', en: 'Cash' },
    CARD_MADA: { ar: 'مدى', en: 'Mada' },
    CARD_VISA: { ar: 'فيزا', en: 'Visa' },
    CARD_MC: { ar: 'ماستركارد', en: 'Mastercard' },
    CARD_OTHER: { ar: 'بطاقة أخرى', en: 'Other Card' },
    BANK: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
    CREDIT: { ar: 'آجل', en: 'Credit' },
  };
  let appliedPayments = [];
  const rawPayments = Array.isArray(notesObj.payments) ? notesObj.payments : (Array.isArray(invoice.payments) ? invoice.payments : []);
  const mergedPayments = {};
  for (const p of rawPayments) {
    const m = p.method || p.type || 'CASH';
    mergedPayments[m] = (mergedPayments[m] || 0) + (parseFloat(p.amount) || 0);
  }
  appliedPayments = Object.entries(mergedPayments).map(([method, amount]) => ({ method, amount: +amount.toFixed(2) }));

  // التاريخ والوقت بصيغة مختصرة.
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
  const dateOnly = dateTime.split(' ')[0] || '';
  const timeOnly = dateTime.split(' ')[1] || '';

  const qrPayload = settings.showQr !== false && settings.vatNumber
    ? buildZatcaQrPayload({
        sellerName: settings.companyName,
        vatNumber: settings.vatNumber,
        timestamp: invoice.date ? new Date(invoice.date).toISOString() : new Date().toISOString(),
        total,
        vatTotal: vat,
      })
    : null;

  // عرض المبلغ برمز الريال — خط monospace للأرقام ليصطفّ عمودياً.
  const Money = ({ value }) => (
    <span dir="ltr" style={{ whiteSpace: 'nowrap', fontFamily: "'Tahoma', monospace", fontVariantNumeric: 'tabular-nums' }}>
      {formatNumber(value)}
      <span style={{ fontFamily: "'saudi_riyal'", margin: '0 1px' }}>{RIYAL_SYMBOL}</span>
    </span>
  );

  // صف تفاصيل: تسمية + قيمة بـ gap صغير ثابت (لا space-between).
  // التسمية تأخذ عرضاً ثابتاً، والقيمة تليها مباشرة.
  const Row = ({ label, labelEn, children, strong }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px', padding: '0' }}>
      <span style={{ flexShrink: 0, fontWeight: strong ? fontW : 'inherit', color: '#000' }}>
        {rtl ? label : (labelEn || label)}
        {!rtl && labelEn ? '' : ''}
      </span>
      <span style={{ flex: 1, borderBottom: '1px dotted #ccc', marginBottom: '2px', minWidth: '8px' }} />
      <span dir="ltr" style={{ textAlign: 'end', fontWeight: strong ? fontW : 'inherit', flexShrink: 0 }}>
        {children}
      </span>
    </div>
  );

  // صف ثنائي اللغة مختصر: العربية فقط (الإنجليزية اختيارية أصغر تحتها).
  const BiRow = ({ arLabel, enLabel, value, valueEn }) => (
    <div style={{ padding: '0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: '6px' }}>
        <span style={{ flexShrink: 0 }}>
          {rtl ? arLabel : (enLabel || arLabel)}
        </span>
        <span style={{ flex: 1, borderBottom: '1px dotted #ccc', marginBottom: '2px', minWidth: '8px' }} />
        <span dir="ltr" style={{ textAlign: 'end', flexShrink: 0 }}>
          {value}
        </span>
      </div>
    </div>
  );

  // فاصل نصي بسيط — أحرف متّصلة تناسب عرض الإيصال.
  const dividerChars = Math.floor(recW / 7);
  const divider = '─'.repeat(dividerChars);

  return (
    <div
      ref={innerRef}
      dir={dir}
      style={{
        background: '#fff',
        color: '#000',
        fontFamily: "'Tahoma', 'Cairo', sans-serif",
        fontWeight: fontW,
        fontSize: fontS,
        lineHeight: lineH,
        width: `${recW}px`,
        maxWidth: `${recW}px`,
        margin: '0 auto',
        padding: '2px',
        direction: dir,
      }}
      data-thermal-settings={JSON.stringify({ fontW, fontS, recW, lineH, inkSaving })}
    >
      {/* ═══ الترويسة — كلها بالوسط، خط أكبر قليلاً ═══ */}
      {(() => {
        const enabled = settings.thermalLogoEnabled !== false;
        if (!enabled) return null;
        const source = settings.thermalLogoSource || 'BRANCH';
        const logoUrl = source === 'CUSTOM' ? (settings.thermalLogoUrl || '') : (settings.logoUrl || '');
        if (!logoUrl) return null;
        const lw = Math.min(Number(settings.thermalLogoWidth) || 140, recW - 10);
        const lh = Math.min(Number(settings.thermalLogoHeight) || 70, 100);
        return (
          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
            <img src={logoUrl} alt="logo" style={{ maxWidth: `${lw}px`, maxHeight: `${lh}px`, display: 'inline-block' }} />
          </div>
        );
      })()}

      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: fontS + 2, marginBottom: '1px' }}>
        {settings.companyName || ''}
      </div>
      {settings.companyNameEn ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW, marginBottom: '1px' }}>
          {settings.companyNameEn}
        </div>
      ) : null}
      {settings.crNumber ? (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW }}>
          {rtl ? 'س.تجاري' : 'CR'}: <span dir="ltr">{settings.crNumber}</span>
        </div>
      ) : null}
      {settings.vatNumber ? (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW, marginBottom: '1px' }}>
          {rtl ? 'رقم ضريبي' : 'VAT'}: <span dir="ltr">{settings.vatNumber}</span>
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#000', fontSize: fontS - 2, margin: '2px 0' }}>{divider}</div>

      {/* ═══ بيانات الفرع — بالوسط ═══ */}
      {settings.branchName ? (
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: fontS, marginBottom: '1px' }}>
          {settings.branchName}{settings.branchNameEn ? ` · ${settings.branchNameEn}` : ''}
        </div>
      ) : null}
      {(settings.city || settings.address) ? (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW }}>
          {[settings.city, settings.address && settings.address !== settings.city ? settings.address : ''].filter(Boolean).join(' - ')}
        </div>
      ) : null}
      {settings.phone ? (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW, marginBottom: '1px' }}>
          <span dir="ltr">{settings.phone}{settings.phone2 ? ` · ${settings.phone2}` : ''}</span>
        </div>
      ) : null}

      <div style={{ textAlign: 'center', color: '#000', fontSize: fontS - 2, margin: '2px 0' }}>{divider}</div>

      {/* ═══ تفاصيل الإيصال — صفوف مُحكمة بفاصل منقّط ═══ */}
      <div style={{ fontSize: fontS - 1 }}>
        <Row label={rtl ? 'الإيصال' : 'Receipt'}>{invoice.invoiceNo || '—'}</Row>
        <Row label={rtl ? 'التاريخ' : 'Date'}>{dateOnly}</Row>
        <Row label={rtl ? 'الوقت' : 'Time'}>{timeOnly}</Row>
        <Row label={rtl ? 'النوع' : 'Type'}>
          {(() => {
            const ot = saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY'
              ? (rtl ? 'توصيل' : 'Delivery')
              : saleType === 'TAKEAWAY'
                ? (rtl ? 'استلام' : 'Takeaway')
                : (rtl ? 'صالة' : 'Dine-in');
            return ot;
          })()}
        </Row>
        <Row label={rtl ? 'الزبون' : 'Customer'}>{customerName}</Row>
        {invoice.cashier ? <Row label={rtl ? 'الكاشير' : 'Cashier'}>{invoice.cashier}</Row> : null}
        {saleType !== 'PLATFORM' && saleType !== 'DIRECT_DELIVERY' && invoice.tableNo
          ? <Row label={rtl ? 'الطاولة' : 'Table'}>{invoice.tableNo}</Row> : null}
        {platformName && (saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY')
          ? <Row label={rtl ? 'المنصة' : 'Platform'}>{platformName}</Row> : null}
      </div>

      <div style={{ textAlign: 'center', color: '#000', fontSize: fontS - 2, margin: '2px 0' }}>{divider}</div>

      {/* ═══ بنود الطلب — جدول مُحكم بدون فراغات ═══ */}
      <div>
        <div style={{ display: 'flex', fontWeight: 800, fontSize: fontS - 2, borderBottom: '1px solid #000', paddingBottom: '1px', marginBottom: '1px' }}>
          <span style={{ width: '18px', textAlign: 'center' }}>#</span>
          <span style={{ flex: 1, textAlign: rtl ? 'right' : 'left' }}>{rtl ? 'الصنف' : 'Item'}</span>
          <span style={{ width: '24px', textAlign: 'center' }}>{rtl ? 'كمية' : 'Qty'}</span>
          <span style={{ width: '52px', textAlign: 'end' }}>{rtl ? 'الإجمالي' : 'Total'}</span>
        </div>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', fontSize: fontS - 1, padding: '1px 0', alignItems: 'flex-start' }}>
            <span style={{ width: '18px', textAlign: 'center', color: secondaryColor }}>{i + 1}</span>
            <span style={{ flex: 1, textAlign: rtl ? 'right' : 'left', wordBreak: 'break-word', paddingInlineEnd: '4px' }}>
              {rtl ? (it.description || it.name) : (it.descriptionEn || it.description || it.name)}
              {it.qty > 1 ? (
                <span dir="ltr" style={{ fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW }}>
                  {' '}×{it.qty}{' '}@<Money value={it.unitPrice} />
                </span>
              ) : null}
            </span>
            <span style={{ width: '52px', textAlign: 'end' }} dir="ltr">
              <Money value={it.total} />
            </span>
          </div>
        ))}
      </div>

      <div style={{ textAlign: 'center', color: '#000', fontSize: fontS - 2, margin: '2px 0' }}>{divider}</div>

      {/* ═══ الإجماليات — صفوف مُحكمة ═══ */}
      <div style={{ fontSize: fontS - 1 }}>
        <Row label={rtl ? 'المجموع' : 'Subtotal'}><Money value={subtotal} /></Row>
        {customerDiscountAmount > 0 ? (
          <Row label={rtl ? `خصم (${Math.round(discountPercentage)}%)` : `Disc (${Math.round(discountPercentage)}%)`}>
            <span style={{ color: '#000' }}>-<Money value={customerDiscountAmount} /></span>
          </Row>
        ) : null}
        {manualDiscountAmount > 0 ? (
          <Row label={rtl ? 'خصم إضافي' : 'Extra Disc'}>
            <span style={{ color: '#000' }}>-<Money value={manualDiscountAmount} /></span>
          </Row>
        ) : null}
        {(customerDiscountAmount > 0 || manualDiscountAmount > 0) ? (
          <Row label={rtl ? 'صافي' : 'Net'}><Money value={netBeforeVat} /></Row>
        ) : null}
        {deliveryFee > 0 ? (
          <Row label={rtl ? 'توصيل' : 'Delivery'}><Money value={deliveryFee} /></Row>
        ) : null}
        <Row label={`${rtl ? 'ضريبة' : 'VAT'} ${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%`}>
          <Money value={vat} />
        </Row>
        <div style={{ display: 'flex', fontWeight: 800, fontSize: fontS + 1, borderTop: '1px solid #000', marginTop: '1px', paddingTop: '1px' }}>
          <span style={{ flex: 1 }}>{rtl ? 'الإجمالي' : 'TOTAL'}</span>
          <span dir="ltr" style={{ textAlign: 'end' }}><Money value={total} /></span>
        </div>
      </div>

      {/* ═══ طرق السداد — مُحكمة ═══ */}
      <div style={{ marginTop: '2px', fontSize: fontS - 1 }}>
        {appliedPayments.length > 0 ? (
          <>
            {appliedPayments.map((p, i) => {
              const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
              return (
                <Row key={i} label={rtl ? label.ar : label.en}><Money value={p.amount} /></Row>
              );
            })}
            <Row label={rtl ? 'المدفوع' : 'Paid'} strong><Money value={cashReceived > 0 ? cashReceived : paid} /></Row>
            {change > 0 ? (
              <Row label={rtl ? 'الباقي' : 'Change'} strong><Money value={change} /></Row>
            ) : null}
          </>
        ) : saleType === 'PLATFORM' ? (
          <>
            <Row label={rtl ? 'السداد' : 'Payment'}>{rtl ? 'آجل - منصة' : 'Credit - Platform'}</Row>
            {balance > 0 ? (
              <Row label={rtl ? 'مستحق' : 'Due'} strong><Money value={balance} /></Row>
            ) : null}
          </>
        ) : balance > 0 ? (
          <>
            <Row label={rtl ? 'السداد' : 'Payment'}>{rtl ? 'آجل' : 'Credit'}</Row>
            <Row label={rtl ? 'مستحق' : 'Due'} strong><Money value={balance} /></Row>
          </>
        ) : null}
      </div>

      {/* ═══ QR رمز ZATCA ═══ */}
      {qrPayload ? (
        <div style={{ textAlign: 'center', marginTop: '3px' }}>
          <img src={zatcaQrImageUrl(qrPayload, 80)} alt="QR" style={{ width: 80, height: 80, display: 'inline-block' }} />
        </div>
      ) : null}

      {/* ═══ التذييل — بالوسط ═══ */}
      <div style={{ textAlign: 'center', marginTop: '2px' }}>
        <div style={{ fontWeight: 700, fontSize: fontS - 1 }}>
          {(settings.receiptFooterMessage)
            ? settings.receiptFooterMessage.split('\n')[0]
            : (rtl ? 'شكراً لزيارتكم' : 'Thank you for visiting')}
        </div>
        {!settings.receiptFooterMessage ? (
          <div dir="ltr" style={{ fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW }}>
            Thank you for visiting
          </div>
        ) : null}
        {(settings.receiptFooterMessage
          ? settings.receiptFooterMessage.split('\n')[1]
          : (rtl ? 'نتمنى لكم وجبة شهية' : ''))
          ? <div style={{ fontSize: fontS - 2, color: secondaryColor, fontWeight: secondaryFontW }}>
              {(settings.receiptFooterMessage
                ? settings.receiptFooterMessage.split('\n')[1]
                : (rtl ? 'نتمنى لكم وجبة شهية' : ''))}
            </div>
          : null}
      </div>
    </div>
  );
}
