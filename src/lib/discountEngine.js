// ═══════════════════════════════════════════════════════════════════════
// محرّك خصومات المطعم — Restaurant Discount Engine
//
// قواعد نهائية (Restaurant Discount Rules):
//
// القاعدة 1 — العميل النقدي (زبون نقدي / غير مسجل):
//   - لا يحصل على أي خصم عميل.
//   - Customer Discount = 0%
//   - Manual Discount = Disabled (إلا لمنصة)
//
// القاعدة 2 — العميل المسجل:
//   - النظام يجلب discountPercentage من بطاقة العميل تلقائياً.
//   - يُطبّق على الفاتورة كاملة (لا يُعدّل من POS).
//   - مصدر الخصم = Client.discountPercentage فقط.
//
// القاعدة 3 — البيع عبر المنصات (استثناء):
//   - فاتورة المنصة (هنقرستيشن/مرسول/طلبات/جاهز/تويو) يُسمح لها بخصم يدوي
//     (كوبون/حملة/خصم تسويقي/تعويض).
//   - باقي أنواع البيع (صالة/سفري/توصيل مباشر) = لا خصم يدوي.
//
// القاعدة 4 — الخصم على الفاتورة لا على الأصناف:
//   - لا يوجد خصم على مستوى السطر (حتى تُبنى شاشة العروض مستقبلاً).
//   - كل الخصومات تُطبّق على إجمالي الفاتورة قبل الضريبة.
//
// القاعدة 5 — ترتيب الاحتساب:
//   Subtotal → Customer Discount → Manual Discount (Platform Only) →
//   Taxable Amount → VAT → Grand Total
//
// القاعدة 6 — لا جمع بين نوعين (إلا للمنصات):
//   - Customer Discount + Manual Discount مسموح فقط لفواتير المنصات.
//   - غير ذلك: لا خصم يدوي إطلاقاً.
//
// القاعدة 7 — مصدر الخصم = Client.discountPercentage:
//   - لا يُعدّل من POS، فقط من شاشة الزبائن → بطاقة العميل → نسبة الخصم.
//
// القاعدة 8 — الخصومات المستقبلية:
//   - خصم الصنف يُدار من شاشة "العروض والفعاليات" مستقبلاً (Promotions).
//   - حالياً: لا خصم على مستوى الصنف إطلاقاً.
// ═══════════════════════════════════════════════════════════════════════

/**
 * هل العميل نقدي (لا خصم له)؟
 * العميل النقدي = isCash === true، أو لا يوجد عميل أصلاً (زبون نقدي افتراضي).
 */
export function isCashCustomer(customer) {
  if (!customer) return true; // لا يوجد عميل = زبون نقدي
  return customer.isCash === true;
}

/**
 * نسبة خصم العميل المسجّل (تُطبّق تلقائياً).
 * العميل النقدي = 0% دائماً (القاعدة 1).
 * العميل المسجّل = customer.discountPercentage (القاعدة 2).
 */
export function getCustomerDiscountPct(customer) {
  if (isCashCustomer(customer)) return 0;
  const pct = parseFloat(customer?.discountPercentage) || 0;
  return Math.max(0, pct);
}

/**
 * هل البيع عبر منصة توصيل؟ (القاعدة 3)
 * isPlatformSale = true فقط عندما يكون هناك platformId محدّد (ليس توصيل مباشر).
 */
export function isPlatformInvoice({ isPlatformSale }) {
  return !!isPlatformSale;
}

/**
 * هل يُسمح بالخصم اليدوي لهذه الفاتورة؟ (القواعد 3 + 6)
 * يُسمح فقط لفواتير المنصات. باقي أنواع البيع = ممنوع.
 */
export function canApplyManualDiscount({ isPlatformSale }) {
  return isPlatformInvoice({ isPlatformSale });
}

/**
 * هل يُسمح بخصم العميل لهذه الفاتورة؟ (القواعد 1 + 2)
 * يُسمح دائماً (يُطبّق تلقائياً إن وُجد)، لكن النتيجة 0% للعميل النقدي.
 * لا يُسمح بتعديله يدوياً — يأتي من بطاقة العميل فقط.
 */
export function canApplyCustomerDiscount(customer) {
  // خصم العميل سياسة سعر، يُطبّق تلقائياً — لا حاجة لتمكين/تعطيل يدوي.
  return !isCashCustomer(customer);
}

