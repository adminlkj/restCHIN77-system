import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const PENALTY_STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  APPROVED: { ar: 'معتمدة', en: 'Approved', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

// Penalties (غرامات) — ContractItem with itemType PENALTY.
export default function PenaltiesTab({ projectId }) {
  const { lang } = useStore();

  return (
    <CrudTab
      entityName="ContractItem"
      filter={{ projectId, itemType: 'PENALTY' }}
      defaults={(rows) => ({
        projectId,
        itemType: 'PENALTY',
        reference: nextCodeFromList(rows, 'PEN', 'reference'),
        date: new Date().toISOString().slice(0, 10),
        description: '',
        amount: 0,
        status: 'DRAFT',
        notes: '',
      })}
      validate={(f) => (!f.reference?.trim() ? t('أدخل رقم الغرامة', 'Enter penalty reference', lang) : null)}
      buildPayload={(f) => ({
        projectId,
        itemType: 'PENALTY',
        reference: f.reference,
        date: f.date || null,
        description: f.description,
        amount: Number(f.amount) || 0,
        status: f.status,
        notes: f.notes,
      })}
      labels={{
        new: { ar: 'غرامة جديدة', en: 'New Penalty' },
        edit: { ar: 'تعديل غرامة', en: 'Edit Penalty' },
        empty: { ar: 'لا توجد غرامات لهذا المشروع', en: 'No penalties for this project' },
        title: { ar: 'حذف الغرامة', en: 'Delete Penalty' },
      }}
      summary={(rows) => (
        <>{t('إجمالي الغرامات', 'Total penalties', lang)}: <span className="font-bold text-rose-600">{formatCurrency(rows.reduce((s, r) => s + (r.amount || 0), 0), lang)}</span></>
      )}
      columns={[
        { header: { ar: 'المرجع', en: 'Reference' }, cell: r => <span className="font-mono text-xs">{r.reference}</span> },
        { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'القيمة', en: 'Value' }, cell: r => <span className="text-rose-600">{formatCurrency(r.amount, lang)}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = PENALTY_STATUS[r.status] || PENALTY_STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('رقم الغرامة', 'Reference', lang)} *</Label>
            <Input value={form.reference || ''} readOnly className="bg-muted font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('قيمة الغرامة', 'Value', lang)}</Label>
            <Input type="number" value={form.amount ?? 0} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)}</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Select value={form.status || 'DRAFT'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(PENALTY_STATUS).map(([k, v]) => (
                  <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('الوصف', 'Description', lang)}</Label>
            <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={2} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('ملاحظات', 'Notes', lang)}</Label>
            <Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} />
          </div>
        </>
      )}
    />
  );
}