import React from 'react';
import SubAggregateList from '@/components/subcontractors/SubAggregateList';
import { useStore } from '@/lib/store';
import { formatCurrency, formatDate } from '@/lib/utils-binaa';

const METHODS = { CASH: { ar: 'نقدي', en: 'Cash' }, BANK_TRANSFER: { ar: 'تحويل', en: 'Transfer' }, CHEQUE: { ar: 'شيك', en: 'Cheque' }, CARD: { ar: 'بطاقة', en: 'Card' } };

export default function SubPaymentsAll() {
  const { lang } = useStore();
  return (
    <SubAggregateList
      entityName="SubcontractorPayment"
      searchField="paymentNo"
      title={{ ar: 'سداد مورّدي الخدمات', en: 'Service Provider Payments' }}
      subtitle={{ ar: 'كل سندات الصرف لمورّدي الخدمات', en: 'All payments to service providers' }}
      exportColumns={[
        { header: { ar: 'مورّد الخدمات', en: 'Service Provider' }, value: (r, subs) => subs[r.subcontractorId]?.name || '' },
        { header: { ar: 'رقم السند', en: 'No' }, value: r => r.paymentNo },
        { header: { ar: 'التاريخ', en: 'Date' }, value: r => r.date },
        { header: { ar: 'الطريقة', en: 'Method' }, value: r => { const m = METHODS[r.method]; return m ? (lang === 'ar' ? m.ar : m.en) : r.method; } },
        { header: { ar: 'المرجع', en: 'Reference' }, value: r => r.reference },
        { header: { ar: 'المبلغ', en: 'Amount' }, value: r => r.amount || 0 },
      ]}
      columns={[
        { header: { ar: 'رقم السند', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.paymentNo}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الطريقة', en: 'Method' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? METHODS[r.method]?.ar : METHODS[r.method]?.en}</span> },
        { header: { ar: 'المرجع', en: 'Reference' }, cell: r => <span className="text-xs">{r.reference || '—'}</span> },
        { header: { ar: 'المبلغ', en: 'Amount' }, align: 'end', cell: r => <span className="text-emerald-600 font-medium">{formatCurrency(r.amount, lang)}</span> },
      ]}
    />
  );
}