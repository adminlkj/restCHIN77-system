import React from 'react';
import { formatNumber, formatDate, RIYAL_SYMBOL } from '@/lib/utils-binaa';
import { buildZatcaQrPayload, zatcaQrImageUrl } from '@/lib/zatcaQr';

// ═══════════════════════════════════════════════════════════════════════
// مستند إيصال حراري — تصميم عالمي ثنائي اللغة بخط Cairo.
//
// المبادئ المعتمدة في هذا الإصدار:
//  1. خط Cairo (نفس خط النظام بالكامل) — مظهر موحّد واحترافي.
//  2. ثنائية اللغة دائماً: العربية والإنجليزية معاً في كل سطر، الأولوية
//     للغة النظام (RTL إن كانت العربية، LTR إن كانت الإنجليزية).
//  3. عرض ذكي يناسب كل الطابعات (220px افتراضياً، 58mm/80mm).
//  4. خطوط فصل خفيفة (dashed/dotted) بدل المساحات الفارغة — تنظيم عالمي.
//  5. كل صف في سطر واحد: التسمية + القيمة بمحاذاة طبيعية، بدون space-between.
// ═══════════════════════════════════════════════════════════════════════

function resolveLineItems(invoice, notesObj) {
  if (Array.isArray(invoice.lineItems) && invoice.lineItems.length) return invoice.lineItems;
  if (Array.isArray(notesObj?.items) && notesObj.items.length) return notesObj.items;
  const net = (invoice.totalAmount || 0) - (invoice.vatAmount || 0);
  return [{ description: 'Items value', qty: 1, unitPrice: net, total: net }];
}

