import React from 'react';
import SubAggregateList from '@/components/subcontractors/SubAggregateList';
import { useStore } from '@/lib/store';
import { formatCurrency, formatDate, STATUS_TONE } from '@/lib/utils-binaa';

const STATUS = {
  PENDING: { ar: 'معلقة', en: 'Pending', color: STATUS_TONE.PENDING },
  APPLIED: { ar: 'مطبّقة', en: 'Applied', color: STATUS_TONE.DANGER },
  WAIVED: { ar: 'معفاة', en: 'Waived', color: STATUS_TONE.MUTED },
};
const REASONS = { DELAY: { ar: 'تأخير', en: 'Delay' }, QUALITY: { ar: 'جودة', en: 'Quality' }, SAFETY: { ar: 'سلامة', en: 'Safety' }, OTHER: { ar: 'أخرى', en: 'Other' } };

export default function SubPenaltiesAll() {
  const { lang } = useStore();
  return (
    <SubAggregateList
      entityName="SubcontractorPenalty"
      searchField="penaltyNo"
      title={{ ar: 'غرامات مورّدي الخدمات', en: 'Service Provider Penalties' }}
      subtitle={{ ar: 'كل الغرامات على مورّدي الخدمات', en: 'All penalties on service providers' }}
      exportColumns={[
        { header: { ar: 'مورّد الخدمات', en: 'Service Provider' }, value: (r, subs) => subs[r.subcontractorId]?.name || '' },
        { header: { ar: 'الرقم', en: 'No' }, value: r => r.penaltyNo },
        { header: { ar: 'السبب', en: 'Reason' }, value: r => { const x = REASONS[r.reason]; return x ? (lang === 'ar' ? x.ar : x.en) : r.reason; } },
        { header: { ar: 'الوصف', en: 'Description' }, value: r => r.description },
        { header: { ar: 'التاريخ', en: 'Date' }, value: r => r.date },
        { header: { ar: 'القيمة', en: 'Amount' }, value: r => r.amount || 0 },
        { header: { ar: 'الحالة', en: 'Status' }, value: r => { const s = STATUS[r.status]; return s ? (lang === 'ar' ? s.ar : s.en) : r.status; } },
      ]}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.penaltyNo}</span> },
        { header: { ar: 'السبب', en: 'Reason' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? REASONS[r.reason]?.ar : REASONS[r.reason]?.en}</span> },
        { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'القيمة', en: 'Amount' }, align: 'end', cell: r => <span className="text-rose-600">{formatCurrency(r.amount, lang)}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => { const s = STATUS[r.status] || STATUS.PENDING; return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>; } },
      ]}
    />
  );
}