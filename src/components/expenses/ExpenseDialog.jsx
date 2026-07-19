import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { t, EXPENSE_CATEGORIES, EXPENSE_TYPES, getExpenseType } from '@/lib/utils-binaa';
import { calcVAT } from '@/lib/businessEngine';
import ExpenseTypePicker from './ExpenseTypePicker';

/**
 * نموذج المصروف الديناميكي — محرك واحد.
 * الخطوة 1: اختيار النوع (يظهر فقط عند الإنشاء الجديد).
 * الخطوة 2: نموذج يتغير حقوله تلقائياً حسب النوع المختار.
 *
 * ملاحظة مطعمية: أنواع المصروفات الخاصة بالبناء (PROJECT/EQUIPMENT)
 * محجوبة عن الإنشاء الجديد. السجلات القديمة بهذه الأنواع تُعرض كـ
 * COMPANY/ADMIN للقراءة فقط، دون تغيير القيمة المخزّنة. القيم الداخلية
 * (accountRole) في src/lib تبقى كما هي للتوافق مع postOperation/entry.ts.
 */

// أنواع المصروفات المعتمدة لمطعم — نُخفي أنواع البناء (PROJECT/EQUIPMENT) عن الواجهة.
const HIDDEN_EXPENSE_TYPES = ['PROJECT', 'EQUIPMENT'];
export const RESTAURANT_EXPENSE_TYPES = EXPENSE_TYPES.filter(
  (ty) => !HIDDEN_EXPENSE_TYPES.includes(ty.key)
);

// خريطة عرض الأنواع القديمة (الخاصة بالبناء) إلى أنواع مطعمية للعرض فقط.
const LEGACY_TYPE_DISPLAY_FALLBACK = { PROJECT: 'COMPANY', EQUIPMENT: 'ADMIN' };

export function getRestaurantExpenseType(key) {
  return getExpenseType(LEGACY_TYPE_DISPLAY_FALLBACK[key] || key);
}

