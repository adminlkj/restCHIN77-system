import React, { useState, useEffect } from 'react';
import { Printer, CheckCircle2 } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t, formatCurrency, formatDate, genInvoiceNo, INVOICE_STATUS } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';
import { OperationEngine } from '@/lib/businessEngine';
import InvoicePrintDialog from '@/components/shared/InvoicePrintDialog';
import { monthBounds, monthLabel, recentMonths, sumHoursForMonth, addDays } from '@/lib/rentalBilling';

// بنود الفاتورة التفصيلية — الإيجار (مع المعدة والساعات وسعر الساعة)، الرسوم الإضافية، الشحن.
const buildLineItems = (r, lang) => {
  const items = [];
  const base = Number(r.baseAmount) || 0;
  const extra = Number(r.extraCharges) || 0;
  const delivery = Number(r.deliveryAmount) || 0;
  const hours = Number(r.totalHours) || 0;
  const equipmentName = r.equipmentName || '';

  if (base > 0) {
    // بند الإيجار: يعرض اسم المعدة، عدد الساعات، وسعر الساعة كوحدة
    const hourlyRate = hours > 0 ? base / hours : base;
    const desc = equipmentName
      ? t('إيجار', 'Rental', lang) + ' ' + equipmentName
      : t('قيمة الإيجار', 'Rental value', lang);
    items.push({
      description: desc,
      descriptionEn: equipmentName ? `Rental: ${equipmentName}` : 'Rental value',
      qty: hours || 1,
      unitPrice: +hourlyRate.toFixed(2),
      total: base,
    });
  }
  if (extra > 0) {
    items.push({
      description: t('رسوم إضافية', 'Extra charges', lang),
      descriptionEn: 'Extra charges',
      qty: 1,
      unitPrice: extra,
      total: extra,
    });
  }
  if (delivery > 0) {
    items.push({
      description: t('شحن وتوصيل', 'Shipping & Delivery', lang),
      descriptionEn: 'Shipping & Delivery',
      qty: 1,
      unitPrice: delivery,
      total: delivery,
    });
  }
  return items;
};

// تحويل سجل فاتورة التأجير إلى الشكل الذي يتوقعه مستند الفاتورة الموحّد.
const toInvoiceDoc = (r, lang) => ({
  ...r,
  invoiceType: 'RENTAL',
  subtotal: (Number(r.baseAmount) || 0) + (Number(r.extraCharges) || 0) + (Number(r.deliveryAmount) || 0),
  lineItems: buildLineItems(r, lang),
});

const computeTotal = (f) => {
  const base = Number(f.baseAmount) || 0;
  const extra = Number(f.extraCharges) || 0;
  const delivery = Number(f.deliveryAmount) || 0;
  const deliveryVatable = f.deliveryVatable !== false;
  const net = base + extra + delivery; // الصافي = كل البنود قبل الضريبة
  // الوعاء الخاضع للضريبة يستثني الشحن غير الخاضع.
  const vatableBase = base + extra + (deliveryVatable ? delivery : 0);
  const vat = Math.round(vatableBase * 0.15 * 100) / 100;
  return { net, vat, total: net + vat };
};

// Standard working hours per month — used to derive hourly rate from monthly contracts.
const STANDARD_MONTHLY_HOURS = 260;

