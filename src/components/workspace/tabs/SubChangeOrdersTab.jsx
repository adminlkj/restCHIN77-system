import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  APPROVED: { ar: 'معتمد', en: 'Approved', color: 'bg-emerald-100 text-emerald-700' },
  REJECTED: { ar: 'مرفوض', en: 'Rejected', color: 'bg-rose-100 text-rose-700' },
};
const TYPES = { ADDITION: { ar: 'إضافة', en: 'Addition' }, DEDUCTION: { ar: 'خصم', en: 'Deduction' }, EXTENSION: { ar: 'تمديد', en: 'Extension' } };

export default function SubChangeOrdersTab({ subcontractorId, contracts = [] }) {
  const { lang } = useStore();
  return (
    <CrudTab
      entityName="SubcontractorChangeOrder"
      filter={{ subcontractorId }}
      defaults={(rows) => ({
        subcontractorId, subcontractorContractId: '', orderNo: nextCodeFromList(rows, 'SCO', 'orderNo'),
        date: new Date().toISOString().slice(0, 10), changeType: 'ADDITION', description: '', amount: 0, status: 'DRAFT', notes: '',
      })}
      validate={() => null}
      buildPayload={(f) => ({
        subcontractorId, subcontractorContractId: f.subcontractorContractId || '', orderNo: f.orderNo,
        date: f.date || null, changeType: f.changeType, description: f.description,
        amount: Number(f.amount) || 0, status: f.status, notes: f.notes,
      })}
      labels={{
        new: { ar: 'أمر تغيير', en: 'New Change Order' }, edit: { ar: 'تعديل الأمر', en: 'Edit Change Order' },
        empty: { ar: 'لا توجد أوامر تغيير', en: 'No change orders' }, title: { ar: 'حذف الأمر', en: 'Delete Change Order' },
      }}
      summary={(rows) => {
        const net = rows.filter(r => r.status === 'APPROVED').reduce((s, r) => s + (r.changeType === 'DEDUCTION' ? -1 : 1) * (r.amount || 0), 0);
        return <span>{t('صافي التغييرات المعتمدة', 'Net Approved Changes', lang)}: <span className={`font-bold ${net >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>{formatCurrency(net, lang)}</span></span>;
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.orderNo}</span> },
        { header: { ar: 'النوع', en: 'Type' }, cell: r => <span className="text-xs text-muted-foreground">{lang === 'ar' ? TYPES[r.changeType]?.ar : TYPES[r.changeType]?.en}</span> },
        { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'القيمة', en: 'Amount' }, cell: r => <span className={r.changeType === 'DEDUCTION' ? 'text-rose-600' : 'text-emerald-600'}>{r.changeType === 'DEDUCTION' ? '−' : '+'}{formatCurrency(r.amount, lang)}</span> },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = STATUS[r.status] || STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5"><Label>{t('رقم الأمر', 'Order No', lang)}</Label><Input value={form.orderNo || ''} readOnly className="bg-muted font-mono" /></div>
          <div className="space-y-1.5">
            <Label>{t('النوع', 'Type', lang)}</Label>
            <Select value={form.changeType || 'ADDITION'} onValueChange={v => set('changeType', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
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
            <Select value={form.status || 'DRAFT'} onValueChange={v => set('status', v)}>
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