export default function ThermalReceiptDocument({ invoice, settings: settingsProp, client, lang = 'ar', innerRef }) {
  if (!invoice) return null;
  const settings = settingsProp || {};
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';

  const c = client || {};
  const customerName = invoice.clientName || c.nameAr || c.name || (rtl ? 'زبون نقدي' : 'Cash Customer');

  // ─── إعدادات الطباعة ───
  const fontW = Number(settings.thermalFontWeight) || 700;
  const fontS = Number(settings.thermalFontSize) || 10;
  const recW = Number(settings.thermalReceiptWidth) || 220;
  const lineH = Number(settings.thermalLineHeight) || 1.4;
  const inkSaving = settings.thermalInkSaving === true;
  const lightColor = inkSaving ? '#777' : '#555';

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
  const items = resolveLineItems(invoice, notesObj);

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
  const rawPayments = Array.isArray(notesObj.payments) ? notesObj.payments : (Array.isArray(invoice.payments) ? invoice.payments : []);
  const mergedPayments = {};
  for (const p of rawPayments) {
    const m = p.method || p.type || 'CASH';
    mergedPayments[m] = (mergedPayments[m] || 0) + (parseFloat(p.amount) || 0);
  }
  const appliedPayments = Object.entries(mergedPayments).map(([method, amount]) => ({ method, amount: +amount.toFixed(2) }));

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

  // عرض المبلغ برمز الريال.
  const Money = ({ value }) => (
    <span dir="ltr" style={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', display: 'inline-flex', alignItems: 'baseline' }}>
      {/* رمز العملة على اليسار (قبل الرقم) ليظهر بشكل صحيح في الطباعة. */}
      <span style={{ fontFamily: "'saudi_riyal'", marginInlineEnd: '1px' }}>{RIYAL_SYMBOL}</span>
      {formatNumber(value)}
    </span>
  );

  // ─── مكوّنات التصميم الثنائي اللغة ───
  // Bi: نص ثنائي اللغة في سطر واحد — العربية أولاً (RTL) أو الإنجليزية أولاً (LTR).
  // نمط العرض: "النص الأساسي · النص الثانوي" بنفس الاتجاه.
  const Bi = ({ ar, en, sep = ' · ' }) => (
    <span>
      <span dir={rtl ? 'rtl' : 'ltr'}>{rtl ? ar : en}</span>
      <span style={{ color: lightColor, fontSize: '0.85em', margin: '0 2px' }}>{sep}</span>
      <span dir={rtl ? 'ltr' : 'rtl'} style={{ color: lightColor, fontSize: '0.85em' }}>{rtl ? en : ar}</span>
    </span>
  );

  // BiRow: صف تفاصيل — تسمية ثنائية اللغة على اليمين/اليسار، قيمة على الطرف الآخر.
  // الفاصل خط خفيف (border-bottom dashed) بدل المسافات الفارغة.
  const BiRow = ({ arLabel, enLabel, children, strong }) => (
    <div style={{ display: 'flex', alignItems: 'baseline', padding: '0', borderBottom: '1px dashed #ddd' }}>
      <span style={{ flexShrink: 0, fontWeight: strong ? 800 : 'inherit' }}>
        <Bi ar={arLabel} en={enLabel} sep="" />
      </span>
      <span style={{ flex: 1 }} />
      <span dir="ltr" style={{ textAlign: 'end', fontWeight: strong ? 800 : 'inherit', flexShrink: 0, paddingInlineStart: '6px' }}>
        {children}
      </span>
    </div>
  );

  // Line: خط فصل خفيف — dashed أو متّصل، يناسب عرض الإيصال.
  const Line = ({ type = 'dashed' }) => (
    <div style={{
      borderTop: type === 'solid' ? '1px solid #000' : '1px dashed #999',
      margin: '2px 0',
    }} />
  );

  return (
    <div
      ref={innerRef}
      dir={dir}
      style={{
        background: '#fff',
        color: '#000',
        fontFamily: "'Cairo', 'Tahoma', sans-serif",
        fontWeight: fontW,
        fontSize: fontS,
        lineHeight: lineH,
        width: `${recW}px`,
        maxWidth: `${recW}px`,
        margin: '0 auto',
        padding: '3px',
        direction: dir,
      }}
      data-thermal-settings={JSON.stringify({ fontW, fontS, recW, lineH, inkSaving })}
    >
      {/* ═════════ الترويسة — ثنائية اللغة، بالوسط ═════════ */}
      {(() => {
        const enabled = settings.thermalLogoEnabled !== false;
        if (!enabled) return null;
        const source = settings.thermalLogoSource || 'BRANCH';
        const logoUrl = source === 'CUSTOM' ? (settings.thermalLogoUrl || '') : (settings.logoUrl || '');
        if (!logoUrl) return null;
        const lw = Math.min(Number(settings.thermalLogoWidth) || 130, recW - 10);
        const lh = Math.min(Number(settings.thermalLogoHeight) || 65, 90);
        return (
          <div style={{ textAlign: 'center', marginBottom: '2px' }}>
            <img src={logoUrl} alt="logo" style={{ maxWidth: `${lw}px`, maxHeight: `${lh}px`, display: 'inline-block' }} />
          </div>
        );
      })()}

      {/* اسم الشركة — العربية أولاً (أكبر) ثم الإنجليزية (أصغر) */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 800, fontSize: fontS + 2, lineHeight: 1.2 }}>
          {settings.companyName || ''}
        </div>
        {settings.companyNameEn ? (
          <div dir="ltr" style={{ fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
            {settings.companyNameEn}
          </div>
        ) : null}
      </div>

      {/* السجل التجاري + الرقم الضريبي — ثنائي اللغة في سطرين مدمجين */}
      {(settings.crNumber || settings.vatNumber) && (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: lightColor, fontWeight: 600, marginTop: '1px' }}>
          {settings.crNumber && (
            <div><Bi ar="السجل التجاري" en="CR" sep=" / " />: <span dir="ltr">{settings.crNumber}</span></div>
          )}
          {settings.vatNumber && (
            <div><Bi ar="الرقم الضريبي" en="VAT" sep=" / " />: <span dir="ltr">{settings.vatNumber}</span></div>
          )}
        </div>
      )}

      <Line />

      {/* ═════════ بيانات الفرع — ثنائي اللغة، بالوسط ═════════ */}
      {settings.branchName && (
        <div style={{ textAlign: 'center', fontWeight: 700, fontSize: fontS, lineHeight: 1.2 }}>
          {settings.branchName}{settings.branchNameEn ? <span style={{ color: lightColor, fontWeight: 600, fontSize: fontS - 1 }}> · {settings.branchNameEn}</span> : null}
        </div>
      )}
      {(settings.city || settings.address) && (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
          {[settings.city, settings.address && settings.address !== settings.city ? settings.address : ''].filter(Boolean).join(' - ')}
        </div>
      )}
      {settings.phone && (
        <div style={{ textAlign: 'center', fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
          <Bi ar="هاتف" en="Tel" sep=" / " />: <span dir="ltr">{settings.phone}{settings.phone2 ? ` · ${settings.phone2}` : ''}</span>
        </div>
      )}

      <Line />

      {/* ═════════ تفاصيل الإيصال — ثنائي اللغة بصفوف مدمجة ═════════ */}
      <div style={{ fontSize: fontS - 1 }}>
        <BiRow arLabel="الإيصال" enLabel="Receipt">{invoice.invoiceNo || '—'}</BiRow>
        <BiRow arLabel="التاريخ" enLabel="Date">{dateOnly}</BiRow>
        <BiRow arLabel="الوقت" enLabel="Time">{timeOnly}</BiRow>
        <BiRow arLabel="النوع" enLabel="Type">
          {(() => {
            const ot = saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY'
              ? { ar: 'توصيل', en: 'Delivery' }
              : saleType === 'TAKEAWAY'
                ? { ar: 'استلام', en: 'Takeaway' }
                : { ar: 'صالة', en: 'Dine-in' };
            return <Bi ar={ot.ar} en={ot.en} sep="" />;
          })()}
        </BiRow>
        <BiRow arLabel="الزبون" enLabel="Customer">{customerName}</BiRow>
        {invoice.cashier && <BiRow arLabel="الكاشير" enLabel="Cashier">{invoice.cashier}</BiRow>}
        {saleType !== 'PLATFORM' && saleType !== 'DIRECT_DELIVERY' && invoice.tableNo && (
          <BiRow arLabel="الطاولة" enLabel="Table">{invoice.tableNo}</BiRow>
        )}
        {platformName && (saleType === 'PLATFORM' || saleType === 'DIRECT_DELIVERY') && (
          <BiRow arLabel="المنصة" enLabel="Platform">{platformName}</BiRow>
        )}
      </div>

      <Line type="solid" />

      {/* ═════════ بنود الطلب — رأس ثنائي اللغة + صفوف مدمجة ═════════ */}
      <div>
        {/* رأس الأعمدة — ثنائي اللغة */}
        <div style={{ display: 'flex', fontWeight: 800, fontSize: fontS - 2, borderBottom: '1px solid #000', paddingBottom: '1px' }}>
          <span style={{ width: '16px', textAlign: 'center' }}>#</span>
          <span style={{ flex: 1, textAlign: rtl ? 'right' : 'left' }}>
            <Bi ar="الصنف" en="Item" sep="" />
          </span>
          <span style={{ width: '22px', textAlign: 'center' }}>
            <Bi ar="كمية" en="Qty" sep="" />
          </span>
          <span style={{ width: '48px', textAlign: 'end' }}>
            <Bi ar="الإجمالي" en="Total" sep="" />
          </span>
        </div>
        {/* البنود — أعمدة متناسقة مع الترويسة */}
        {items.map((it, i) => {
          const nameAr = it.description || it.name || '';
          const nameEn = it.descriptionEn || it.description || it.name || '';
          return (
            <div key={i} style={{ padding: '1px 0', borderBottom: '1px dotted #eee' }}>
              {/* صف واحد بكل الأعمدة المتناسقة مع الترويسة */}
              <div style={{ display: 'flex', alignItems: 'flex-start', fontSize: fontS - 1 }}>
                {/* عمود # */}
                <span style={{ width: '16px', textAlign: 'center', color: lightColor }}>{i + 1}</span>
                {/* عمود الصنف */}
                <span style={{ flex: 1, textAlign: rtl ? 'right' : 'left', paddingInlineEnd: '4px' }}>
                  <span dir={rtl ? 'rtl' : 'ltr'}>{rtl ? nameAr : nameEn}</span>
                  {nameEn && nameEn !== nameAr ? (
                    <span dir={rtl ? 'ltr' : 'rtl'} style={{ display: 'block', fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
                      {rtl ? nameEn : nameAr}
                    </span>
                  ) : null}
                </span>
                {/* عمود الكمية — يظهر دائماً في مكانه */}
                <span style={{ width: '22px', textAlign: 'center', fontWeight: 700 }}>{it.qty ?? 1}</span>
                {/* عمود الإجمالي */}
                <span style={{ width: '48px', textAlign: 'end' }} dir="ltr">
                  <Money value={it.total} />
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <Line type="solid" />

      {/* ═════════ الإجماليات — صفوف ثنائية اللغة ═════════ */}
      <div style={{ fontSize: fontS - 1 }}>
        <BiRow arLabel="المجموع" enLabel="Subtotal"><Money value={subtotal} /></BiRow>
        {customerDiscountAmount > 0 && (
          <BiRow arLabel={`خصم (${Math.round(discountPercentage)}%)`} enLabel={`Disc (${Math.round(discountPercentage)}%)`}>
            -<Money value={customerDiscountAmount} />
          </BiRow>
        )}
        {manualDiscountAmount > 0 && (
          <BiRow arLabel="خصم إضافي" enLabel="Extra Disc">-<Money value={manualDiscountAmount} /></BiRow>
        )}
        {(customerDiscountAmount > 0 || manualDiscountAmount > 0) && (
          <BiRow arLabel="صافي" enLabel="Net"><Money value={netBeforeVat} /></BiRow>
        )}
        {deliveryFee > 0 && (
          <BiRow arLabel="توصيل" enLabel="Delivery"><Money value={deliveryFee} /></BiRow>
        )}
        <BiRow arLabel={`ضريبة ${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%`} enLabel={`VAT ${invoice.vatRate ? Math.round(invoice.vatRate * 100) : 15}%`}>
          <Money value={vat} />
        </BiRow>
        {/* الإجمالي — مميّز بخط أسمك وفاصل متّصل */}
        <div style={{ borderTop: '1px solid #000', marginTop: '1px', paddingTop: '1px' }}>
          <div style={{ display: 'flex', fontWeight: 800, fontSize: fontS + 1 }}>
            <span style={{ flex: 1 }}><Bi ar="الإجمالي" en="TOTAL" sep="" /></span>
            <span dir="ltr" style={{ textAlign: 'end' }}><Money value={total} /></span>
          </div>
        </div>
      </div>

      {/* ═════════ طرق السداد — ثنائي اللغة ═════════ */}
      <div style={{ marginTop: '2px', fontSize: fontS - 1 }}>
        {appliedPayments.length > 0 ? (
          <>
            {appliedPayments.map((p, i) => {
              const label = PAYMENT_LABELS[p.method] || { ar: p.method, en: p.method };
              return <BiRow key={i} arLabel={label.ar} enLabel={label.en}><Money value={p.amount} /></BiRow>;
            })}
            <BiRow arLabel="المدفوع" enLabel="Paid" strong><Money value={cashReceived > 0 ? cashReceived : paid} /></BiRow>
            {change > 0 && <BiRow arLabel="الباقي" enLabel="Change" strong><Money value={change} /></BiRow>}
          </>
        ) : saleType === 'PLATFORM' ? (
          <>
            <BiRow arLabel="السداد" enLabel="Payment"><Bi ar="آجل - منصة" en="Credit - Platform" sep="" /></BiRow>
            {balance > 0 && <BiRow arLabel="مستحق" enLabel="Due" strong><Money value={balance} /></BiRow>}
          </>
        ) : balance > 0 ? (
          <>
            <BiRow arLabel="السداد" enLabel="Payment"><Bi ar="آجل" en="Credit" sep="" /></BiRow>
            <BiRow arLabel="مستحق" enLabel="Due" strong><Money value={balance} /></BiRow>
          </>
        ) : null}
      </div>

      {/* ═════════ QR رمز ZATCA ═════════ */}
      {qrPayload && (
        <div style={{ textAlign: 'center', marginTop: '3px' }}>
          <img src={zatcaQrImageUrl(qrPayload, 75)} alt="QR" style={{ width: 75, height: 75, display: 'inline-block' }} />
        </div>
      )}

      <Line />

      {/* ═════════ التذييل — ثنائي اللغة، بالوسط ═════════ */}
      <div style={{ textAlign: 'center', marginTop: '1px' }}>
        <div style={{ fontWeight: 700, fontSize: fontS - 1 }}>
          {(settings.receiptFooterMessage)
            ? settings.receiptFooterMessage.split('\n')[0]
            : (rtl ? 'شكراً لزيارتكم' : 'Thank you for visiting')}
        </div>
        {!settings.receiptFooterMessage && (
          <div dir={rtl ? 'ltr' : 'rtl'} style={{ fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
            {rtl ? 'Thank you for visiting' : 'شكراً لزيارتكم'}
          </div>
        )}
        {(settings.receiptFooterMessage
          ? settings.receiptFooterMessage.split('\n')[1]
          : (rtl ? 'نتمنى لكم وجبة شهية' : '')
        ) && (
          <div style={{ fontSize: fontS - 2, color: lightColor, fontWeight: 600 }}>
            {settings.receiptFooterMessage
              ? settings.receiptFooterMessage.split('\n')[1]
              : (rtl ? 'نتمنى لكم وجبة شهية' : 'We hope you enjoyed your meal')}
          </div>
        )}
      </div>
    </div>
  );
}