// حساب قيمة الإيجار للشهر حسب نوع سعر العقد:
//   - HOURLY:  rate × hours (السعر ساعي أصلاً)
//   - MONTHLY: rate هي القيمة الشهرية → سعر الساعة = rate / 260 → المبلغ = سعر الساعة × ساعات الشهر
//   - DAILY:   rate × أيام الشهر داخل فترة العقد
//   - WEEKLY:  rate × أسابيع الشهر داخل فترة العقد
const invoiceBaseForContract = (contract, ymKey, hours) => {
  if (!contract) return 0;
  const rate = Number(contract.rate) || 0;
  const hrs = Number(hours) || 0;

  // عقد ساعي: السعر بالساعة × عدد الساعات
  if (contract.rateType === 'HOURLY') {
    return +(rate * hrs).toFixed(2);
  }

  // عقد شهري: rate = القيمة الشهرية الكاملة
  // سعر الساعة = rate / 260 ساعة قياسية
  // مبلغ الشهر = سعر الساعة × ساعات الشهر الفعلية
  if (contract.rateType === 'MONTHLY') {
    if (rate > 0 && hrs > 0) {
      const hourlyRate = rate / STANDARD_MONTHLY_HOURS;
      return +(hourlyRate * hrs).toFixed(2);
    }
    // لا توجد ساعات مسجلة — استخدم القيمة الشهرية كاملة
    return rate;
  }

  if (!ymKey) return rate;
  const { from, to } = monthBounds(ymKey);
  const start = contract.startDate && contract.startDate > from ? contract.startDate : from;
  const end = contract.endDate && contract.endDate < to ? contract.endDate : to;
  const days = start && end && end >= start ? Math.floor((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86400000) + 1 : 0;

  if (contract.rateType === 'DAILY') return +(rate * days).toFixed(2);
  if (contract.rateType === 'WEEKLY') return +(rate * Math.ceil(days / 7)).toFixed(2);
  return rate;
};

// سعر الساعة المُشتق من العقد — يُستخدم في عرض بند الفاتورة وصندوق الحساب.
const hourlyRateFromContract = (contract) => {
  if (!contract) return 0;
  const rate = Number(contract.rate) || 0;
  if (contract.rateType === 'HOURLY') return rate;
  // عقد شهري: سعر الساعة = القيمة الشهرية / 260
  if (contract.rateType === 'MONTHLY' && rate > 0) {
    return rate / STANDARD_MONTHLY_HOURS;
  }
  return 0;
};

// بنود الفاتورة التفصيلية معروضة في buildLineItems أعلاه (مع المعدة والساعات وسعر الساعة).

export default function RentalInvoicesTab({ equipmentId }) {
  const { lang } = useStore();
  const { toast } = useToast();
  const [printInvoice, setPrintInvoice] = useState(null);
  const [approvingId, setApprovingId] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [deliveryOrders, setDeliveryOrders] = useState([]);
  const [hoursRows, setHoursRows] = useState([]);

  const approve = async (row, reload) => {
    setApprovingId(row.id);
    try {
      await OperationEngine.approveRentalInvoice(row.id);
      toast({ title: t('تم اعتماد الفاتورة وترحيل القيد', 'Invoice approved & posted', lang) });
      await reload();
    } catch (e) {
      toast({ title: t('فشل الاعتماد', 'Approval failed', lang), description: e.message, variant: 'destructive' });
    }
    setApprovingId(null);
  };

  useEffect(() => {
    Promise.all([
      base44.entities.RentalContract.filter({ equipmentId }).catch(() => []),
      base44.entities.DeliveryOrder.filter({ equipmentId }).catch(() => []),
      base44.entities.OperatingHours.filter({ equipmentId }).catch(() => []),
    ]).then(([c, d, h]) => { setContracts((c || []).filter(x => x.status === 'ACTIVE')); setDeliveryOrders((d || []).filter(x => x.status === 'COMPLETED')); setHoursRows(h || []); });
  }, [equipmentId]);

  return (
    <>
    <CrudTab
      entityName="RentalInvoice"
      operationHandlers={{
        create: (payload) => OperationEngine.createRentalInvoice(payload),
        update: (id, payload) => OperationEngine.updateRentalInvoice(id, payload),
      }}
      rowActions={(row, reload) => (
        <>
          {row.status === 'DRAFT' && (
            <Button variant="outline" size="sm" className="h-8 gap-1 text-emerald-700 border-emerald-200 hover:bg-emerald-50" disabled={approvingId === row.id} onClick={() => approve(row, reload)}>
              <CheckCircle2 className="size-3.5" />{approvingId === row.id ? t('جارٍ...', '...', lang) : t('اعتماد', 'Approve', lang)}
            </Button>
          )}
          <Button size="icon" variant="ghost" className="size-8 text-emerald-600 hover:text-emerald-700" onClick={() => setPrintInvoice(toInvoiceDoc(row, lang))}>
            <Printer className="size-3.5" />
          </Button>
        </>
      )}
      filter={{ equipmentId }}
      canEditRow={(row) => row.status === 'DRAFT'}
      canDeleteRow={(row) => row.status === 'DRAFT'}
      defaults={(rows) => ({
        equipmentId,
        invoiceNo: genInvoiceNo('RNT', new Date().getFullYear(), rows.length + 1),
        rentalContractId: '',
        contractNo: '',
        deliveryOrderId: '',
        deliveryOrderNo: '',
        billingMonth: '',
        paymentTermDays: 30,
        equipmentName: '',
        clientId: '',
        clientName: '',
        date: new Date().toISOString().slice(0, 10),
        dueDate: addDays(new Date().toISOString().slice(0, 10), 30),
        periodFrom: '',
        periodTo: '',
        totalHours: 0,
        baseAmount: 0,
        extraCharges: 0,
        deliveryAmount: 0,
        deliveryVatable: true,
        paidAmount: 0,
        status: 'DRAFT',
        notes: '',
      })}
      validate={(f) => {
        if (!f.invoiceNo?.trim()) return t('أدخل رقم الفاتورة', 'Enter invoice number', lang);
        if (!f.rentalContractId) return t('اختر عقد التأجير أولاً', 'Select a rental contract first', lang);
        if (!f.billingMonth) return t('اختر شهر العمل', 'Select the billing month', lang);
        return null;
      }}
      // منع إنشاء فاتورتين لنفس الشهر ولنفس المعدة.
      beforeSave={async (f, editingId) => {
        if (!f.billingMonth) return null;
        const existing = await base44.entities.RentalInvoice.filter({ equipmentId, billingMonth: f.billingMonth });
        const dup = existing.find(x => x.id !== editingId);
        if (dup) return t(`توجد فاتورة لهذا الشهر بالفعل (${dup.invoiceNo})`, `An invoice already exists for this month (${dup.invoiceNo})`, lang);
        return null;
      }}
      buildPayload={(f) => {
        const { vat, total } = computeTotal(f);
        return {
          equipmentId,
          rentalContractId: f.rentalContractId || '',
          contractNo: f.contractNo || '',
          deliveryOrderId: f.deliveryOrderId || '',
          deliveryOrderNo: f.deliveryOrderNo || '',
          billingMonth: f.billingMonth || '',
          equipmentName: f.equipmentName || '',
          invoiceNo: f.invoiceNo,
          clientId: f.clientId || '',
          clientName: f.clientName,
          date: f.date || null,
          dueDate: f.dueDate || null,
          periodFrom: f.periodFrom || null,
          periodTo: f.periodTo || null,
          totalHours: Number(f.totalHours) || 0,
          baseAmount: Number(f.baseAmount) || 0,
          extraCharges: Number(f.extraCharges) || 0,
          deliveryAmount: Number(f.deliveryAmount) || 0,
          deliveryVatable: f.deliveryVatable !== false,
          vatAmount: vat,
          totalAmount: total,
          paidAmount: Number(f.paidAmount) || 0,
          status: 'DRAFT',
          notes: f.notes,
        };
      }}
      labels={{
        new: { ar: 'فاتورة تأجير', en: 'New Rental Invoice' },
        edit: { ar: 'تعديل الفاتورة', en: 'Edit Invoice' },
        empty: { ar: 'لا توجد فواتير تأجير لهذه المعدة', en: 'No rental invoices for this equipment' },
        title: { ar: 'حذف الفاتورة', en: 'Delete Invoice' },
      }}
      summary={(rows) => {
        const total = rows.reduce((s, r) => s + (r.totalAmount || 0), 0);
        const paid = rows.reduce((s, r) => s + (r.paidAmount || 0), 0);
        return (
          <span className="flex flex-wrap gap-x-4 gap-y-1">
            <span>{t('الإجمالي', 'Total', lang)}: <span className="font-bold text-foreground">{formatCurrency(total, lang)}</span></span>
            <span>{t('المحصّل', 'Collected', lang)}: <span className="font-bold text-emerald-600">{formatCurrency(paid, lang)}</span></span>
            <span>{t('المتأخر', 'Outstanding', lang)}: <span className="font-bold text-rose-600">{formatCurrency(total - paid, lang)}</span></span>
          </span>
        );
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.invoiceNo}</span> },
        { header: { ar: 'رقم العقد', en: 'Contract' }, cell: r => <span className="font-mono text-xs">{r.contractNo || '—'}</span> },
        { header: { ar: 'أمر التوصيل', en: 'Delivery' }, cell: r => <span className="font-mono text-xs">{r.deliveryOrderNo || '—'}</span> },
        { header: { ar: 'شهر العمل', en: 'Month' }, cell: r => <span className="text-xs">{r.billingMonth ? monthLabel(r.billingMonth, lang) : '—'}</span> },
        { header: { ar: 'الساعات', en: 'Hours' }, cell: r => <span className="tabular-nums">{r.totalHours || 0}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الاستحقاق', en: 'Due' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.dueDate, lang)}</span> },
        { header: { ar: 'الإجمالي', en: 'Total' }, cell: r => formatCurrency(r.totalAmount, lang) },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = INVOICE_STATUS[r.status] || INVOICE_STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => {
        const { net, vat, total } = computeTotal(form);

        // العقد المختار حالياً — يُستخدم لعرض سعر الساعة المُشتق.
        const selectedContract = contracts.find(x => x.id === form.rentalContractId);
        const derivedHourlyRate = hourlyRateFromContract(selectedContract);

        // عند اختيار العقد: جلب رقمه واسم المعدة والعميل وشروط الدفع، وإعادة حساب الإيجار.
        const onContract = (v) => {
          if (v === 'none') { set('rentalContractId', ''); set('contractNo', ''); set('clientId', ''); set('paymentTermDays', 30); return; }
          const c = contracts.find(x => x.id === v);
          set('rentalContractId', v);
          set('contractNo', c?.contractNo || '');
          set('equipmentName', c?.equipmentName || '');
          set('clientId', c?.clientId || '');
          set('paymentTermDays', c?.paymentTermDays || 30);
          if (c?.clientName) set('clientName', c.clientName);
          // أعد حساب قيمة الإيجار بناءً على العقد والشهر والساعات
          set('baseAmount', invoiceBaseForContract(c, form.billingMonth, form.totalHours));
          if (form.date) set('dueDate', addDays(form.date, c?.paymentTermDays || 30));
        };

        // عند اختيار شهر العمل: تحديد فترة العمل وجمع ساعاتها فقط —
        // تاريخ الإصدار يبقى تاريخ اليوم، والاستحقاق يُحسب منه.
        const onMonth = (v) => {
          set('billingMonth', v);
          const { from, to } = monthBounds(v);
          const hours = sumHoursForMonth(hoursRows, v);
          const c = contracts.find(x => x.id === form.rentalContractId);
          set('periodFrom', from);
          set('periodTo', to);
          set('totalHours', hours);
          // أعد حساب قيمة الإيجار بناءً على الشهر وساعاته
          set('baseAmount', invoiceBaseForContract(c, v, hours));
        };

        const contractDeliveries = deliveryOrders; // كل أوامر التوصيل لهذه المعدة

        return (
          <>
            {/* === القسم 1: المدخلات الأساسية (ما يُدخله المستخدم) === */}
            <div className="space-y-1.5">
              <Label>{t('رقم الفاتورة', 'Invoice No', lang)} *</Label>
              <Input value={form.invoiceNo || ''} onChange={e => set('invoiceNo', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('عقد التأجير', 'Rental Contract', lang)} *</Label>
              <Select value={form.rentalContractId || 'none'} onValueChange={onContract}>
                <SelectTrigger><SelectValue placeholder={t('اختر عقداً', 'Select contract', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('بدون عقد', 'No contract', lang)}</SelectItem>
                  {contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.contractNo} — {c.clientName || ''}</SelectItem>) }
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('أمر التوصيل', 'Delivery Order', lang)}</Label>
              <Select
                value={form.deliveryOrderId || 'none'}
                onValueChange={v => {
                  if (v === 'none') { set('deliveryOrderId', ''); set('deliveryOrderNo', ''); return; }
                  const d = contractDeliveries.find(x => x.id === v);
                  set('deliveryOrderId', v);
                  set('deliveryOrderNo', d?.orderNo || '');
                }}
              >
                <SelectTrigger><SelectValue placeholder={t('اختر أمر توصيل', 'Select delivery order', lang)} /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t('بدون', 'None', lang)}</SelectItem>
                  {contractDeliveries.map(d => <SelectItem key={d.id} value={d.id}>{d.orderNo} — {formatDate(d.date, lang)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('شهر العمل', 'Billing Month', lang)} *</Label>
              <Select value={form.billingMonth || ''} onValueChange={onMonth}>
                <SelectTrigger><SelectValue placeholder={t('اختر الشهر', 'Select month', lang)} /></SelectTrigger>
                <SelectContent>
                  {recentMonths(12).map(m => <SelectItem key={m} value={m}>{monthLabel(m, lang)}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('تاريخ الفاتورة', 'Invoice Date', lang)}</Label>
              <Input type="date" value={form.date || ''} onChange={e => { set('date', e.target.value); set('dueDate', addDays(e.target.value, form.paymentTermDays || 30)); }} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('رسوم إضافية', 'Extra Charges', lang)}</Label>
              <Input type="number" value={form.extraCharges ?? 0} onChange={e => set('extraCharges', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('شحن وتوصيل', 'Shipping & Delivery', lang)}</Label>
              <Input type="number" value={form.deliveryAmount ?? 0} onChange={e => set('deliveryAmount', e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('ضريبة على الشحن؟', 'VAT on delivery?', lang)}</Label>
              <div className="flex items-center gap-2 h-9">
                <Switch checked={form.deliveryVatable !== false} onCheckedChange={v => set('deliveryVatable', v)} disabled={!Number(form.deliveryAmount)} />
                <span className="text-xs text-muted-foreground">{form.deliveryVatable !== false ? t('خاضع للضريبة 15%', 'VAT 15% applies', lang) : t('بدون ضريبة', 'No VAT', lang)}</span>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t('المحصّل', 'Paid Amount', lang)}</Label>
              <Input type="number" value={form.paidAmount ?? 0} readOnly className="bg-muted" />
            </div>

            {/* === القسم 2: بيانات تلقائية من العقد (للقراءة فقط) === */}
            {form.rentalContractId && form.rentalContractId !== 'none' && (
              <div className="md:col-span-2 rounded-lg bg-slate-50 border border-slate-200 p-3 space-y-2">
                <div className="text-xs font-semibold text-slate-600 mb-1">{t('بيانات العقد (تلقائية)', 'Contract Details (auto)')}</div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div><span className="text-muted-foreground">{t('المعدة', 'Equipment', lang)}:</span><br /><span className="font-medium">{form.equipmentName || '—'}</span></div>
                  <div><span className="text-muted-foreground">{t('العميل', 'Client', lang)}:</span><br /><span className="font-medium">{form.clientName || '—'}</span></div>
                  <div><span className="text-muted-foreground">{t('ساعات الشهر', 'Monthly Hours', lang)}:</span><br /><span className="font-medium tabular-nums">{form.billingMonth ? (Number(form.totalHours) || 0) : '—'}</span></div>
                  <div><span className="text-muted-foreground">{t('الاستحقاق', 'Due Date', lang)}:</span><br /><span className="font-medium">{form.dueDate ? formatDate(form.dueDate, lang) : '—'} <span className="text-muted-foreground">({form.paymentTermDays || 30} {t('يوم', 'days', lang)})</span></span></div>
                </div>
              </div>
            )}

            {/* === القسم 3: حساب قيمة الإيجار (تلقائي) === */}
            {form.rentalContractId && form.rentalContractId !== 'none' && form.billingMonth && (
              <div className="md:col-span-2 rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-xs space-y-1.5">
                <div className="font-semibold text-emerald-800 mb-1">
                  {t('حساب قيمة الإيجار (تلقائي)', 'Rental Calculation (auto)')}
                  <span className="ms-2 text-emerald-600 font-normal">
                    ({t('نوع العقد', 'Contract type')}: {selectedContract?.rateType === 'MONTHLY' ? t('شهري', 'Monthly', lang) : selectedContract?.rateType === 'HOURLY' ? t('ساعي', 'Hourly', lang) : selectedContract?.rateType === 'DAILY' ? t('يومي', 'Daily', lang) : selectedContract?.rateType === 'WEEKLY' ? t('أسبوعي', 'Weekly', lang) : selectedContract?.rateType})
                  </span>
                </div>

                {/* MONTHLY: القيمة الشهرية ÷ 260 ساعة = سعر الساعة × ساعات الشهر */}
                {selectedContract?.rateType === 'MONTHLY' && Number(selectedContract?.rate) > 0 && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('قيمة العقد الشهرية', 'Monthly rate', lang)}</span>
                      <span className="tabular-nums">{formatCurrency(Number(selectedContract.rate), lang)} ÷ {STANDARD_MONTHLY_HOURS} {t('ساعة', 'hrs', lang)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('سعر الساعة المُشتق', 'Derived hourly rate', lang)}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(derivedHourlyRate, lang)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('ساعات الشهر (من ساعات التشغيل)', 'Monthly hours (from timesheets)')}</span>
                      <span className="tabular-nums font-medium">× {Number(form.totalHours) || 0}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-900 pt-1 border-t border-emerald-300">
                      <span>{t('قيمة الإيجار', 'Rental amount', lang)}</span>
                      <span className="tabular-nums">{formatCurrency(Number(form.baseAmount), lang)}</span>
                    </div>
                  </>
                )}

                {/* HOURLY: سعر الساعة × ساعات الشهر */}
                {selectedContract?.rateType === 'HOURLY' && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('سعر الساعة (من العقد)', 'Hourly rate (from contract)', lang)}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(derivedHourlyRate, lang)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('ساعات الشهر (من ساعات التشغيل)', 'Monthly hours (from timesheets)')}</span>
                      <span className="tabular-nums font-medium">× {Number(form.totalHours) || 0}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-900 pt-1 border-t border-emerald-300">
                      <span>{t('قيمة الإيجار', 'Rental amount', lang)}</span>
                      <span className="tabular-nums">{formatCurrency(Number(form.baseAmount), lang)}</span>
                    </div>
                    {Number(selectedContract?.rate) > 10000 && (
                      <p className="text-amber-600 text-[11px] mt-1">
                        {t('⚠ سعر الساعة مرتفع جداً — تأكد من أن نوع العقد "شهري" وليس "ساعي" إذا كانت 215,000 قيمة شهرية', '⚠ Hourly rate is very high — make sure contract type is "Monthly" not "Hourly" if 215,000 is a monthly value', lang)}
                      </p>
                    )}
                  </>
                )}

                {/* DAILY: سعر اليوم × أيام الشهر */}
                {selectedContract?.rateType === 'DAILY' && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('سعر اليوم (من العقد)', 'Daily rate (from contract)', lang)}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(Number(selectedContract.rate), lang)}</span>
                    </div>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('أيام الشهر في فترة العقد', 'Days in billing period')}</span>
                      <span className="tabular-nums font-medium">× {Math.ceil((form.totalHours || 0) / 8) || 0}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-900 pt-1 border-t border-emerald-300">
                      <span>{t('قيمة الإيجار', 'Rental amount', lang)}</span>
                      <span className="tabular-nums">{formatCurrency(Number(form.baseAmount), lang)}</span>
                    </div>
                  </>
                )}

                {/* WEEKLY: سعر الأسبوع × أسابيع الشهر */}
                {selectedContract?.rateType === 'WEEKLY' && (
                  <>
                    <div className="flex justify-between text-emerald-700">
                      <span>{t('سعر الأسبوع (من العقد)', 'Weekly rate (from contract)', lang)}</span>
                      <span className="tabular-nums font-medium">{formatCurrency(Number(selectedContract.rate), lang)}</span>
                    </div>
                    <div className="flex justify-between font-bold text-emerald-900 pt-1 border-t border-emerald-300">
                      <span>{t('قيمة الإيجار', 'Rental amount', lang)}</span>
                      <span className="tabular-nums">{formatCurrency(Number(form.baseAmount), lang)}</span>
                    </div>
                  </>
                )}

                {Number(form.totalHours) === 0 && form.billingMonth && (selectedContract?.rateType === 'MONTHLY' || selectedContract?.rateType === 'HOURLY') && (
                  <p className="text-amber-600 text-[11px] mt-1">{t('⚠ لا توجد ساعات تشغيل مسجلة لهذا الشهر — سجّل ساعات التشغيل أولاً', '⚠ No operating hours recorded for this month — record timesheets first', lang)}</p>
                )}
              </div>
            )}

            {/* === القسم 4: الملخص المالي === */}
            <div className="md:col-span-2 rounded-lg bg-muted/50 p-3 text-xs space-y-1">
              {Number(form.deliveryAmount) > 0 && (
                <div className="flex justify-between"><span className="text-muted-foreground">{t('شحن وتوصيل', 'Shipping & Delivery', lang)}{form.deliveryVatable === false ? t(' (بدون ضريبة)', ' (No VAT)', lang) : ''}</span><span className="tabular-nums">{formatCurrency(Number(form.deliveryAmount), lang)}</span></div>
              )}
              <div className="flex justify-between"><span className="text-muted-foreground">{t('الإيجار + الرسوم + الشحن (الصافي)', 'Rental + Extra + Delivery (Net)', lang)}</span><span className="tabular-nums">{formatCurrency(net, lang)}</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">{t('ضريبة القيمة المضافة 15%', 'VAT 15%', lang)}</span><span className="tabular-nums">{formatCurrency(vat, lang)}</span></div>
              <div className="flex justify-between font-bold pt-1 border-t"><span>{t('الإجمالي', 'Total', lang)}</span><span className="tabular-nums">{formatCurrency(total, lang)}</span></div>
            </div>

            {/* === القسم 5: ملاحظات === */}
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('ملاحظات', 'Notes', lang)}</Label>
              <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
            </div>
          </>
        );
      }}
    />
    <InvoicePrintDialog open={!!printInvoice} onOpenChange={(o) => !o && setPrintInvoice(null)} invoice={printInvoice} />
    </>
  );
}