export default function ExpenseDialog({
  open, onOpenChange, lang, editing, form, setForm, saving, onSave,
  employees,
  expenseAccounts = [], cashAccounts = [],
}) {
  const [step, setStep] = React.useState(editing ? 2 : 1);

  React.useEffect(() => {
    if (open) setStep(editing ? 2 : 1);
  }, [open, editing]);

  // للعرض فقط: نُسقط الأنواع القديمة (PROJECT/EQUIPMENT) إلى أنواع مطعمية.
  const typeDef = getRestaurantExpenseType(form.expenseType);
  // التعريف الأصلي للنوع (لإظهار الفئات والحقول المتاحة) — يُحترم للسجلات القديمة.
  const originalTypeDef = getExpenseType(form.expenseType);
  const isRTL = lang === 'ar';

  const amt = parseFloat(form.amount) || 0;
  const { vat: vatAmt, total: totalAmt } = form._vatEnabled ? calcVAT(amt) : { vat: 0, total: amt };

  // الفئات المتاحة لهذا النوع (نأخذها من تعريف النوع الأصلي لتفادي فقد فئة سجل قديم)
  const cats = EXPENSE_CATEGORIES.filter(c => originalTypeDef.categories.includes(c.key));

  const pickType = (key) => {
    const def = getExpenseType(key);
    // إعادة ضبط الفئة إن لم تعد ضمن فئات النوع الجديد
    setForm(f => ({
      ...f,
      expenseType: key,
      category: def.categories.includes(f.category) ? f.category : def.categories[0],
    }));
    setStep(2);
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const isRTL2 = lang === 'ar';
  const accName = (a) => (isRTL2 ? a.name : (a.nameEn || a.name));

  const pickExpenseAccount = (code) => {
    const a = expenseAccounts.find(x => x.code === code);
    setForm(f => ({ ...f, expenseAccountCode: code, expenseAccountName: a ? a.name : '' }));
  };
  const pickPaymentAccount = (code) => {
    const a = cashAccounts.find(x => x.code === code);
    setForm(f => ({ ...f, paymentAccountCode: code, paymentAccountName: a ? a.name : '' }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {editing
              ? t('تعديل المصروف', 'Edit Expense', lang)
              : step === 1
                ? t('اختر نوع المصروف', 'Choose Expense Type', lang)
                : `${t('مصروف جديد', 'New Expense', lang)} · ${isRTL ? typeDef.ar : typeDef.en}`}
          </DialogTitle>
        </DialogHeader>

        {step === 1 ? (
          <div className="py-2">
            <ExpenseTypePicker lang={lang} value={form.expenseType} onSelect={pickType} types={RESTAURANT_EXPENSE_TYPES} />
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 py-2">
            {/* شارة النوع + تغيير */}
            {!editing && (
              <div className="col-span-2 flex items-center justify-between rounded-lg border bg-muted/30 px-3 py-2">
                <span className={`text-xs font-medium rounded-full border px-2 py-0.5 ${typeDef.color}`}>
                  {isRTL ? typeDef.ar : typeDef.en}
                </span>
                <button type="button" onClick={() => setStep(1)} className="text-xs text-primary hover:underline flex items-center gap-1">
                  {t('تغيير النوع', 'Change type', lang)}
                  {isRTL ? <ArrowLeft className="size-3" /> : <ArrowRight className="size-3" />}
                </button>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>{t('الفئة', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => set('category', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{cats.map(c => <SelectItem key={c.key} value={c.key}>{isRTL ? c.ar : c.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>

            <div className="col-span-2 space-y-1.5"><Label>{t('الوصف', 'Description', lang)} *</Label><Input value={form.description} onChange={e => set('description', e.target.value)} /></div>

            {/* حقول ديناميكية حسب النوع — مطعمية فقط (موظف/جهة حكومية)؛
                حقول البناء (مشروع/معدات/عقد/موقع/BOQ) محذوفة من الواجهة. */}
            {originalTypeDef.fields.includes('employee') && (
              <div className="col-span-2 space-y-1.5">
                <Label>{t('الموظف', 'Employee', lang)}</Label>
                <Select value={form.employeeId} onValueChange={v => set('employeeId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
                  <SelectContent>{(employees || []).map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {originalTypeDef.fields.includes('govEntity') && (
              <div className="col-span-2 space-y-1.5">
                <Label>{t('الجهة الحكومية', 'Government Entity', lang)}</Label>
                <Input value={form.govEntity} onChange={e => set('govEntity', e.target.value)} placeholder={t('مثل: الزكاة والضريبة، البلدية، الغذاء والدواء...', 'e.g. Zakat & Tax, Municipality, SFDA...', lang)} />
              </div>
            )}

            {/* الحسابات المحاسبية الذكية — تُقرأ حيّة من الدليل المحاسبي */}
            <div className="col-span-2 space-y-1.5">
              <Label>{t('حساب المصروف', 'Expense Account', lang)}</Label>
              <Select value={form.expenseAccountCode || ''} onValueChange={pickExpenseAccount}>
                <SelectTrigger>
                  <SelectValue placeholder={t('اختر حساب المصروف من الدليل', 'Select expense account', lang)} />
                </SelectTrigger>
                <SelectContent>
                  {expenseAccounts.length === 0
                    ? <SelectItem value="none" disabled>{t('لا توجد حسابات مصروفات — أضفها في الدليل', 'No expense accounts — add them in the chart', lang)}</SelectItem>
                    : expenseAccounts.map(a => (
                        <SelectItem key={a.code} value={a.code}>
                          <span className="font-mono text-xs me-2 text-muted-foreground">{a.code}</span>{accName(a)}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-1.5">
              <Label>{t('طريقة الدفع / الحساب النقدي', 'Payment / Cash Account', lang)} <span className="text-rose-600">*</span></Label>
              <Select value={form.paymentAccountCode || ''} onValueChange={pickPaymentAccount}>
                <SelectTrigger>
                  <SelectValue placeholder={t('صندوق / بنك / عهدة', 'Cash / Bank / Custody', lang)} />
                </SelectTrigger>
                <SelectContent>
                  {cashAccounts.length === 0
                    ? <SelectItem value="none" disabled>{t('لا توجد حسابات نقدية — أضفها في الدليل', 'No cash accounts — add them in the chart', lang)}</SelectItem>
                    : cashAccounts.map(a => (
                        <SelectItem key={a.code} value={a.code}>
                          <span className="font-mono text-xs me-2 text-muted-foreground">{a.code}</span>{accName(a)}
                        </SelectItem>
                      ))}
                </SelectContent>
              </Select>
              <p className="text-[10px] text-muted-foreground">{t('يُفهم استخدام الحساب تلقائياً من نوعه وموقعه في شجرة الحسابات', 'Usage inferred from the account type & position in the tree', lang)}</p>
            </div>

            {/* المرجع (reference) يُولّده الخادم تلقائياً عند الإنشاء لربط المصروف بقيده.
                لا يُحرَّر يدوياً — يُعرض للقراءة فقط عند التعديل (إن وُجد). */}
            {form.reference && (
              <div className="space-y-1.5"><Label>{t('مرجع القيد', 'JE Reference', lang)}</Label><Input value={form.reference} readOnly className="bg-muted font-mono text-xs" /></div>
            )}
            <div className="space-y-1.5"><Label>{t('المبلغ', 'Amount', lang)} *</Label><Input type="number" value={form.amount} onChange={e => set('amount', e.target.value)} /></div>

            <div className="col-span-2 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form._vatEnabled} onChange={e => set('_vatEnabled', e.target.checked)} className="rounded" />
                {t('إضافة ضريبة 15%', 'Add VAT 15%', lang)}
              </label>
              {form._vatEnabled && <span className="text-sm text-muted-foreground">{t('الضريبة', 'VAT', lang)}: {vatAmt.toFixed(2)}</span>}
              <span className="text-sm font-bold ms-auto">{t('الإجمالي', 'Total', lang)}: {totalAmt.toFixed(2)}</span>
            </div>

            <div className="col-span-2 space-y-1.5"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes} onChange={e => set('notes', e.target.value)} rows={2} /></div>
          </div>
        )}

        {step === 2 && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={onSave} disabled={saving} className="bg-rose-600 hover:bg-rose-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : editing ? t('حفظ', 'Save', lang) : t('حفظ + قيد محاسبي', 'Save + Post JE', lang)}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}