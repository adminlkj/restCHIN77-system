import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const STATUS = {
  PENDING: { ar: 'معلقة', en: 'Pending', color: 'bg-amber-100 text-amber-700' },
  APPLIED: { ar: 'مطبّقة', en: 'Applied', color: 'bg-rose-100 text-rose-700' },
  WAIVED: { ar: 'معفاة', en: 'Waived', color: 'bg-gray-100 text-gray-600' },
};
const REASONS = { DELAY: { ar: 'تأخير', en: 'Delay' }, QUALITY: { ar: 'جودة', en: 'Quality' }, SAFETY: { ar: 'سلامة', en: 'Safety' }, OTHER: { ar: 'أخرى', en: 'Other' } };

export default function SubPenaltiesTab({ subcontractorId, contracts = [] }) {
  const { lang } = useStore();
  return (
    <CrudTab
      entityName="SubcontractorPenalty"
      filter={{ subcontractorId }}
      defaults={(rows) => ({
        subcontractorId, subcontractorContractId: '', penaltyNo: nextCodeFromList(rows, 'SPN', 'penaltyNo'),
        date: new Date().toISOString().slice(0, 10), reason: 'DELAY', description: '', amount: 0, status: 'PENDING', notes: '',
      })}
      validate={() => null}
      buildPayload={(f) => ({
        subcontractorId, subcontractorContractId: f.subcontractorContractId || '', penaltyNo: f.penaltyNo,
        date: f.date || null, reason: f.reason, description: f.description,
        amount: Number(f.amount) || 0, status: f.status, notes: f.notes,
      })}
      labels={{
        new: { ar: 'غرامة جديدة', en: 'New Penalty' }, edit: { ar: 'تعديل الغرامة', en: 'Edit Penalty' },
        empty: { ar: 'لا توجد غرامات', en: 'No penalties' }, title: { ar: 'حذف الغرامة', en: 'Delete Penalty' },
      }}
      summary={(rows) => {
        const applied = rows.filter(r => r.status === 'APPLIED').reduce((s, r) => s + (r.amount || 0), 0);
        return <span>{t('إجمالي الغرامات المطبّقة', 'Total Applied Penalties', lang)}: <span className="font-bold text-rose-600">{formatCurrency(applied, lang)}</span></span>;
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.penaltyNo}</span> },
        { header: { ar: 'السبب', en: 'Reason' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? REASONS[r.reason]?.ar : REASONS[r.reason]?.en}</span> },
        { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'القيمة', en: 'Amount' }, cell: r => <span className="text-rose-600">{formatCurrency(r.amount, lang)}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = STATUS[r.status] || STATUS.PENDING;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5"><Label>{t('رقم الغرامة', 'Penalty No', lang)}</Label><Input value={form.penaltyNo || ''} readOnly className="bg-muted font-mono" /></div>
          <div className="space-y-1.5">
            <Label>{t('السبب', 'Reason', lang)}</Label>
            <Select value={form.reason || 'DELAY'} onValueChange={v => set('reason', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(REASONS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {contracts.length > 0 && (
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('العقد المرتبط', 'Linked Contract', lang)}</Label>
              <Select value={form.subcontractorContractId || ''} onValueChange={v => set('subcontractorContractId', v)}>
                <SelectTrigger><SelectValue placeholder={t('اختياري', 'Optional', lang)} /></SelectTrigger>
                <SelectContent>{contracts.map(c => <SelectItem key={c.id} value={c.id}>{c.contractNo}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('القيمة', 'Amount', lang)}</Label><Input type="number" value={form.amount ?? 0} onChange={e => set('amount', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Select value={form.status || 'PENDING'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('الوصف', 'Description', lang)}</Label><Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </>
      )}
    />
  );
}