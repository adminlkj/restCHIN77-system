import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const GUARANTEE_STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  ACTIVE: { ar: 'سارية', en: 'Active', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  RELEASED: { ar: 'مُفرج عنها', en: 'Released', color: 'bg-teal-100 text-teal-700 border border-teal-200' },
  CANCELLED: { ar: 'ملغاة', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

// Guarantees (ضمانات) and Penalties (غرامات) share the ContractItem entity.
export default function GuaranteesTab({ projectId }) {
  const { lang } = useStore();

  return (
    <CrudTab
      entityName="ContractItem"
      filter={{ projectId, itemType: 'GUARANTEE' }}
      defaults={(rows) => ({
        projectId,
        itemType: 'GUARANTEE',
        reference: nextCodeFromList(rows, 'GRT', 'reference'),
        date: new Date().toISOString().slice(0, 10),
        description: '',
        amount: 0,
        expiryDate: '',
        status: 'ACTIVE',
        notes: '',
      })}
      validate={(f) => (!f.reference?.trim() ? t('أدخل رقم الضمان', 'Enter guarantee reference', lang) : null)}
      buildPayload={(f) => ({
        projectId,
        itemType: 'GUARANTEE',
        reference: f.reference,
        date: f.date || null,
        description: f.description,
        amount: Number(f.amount) || 0,
        expiryDate: f.expiryDate || null,
        status: f.status,
        notes: f.notes,
      })}
      labels={{
        new: { ar: 'ضمان جديد', en: 'New Guarantee' },
        edit: { ar: 'تعديل ضمان', en: 'Edit Guarantee' },
        empty: { ar: 'لا توجد ضمانات لهذا المشروع', en: 'No guarantees for this project' },
        title: { ar: 'حذف الضمان', en: 'Delete Guarantee' },
      }}
      summary={(rows) => (
        <>{t('إجمالي الضمانات', 'Total guarantees', lang)}: <span className="font-bold text-foreground">{formatCurrency(rows.reduce((s, r) => s + (r.amount || 0), 0), lang)}</span></>
      )}
      columns={[
        { header: { ar: 'المرجع', en: 'Reference' }, cell: r => <span className="font-mono text-xs">{r.reference}</span> },
        { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description || '—'}</span> },
        { header: { ar: 'القيمة', en: 'Value' }, cell: r => formatCurrency(r.amount, lang) },
        { header: { ar: 'الانتهاء', en: 'Expiry' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.expiryDate, lang)}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = GUARANTEE_STATUS[r.status] || GUARANTEE_STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('رقم الضمان', 'Reference', lang)} *</Label>
            <Input value={form.reference || ''} readOnly className="bg-muted font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('قيمة الضمان', 'Value', lang)}</Label>
            <Input type="number" value={form.amount ?? 0} onChange={e => set('amount', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)}</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('تاريخ الانتهاء', 'Expiry Date', lang)}</Label>
            <Input type="date" value={form.expiryDate || ''} onChange={e => set('expiryDate', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Select value={form.status || 'ACTIVE'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(GUARANTEE_STATUS).map(([k, v]) => (
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