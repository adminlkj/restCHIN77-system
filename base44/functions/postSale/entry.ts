import { createClientFromRequest } from 'npm:@base44/sdk@0.8.38';

const money = (value) => Math.round(Number(value || 0) * 100) / 100;
const num = (v) => Number(v) || 0;

const VAT_RATE = 0.15;

// يحلّ نسبة ضريبة القيمة المضافة مع احترام 0% (صفرية الضريبة).
function resolveVatRate(vatRate) {
  if (vatRate === 0 || vatRate === '0') return 0;
  const n = Number(vatRate);
  if (Number.isFinite(n) && n >= 0) return n;
  return VAT_RATE;
}

// خريطة الحسابات الافتراضية (تطابق standardChart.js) — تُستخدم لإنشاء القيد
// المحاسبي عند البيع. الأكواد هي خطة بديلة؛ الأفضل تحميلها من الدليل، لكن
// لتفادي استدعاء إضافي نستخدم هذه القيم الموحّدة مع الشجرة القياسية.
const ACCOUNTS = {
  CASH:        { code: '1111', name: 'صندوق الكاشير' },
  RECEIVABLES: { code: '1121', name: 'ذمم الزبائن (آجلة)' },
  REVENUE:     { code: '4100', name: 'إيرادات مبيعات الصالة' },
  VAT_PAYABLE: { code: '2160', name: 'ضريبة القيمة المضافة المحصلة' },
};

/**
 * postSale — إنشاء فاتورة بيع + خصم المخزون + ترحيل قيد محاسكي متوازن.
 *
 * الحمولة: { items, paidAmount, discountAmount?, deliveryFee?, vatRate?, clientId?, clientName? }
 *
 * الحساب (يتطابق مع discountEngine.computeInvoiceTotals في الواجهة):
 *   subtotal = Σ(price × qty)         (GROSS، قبل الخصم)
 *   vatBase  = subtotal − discount + deliveryFee   (الوعاء الخاضع، ZATCA)
 *   vat      = vatBase × vatRate
 *   total    = vatBase + vat
 *
 * القيد المحاسبي:
 *   مدين: الصندوق/الذمم (total)
 *   دائن: إيراد المبيعات (vatBase) + ضريبة محصلة (vat)
 * متوازن دائماً: debit(total) === credit(vatBase + vat) === total.
 */