/**
 * الحساب النهائي للفاتورة وفق ترتيب القاعدة 5:
 *
 *   Subtotal (مجموع الأصناف بأسعارها الكاملة، بدون خصم صنف)
 *     ↓
 *   Customer Discount (نسبة من Subtotal — تلقائي من بطاقة العميل)
 *     ↓
 *   Manual Discount (للمنصات فقط — مبلغ أو نسبة على ما تبقّى)
 *     ↓
 *   Taxable Amount = Subtotal - Customer Discount - Manual Discount
 *     ↓
 *   + Delivery Fee (إن وُجدت — تُضاف للوعاء الضريبي)
 *     ↓
 *   VAT Base = Taxable Amount + Delivery Fee
 *     ↓
 *   VAT = VAT Base × 15%
 *     ↓
 *   Grand Total = VAT Base + VAT
 *
 * @param {Object} params
 * @param {Array}  params.cart — [{ itemId, name, nameEn, price, qty }]
 *   (لا حقل discount على الصنف — القاعدة 4)
 * @param {Object} params.customer — كائن العميل (مع isCash, discountPercentage) أو null
 * @param {Object} params.manualDiscount — { type: 'AMOUNT'|'PERCENT', value: number }
 *   (يُتجاهل تماماً إذا لم تكن فاتورة منصة)
 * @param {number} params.deliveryFee — رسوم التوصيل (0 افتراضياً)
 * @param {boolean} params.isPlatformSale — هل فاتورة منصة؟
 * @param {number} params.vatRate — 0.15 افتراضياً
 * @returns {Object} — { subtotal, customerDiscountPct, customerDiscountAmount,
 *   manualDiscountAllowed, manualDiscountAmount, discountAmount, taxableAmount,
 *   deliveryFee, vatBase, vat, total }
 */
export function computeInvoiceTotals({
  cart = [],
  customer = null,
  manualDiscount = { type: 'AMOUNT', value: 0 },
  deliveryFee = 0,
  isPlatformSale = false,
  vatRate = 0.15,
}) {
  // (1) Subtotal = مجموع الأصناف بأسعارها الكاملة (لا خصم على الصنف — القاعدة 4)
  const subtotal = cart.reduce(
    (s, c) => s + (parseFloat(c.price) || 0) * (parseFloat(c.qty) || 0),
    0
  );

  // (2) Customer Discount — تلقائي من بطاقة العميل (القاعدة 2 + 7)
  //     العميل النقدي = 0% (القاعدة 1)
  const customerDiscountPct = getCustomerDiscountPct(customer);
  const customerDiscountAmount = +(subtotal * (customerDiscountPct / 100)).toFixed(2);
  const afterCustomerDiscount = Math.max(0, subtotal - customerDiscountAmount);

  // (3) Manual Discount — للمنصات فقط (القواعد 3 + 6)
  const manualDiscountAllowed = canApplyManualDiscount({ isPlatformSale });
  let manualDiscountAmount = 0;
  if (manualDiscountAllowed) {
    const v = parseFloat(manualDiscount?.value) || 0;
    if (v > 0) {
      if (manualDiscount?.type === 'PERCENT') {
        // نُقيّد النسبة بين 0 و100 لتفادي قيم مخرَجة أعلى من الإجمالي (مثال: 150%).
        const pct = Math.min(Math.max(v, 0), 100);
        manualDiscountAmount = +(afterCustomerDiscount * (pct / 100)).toFixed(2);
      } else {
        // AMOUNT — لا يتجاوز المتبقي بعد خصم العميل
        manualDiscountAmount = Math.min(v, afterCustomerDiscount);
      }
    }
  }
  const afterManualDiscount = Math.max(0, afterCustomerDiscount - manualDiscountAmount);

  // (4) Taxable Amount = المتبقي بعد كل الخصومات (قبل رسوم التوصيل)
  const taxableAmount = afterManualDiscount;

  // (5) Delivery Fee — تُضاف للوعاء الضريبي (ZATCA)
  const effectiveDeliveryFee = Math.max(0, parseFloat(deliveryFee) || 0);

  // (6) VAT Base = Taxable + Delivery
  const vatBase = Math.max(0, taxableAmount + effectiveDeliveryFee);

  // (7) VAT
  const vat = +(vatBase * vatRate).toFixed(2);

  // (8) Grand Total
  const total = +(vatBase + vat).toFixed(2);

  // إجمالي الخصومات (للعرض والتخزين)
  const discountAmount = +(customerDiscountAmount + manualDiscountAmount).toFixed(2);

  return {
    // المدخلات الفعّالة
    subtotal: +subtotal.toFixed(2),
    customerDiscountPct,
    customerDiscountAmount,
    manualDiscountAllowed,
    manualDiscountAmount: +manualDiscountAmount.toFixed(2),
    discountAmount,
    // الوعاء الضريبي
    taxableAmount: +taxableAmount.toFixed(2),
    deliveryFee: +effectiveDeliveryFee.toFixed(2),
    vatBase: +vatBase.toFixed(2),
    vat,
    total,
  };
}

/**
 * بناء كائن خصم مختصر للتخزين في الفاتورة (وفي notes JSON).
 * يتضمّن كل ما يحتاجه الإيصال والتقارير لإعادة بناء عرض الخصومات.
 */
export function buildDiscountBreakdown(totals, { manualDiscount, customer, isPlatformSale }) {
  return {
    customerDiscountPct: totals.customerDiscountPct,
    customerDiscountAmount: totals.customerDiscountAmount,
    manualDiscountAllowed: totals.manualDiscountAllowed,
    manualDiscount: {
      type: manualDiscount?.type || 'AMOUNT',
      value: parseFloat(manualDiscount?.value) || 0,
      amount: totals.manualDiscountAmount,
    },
    discountAmount: totals.discountAmount,
    // ملاحظة: لا itemDiscountsTotal — أُزيل خصم الصنف (القاعدة 4)
    isPlatformSale: !!isPlatformSale,
    customerIsCash: isCashCustomer(customer),
  };
}
