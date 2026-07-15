import React from 'react';
import SubAggregateList from '@/components/subcontractors/SubAggregateList';
import { useStore } from '@/lib/store';
import { formatCurrency, formatDate, STATUS_TONE } from '@/lib/utils-binaa';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: STATUS_TONE.NEUTRAL },
  ACTIVE: { ar: 'نشط', en: 'Active', color: STATUS_TONE.SUCCESS },
  SUSPENDED: { ar: 'موقوف', en: 'Suspended', color: STATUS_TONE.PENDING },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: STATUS_TONE.DONE },
  TERMINATED: { ar: 'مفسوخ', en: 'Terminated', color: STATUS_TONE.DANGER },
};

export default function SubContractsAll() {
  const { lang } = useStore();
  return (
    <SubAggregateList
      entityName="SubcontractorContract"
      searchField="contractNo"
      title={{ ar: 'اتفاقيات مورّدي الخدمات', en: 'Service Provider Agreements' }}
      subtitle={{ ar: 'كل اتفاقيات الخدمات عبر الطلبات', en: 'All service provider agreements across orders' }}
      exportColumns={[
        { header: { ar: 'مورّد الخدمات', en: 'Service Provider' }, value: (r, subs) => subs[r.subcontractorId]?.name || '' },
        { header: { ar: 'رقم العقد', en: 'Contract No' }, value: r => r.contractNo },
        { header: { ar: 'العنوان', en: 'Title' }, value: r => r.title },
        { header: { ar: 'الطلب', en: 'Order' }, value: r => r.projectName },
        { header: { ar: 'التاريخ', en: 'Date' }, value: r => r.date },
        { header: { ar: 'القيمة', en: 'Value' }, value: r => r.value || 0 },
        { header: { ar: 'الحالة', en: 'Status' }, value: r => { const s = STATUS[r.status]; return s ? (lang === 'ar' ? s.ar : s.en) : r.status; } },
      ]}
      columns={[
        { header: { ar: 'رقم العقد', en: 'Contract No' }, cell: r => <span className="font-mono text-xs">{r.contractNo}</span> },
        { header: { ar: 'العنوان', en: 'Title' }, cell: r => <span className="text-sm">{r.title || '—'}</span> },
        { header: { ar: 'الطلب', en: 'Order' }, cell: r => <span className="text-xs text-muted-foreground">{r.projectName || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'القيمة', en: 'Value' }, align: 'end', cell: r => formatCurrency(r.value, lang) },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => { const s = STATUS[r.status] || STATUS.DRAFT; return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>; } },
      ]}
    />
  );
}