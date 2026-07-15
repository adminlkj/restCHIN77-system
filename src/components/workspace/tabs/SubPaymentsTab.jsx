import React, { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import { base44 } from '@/api/base44Client';
import { OperationEngine } from '@/lib/businessEngine';
import CrudTab from '@/components/workspace/CrudTab';

const METHODS = {
  CASH: { ar: 'نقدي', en: 'Cash' },
  BANK_TRANSFER: { ar: 'تحويل بنكي', en: 'Bank Transfer' },
  CHEQUE: { ar: 'شيك', en: 'Cheque' },
  CARD: { ar: 'بطاقة', en: 'Card' },
};

export default function SubPaymentsTab({ subcontractorId, invoices = [], onChanged }) {
  const { lang } = useStore();
  const [cashAccounts, setCashAccounts] = useState([]);

  useEffect(() => {
    base44.entities.ChartAccount.list('code', 1000).then((rows = []) => {
      setCashAccounts(rows.filter(a => a.isActive !== false && a.isPostable !== false && ['CASH', 'BANK'].includes(a.semanticRole)));
    });
  }, []);

  return (
    <CrudTab
      entityName="SubcontractorPayment"
      filter={{ subcontractorId }}
      operationHandlers={{ create: (payload) => OperationEngine.createSubcontractorPayment(payload) }}
      onChanged={onChanged}
      canEditRow={() => false}
      canDeleteRow={() => false}
      defaults={(rows) => ({
        subcontractorId, subcontractorInvoiceId: '', paymentNo: nextCodeFromList(rows, 'SPAY', 'paymentNo'),
        date: new Date().toISOString().slice(0, 10), amount: 0, method: 'BANK_TRANSFER', cashAccountCode: '', cashAccountName: '', reference: '', notes: '',
      })}
      validate={(f) => {
        if (!Number(f.amount)) return t('أدخل المبلغ', 'Enter amount', lang);
        if (!f.cashAccountCode) return t('اختر حساب السداد', 'Select payment account', lang);
        return null;
      }}
      buildPayload={(f) => ({
        subcontractorId, subcontractorInvoiceId: f.subcontractorInvoiceId || '', paymentNo: f.paymentNo,
        date: f.date || null, amount: Number(f.amount) || 0, method: f.method,
        cashAccountCode: f.cashAccountCode || '', cashAccountName: f.cashAccountName || '',
        reference: f.reference, notes: f.notes,
      })}
      labels={{
        new: { ar: 'سند صرف', en: 'New Payment' }, edit: { ar: 'عرض السند', en: 'View Payment' },
        empty: { ar: 'لا توجد سندات صرف', en: 'No payments' }, title: { ar: 'حذف السند', en: 'Delete Payment' },
      }}
      summary={(rows) => {
        const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
        return <span>{t('إجمالي المدفوعات', 'Total Paid', lang)}: <span className="font-bold text-emerald-600">{formatCurrency(total, lang)}</span></span>;
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.paymentNo}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الطريقة', en: 'Method' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? METHODS[r.method]?.ar : METHODS[r.method]?.en}</span> },
        { header: { ar: 'حساب السداد', en: 'Payment Account' }, cell: r => <span className="text-xs text-muted-foreground">{r.cashAccountName || r.cashAccountCode || '—'}</span> },
        { header: { ar: 'المرجع', en: 'Reference' }, cell: r => <span className="text-xs">{r.reference || '—'}</span> },
        { header: { ar: 'المبلغ', en: 'Amount' }, cell: r => <span className="text-emerald-600 font-medium">{formatCurrency(r.amount, lang)}</span> },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5"><Label>{t('رقم السند', 'Payment No', lang)}</Label><Input value={form.paymentNo || ''} readOnly className="bg-muted font-mono" /></div>
          <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
          {invoices.length > 0 && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('المستخلص المرتبط', 'Linked Invoice', lang)}</Label>
              <Select value={form.subcontractorInvoiceId || ''} onValueChange={v => set('subcontractorInvoiceId', v)}>
                <SelectTrigger><SelectValue placeholder={t('اختياري', 'Optional', lang)} /></SelectTrigger>
                <SelectContent>{invoices.filter(i => ['APPROVED', 'PARTIALLY_PAID'].includes(i.status)).map(i => <SelectItem key={i.id} value={i.id}>{i.invoiceNo} — {formatCurrency((i.totalAmount || 0) - (i.paidAmount || 0), lang)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>{t('المبلغ', 'Amount', lang)} *</Label><Input type="number" value={form.amount ?? 0} onChange={e => set('amount', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{t('الطريقة', 'Method', lang)}</Label>
            <Select value={form.method || 'BANK_TRANSFER'} onValueChange={v => set('method', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('حساب السداد', 'Payment Account', lang)} *</Label>
            <Select value={form.cashAccountCode || ''} onValueChange={v => { const a = cashAccounts.find(x => x.code === v); set('cashAccountCode', v); set('cashAccountName', a?.name || ''); }}>
              <SelectTrigger><SelectValue placeholder={t('اختر الصندوق أو البنك', 'Select cash/bank account', lang)} /></SelectTrigger>
              <SelectContent>{cashAccounts.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {lang === 'ar' ? a.name : (a.nameEn || a.name)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('المرجع / رقم الشيك', 'Reference', lang)}</Label><Input value={form.reference || ''} onChange={e => set('reference', e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </>
      )}
    />
  );
}