import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useStore } from '@/lib/store';
import { t, formatCurrency, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const STATUS = {
  DRAFT: { ar: 'مسودة', en: 'Draft', color: 'bg-gray-100 text-gray-700' },
  ACTIVE: { ar: 'نشط', en: 'Active', color: 'bg-emerald-100 text-emerald-700' },
  SUSPENDED: { ar: 'موقوف', en: 'Suspended', color: 'bg-amber-100 text-amber-700' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-teal-100 text-teal-700' },
  TERMINATED: { ar: 'مفسوخ', en: 'Terminated', color: 'bg-rose-100 text-rose-700' },
};

export default function SubContractsTab({ subcontractorId, projects = [] }) {
  const { lang } = useStore();
  return (
    <CrudTab
      entityName="SubcontractorContract"
      filter={{ subcontractorId }}
      defaults={(rows) => ({
        subcontractorId, contractNo: nextCodeFromList(rows, 'SUBC', 'contractNo'), title: '', projectId: '', projectName: '',
        date: new Date().toISOString().slice(0, 10), startDate: '', endDate: '',
        value: 0, retentionPercent: 0, status: 'DRAFT', scope: '', notes: '',
      })}
      validate={(f) => (!f.contractNo?.trim() ? t('أدخل رقم العقد', 'Enter contract number', lang) : null)}
      buildPayload={(f) => {
        const proj = projects.find(p => p.id === f.projectId);
        return {
          subcontractorId, contractNo: f.contractNo, title: f.title,
          projectId: f.projectId || '', projectName: proj?.name || '',
          date: f.date || null, startDate: f.startDate || null, endDate: f.endDate || null,
          value: Number(f.value) || 0, retentionPercent: Number(f.retentionPercent) || 0,
          status: f.status, scope: f.scope, notes: f.notes,
        };
      }}
      labels={{
        new: { ar: 'عقد جديد', en: 'New Contract' }, edit: { ar: 'تعديل العقد', en: 'Edit Contract' },
        empty: { ar: 'لا توجد عقود لهذا المقاول', en: 'No contracts for this subcontractor' }, title: { ar: 'حذف العقد', en: 'Delete Contract' },
      }}
      summary={(rows) => {
        const total = rows.reduce((s, r) => s + (r.value || 0), 0);
        return <span>{t('إجمالي قيمة العقود', 'Total Contract Value', lang)}: <span className="font-bold text-foreground">{formatCurrency(total, lang)}</span></span>;
      }}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.contractNo}</span> },
        { header: { ar: 'العنوان', en: 'Title' }, cell: r => <span className="text-sm">{r.title || '—'}</span> },
        { header: { ar: 'المشروع', en: 'Project' }, cell: r => <span className="text-xs text-muted-foreground">{r.projectName || '—'}</span> },
        { header: { ar: 'القيمة', en: 'Value' }, cell: r => formatCurrency(r.value, lang) },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = STATUS[r.status] || STATUS.DRAFT;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5"><Label>{t('رقم العقد', 'Contract No', lang)} *</Label><Input value={form.contractNo || ''} readOnly className="bg-muted font-mono" /></div>
          <div className="space-y-1.5"><Label>{t('العنوان', 'Title', lang)}</Label><Input value={form.title || ''} onChange={e => set('title', e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('المشروع', 'Project', lang)}</Label>
            <Select value={form.projectId || ''} onValueChange={v => set('projectId', v)}>
              <SelectTrigger><SelectValue placeholder={t('اختياري', 'Optional', lang)} /></SelectTrigger>
              <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} /></div>
          <div className="space-y-1.5">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Select value={form.status || 'DRAFT'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(STATUS).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5"><Label>{t('بداية العقد', 'Start Date', lang)}</Label><Input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('نهاية العقد', 'End Date', lang)}</Label><Input type="date" value={form.endDate || ''} onChange={e => set('endDate', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('قيمة العقد', 'Contract Value', lang)}</Label><Input type="number" value={form.value ?? 0} onChange={e => set('value', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('نسبة المحتجز %', 'Retention %', lang)}</Label><Input type="number" value={form.retentionPercent ?? 0} onChange={e => set('retentionPercent', e.target.value)} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('نطاق الأعمال', 'Scope', lang)}</Label><Textarea value={form.scope || ''} onChange={e => set('scope', e.target.value)} rows={2} /></div>
          <div className="space-y-1.5 md:col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Textarea value={form.notes || ''} onChange={e => set('notes', e.target.value)} rows={2} /></div>
        </>
      )}
    />
  );
}