Deno.serve(async (req) => {
  let base44;
  let invoice;
  let journalEntry;
  const adjustedItems = [];
  const movementIds = [];
  try {
    base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const {
      items,
      paidAmount = 0,
      discountAmount = 0,
      deliveryFee = 0,
      vatRate,
      clientId = '',
      clientName = '',
    } = await req.json();

    if (!Array.isArray(items) || items.length === 0) {
      return Response.json({ error: 'At least one sale item is required' }, { status: 400 });
    }

    const requested = new Map();
    for (const line of items) {
      const quantity = Number(line.quantity);
      if (!line.inventoryItemId || !Number.isFinite(quantity) || quantity <= 0) {
        return Response.json({ error: 'Each sale item needs a valid quantity' }, { status: 400 });
      }
      requested.set(line.inventoryItemId, (requested.get(line.inventoryItemId) || 0) + quantity);
    }

    // التحقق من المخزون + خصمه فوراً (لتقليل نافذة السباق) مع تسجيل الحركة.
    const inventory = [];
    for (const [id, quantity] of requested) {
      const item = await base44.entities.InventoryItem.get(id);
      if (!item || item.isActive === false || Number(item.quantity) < quantity) {
        return Response.json({ error: `Insufficient stock for item ${id}` }, { status: 409 });
      }
      inventory.push({ item, quantity });
    }

    const priceOf = (item) => money(item.salePrice ?? item.unitCost ?? 0);
    const lineItems = inventory.map(({ item, quantity }) => ({
      inventoryItemId: item.id,
      description: item.name,
      qty: quantity,
      unitPrice: priceOf(item),
      total: money(priceOf(item) * quantity),
    }));
    const subtotal = money(lineItems.reduce((sum, line) => sum + line.total, 0));
    const discount = money(Math.max(0, Number(discountAmount) || 0));
    const delivery = money(Math.max(0, Number(deliveryFee) || 0));
    const rate = resolveVatRate(vatRate);
    // الوعاء الخاضع = الإجمالي − الخصم + التوصيل (ZATCA).
    const vatBase = money(Math.max(0, subtotal - discount + delivery));
    const vatAmount = money(vatBase * rate);
    const totalAmount = money(vatBase + vatAmount);
    const safePaidAmount = money(Math.min(Math.max(Number(paidAmount) || 0, 0), totalAmount));

    // الحالة تعكس المدفوع فعلياً (لا تُفرض PAID دائماً).
    const status = safePaidAmount >= totalAmount - 0.01
      ? 'PAID'
      : safePaidAmount > 0
        ? 'PARTIALLY_PAID'
        : 'UNPAID';

    const saleDate = new Date().toISOString().slice(0, 10);
    const invoiceNo = `SALE-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;

    invoice = await base44.entities.SalesInvoice.create({
      invoiceNo, date: saleDate,
      subtotal, discountAmount: discount, deliveryFee: delivery,
      vatRate: rate, vatAmount, totalAmount,
      paidAmount: safePaidAmount, status,
      clientId, clientName,
      notes: JSON.stringify({ items: lineItems, discountAmount: discount, deliveryFee: delivery }),
    });

    // خصم المخزون + تسجيل حركة الصرف (ISSUE = خارج).
    for (const { item, quantity } of inventory) {
      const newQty = money(Number(item.quantity) - quantity);
      await base44.entities.InventoryItem.update(item.id, { quantity: newQty });
      adjustedItems.push(item);
      const movement = await base44.entities.StockMovement.create({
        itemId: item.id, itemName: item.name, itemCode: item.code || '',
        date: saleDate, type: 'ISSUE',
        quantity, unitCost: money(item.unitCost), totalCost: money(item.unitCost * quantity),
        reference: invoiceNo,
      });
      movementIds.push(movement.id);
    }

    // القيد المحاسكي المتوازن:
    //   مدين: الصندوق (إن نقداً) أو ذمم العملاء (إن آجلاً) = totalAmount
    //   دائن: إيراد المبيعات = vatBase ، ضريبة محصلة = vatAmount
    // إن كانت الفاتورة صفرية الضريبة (vat = 0) لا نُنشئ سطر الضريبة.
    const debitAccount = safePaidAmount > 0 ? ACCOUNTS.CASH : ACCOUNTS.RECEIVABLES;
    const jeLines = [
      { accountCode: debitAccount.code, accountName: debitAccount.name, debit: totalAmount, credit: 0, description: `تحصيل/ذمم فاتورة ${invoiceNo}`, partyType: 'CLIENT', partyId: clientId, partyName: clientName },
      { accountCode: ACCOUNTS.REVENUE.code, accountName: ACCOUNTS.REVENUE.name, debit: 0, credit: vatBase, description: `إيراد مبيعات ${invoiceNo}` },
      ...(vatAmount > 0 ? [{ accountCode: ACCOUNTS.VAT_PAYABLE.code, accountName: ACCOUNTS.VAT_PAYABLE.name, debit: 0, credit: vatAmount, description: `ضريبة قيمة مضافة ${invoiceNo}` }] : []),
    ];
    const totalDebit = money(jeLines.reduce((s, l) => s + num(l.debit), 0));
    const totalCredit = money(jeLines.reduce((s, l) => s + num(l.credit), 0));
    // تحقق التوازن قبل الترحيل (يجب أن يتطابق ضمن هللة).
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(`اختلال توازن القيد ${invoiceNo}: مدين ${totalDebit} / دائن ${totalCredit}`);
    }
    journalEntry = await base44.entities.JournalEntry.create({
      entryNo: `JE-SALE-${invoiceNo}`,
      date: saleDate,
      description: `قيد بيع ${invoiceNo}`,
      sourceType: 'SalesInvoice',
      isPosted: true,
      totalDebit, totalCredit,
      lines: jeLines,
    });

    return Response.json({ invoice, journalEntry });
  } catch (error) {
    // التراجع: أعد المخزون، احذف الحركات والفاتورة والقيد.
    if (base44) {
      for (const item of adjustedItems) {
        try { await base44.entities.InventoryItem.update(item.id, { quantity: item.quantity }); } catch { /* best-effort */ }
      }
      for (const id of movementIds) {
        try { await base44.entities.StockMovement.delete(id); } catch { /* best-effort */ }
      }
      if (journalEntry?.id) {
        try { await base44.entities.JournalEntry.delete(journalEntry.id); } catch { /* best-effort */ }
      }
      if (invoice?.id) {
        try { await base44.entities.SalesInvoice.update(invoice.id, { status: 'CANCELLED' }); } catch { /* best-effort */ }
      }
    }
    return Response.json({ error: error.message || 'Unable to post sale' }, { status: 500 });
  }
});
