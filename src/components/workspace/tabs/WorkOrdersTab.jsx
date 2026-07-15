import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { useStore } from '@/lib/store';
import { t, formatDate, nextCodeFromList } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

const WO_STATUS = {
  OPEN: { ar: 'مفتوح', en: 'Open', color: 'bg-gray-100 text-gray-700 border border-gray-200' },
  IN_PROGRESS: { ar: 'قيد التنفيذ', en: 'In Progress', color: 'bg-amber-100 text-amber-700 border border-amber-200' },
  COMPLETED: { ar: 'مكتمل', en: 'Completed', color: 'bg-emerald-100 text-emerald-700 border border-emerald-200' },
  CANCELLED: { ar: 'ملغي', en: 'Cancelled', color: 'bg-rose-100 text-rose-700 border border-rose-200' },
};

export default function WorkOrdersTab({ projectId }) {
  const { lang } = useStore();

  return (
    <CrudTab
      entityName="WorkOrder"
      filter={{ projectId }}
      defaults={(rows) => ({
        projectId,
        orderNo: nextCodeFromList(rows, 'WO', 'orderNo'),
        title: '',
        date: new Date().toISOString().slice(0, 10),
        assignedTo: '',
        description: '',
        progressPercent: 0,
        status: 'OPEN',
        notes: '',
      })}
      validate={(f) => (!f.title?.trim() ? t('أدخل عنوان العمل', 'Enter work title', lang) : null)}
      buildPayload={(f) => ({
        projectId,
        orderNo: f.orderNo,
        title: f.title,
        date: f.date || null,
        assignedTo: f.assignedTo,
        description: f.description,
        progressPercent: Math.min(100, Math.max(0, Number(f.progressPercent) || 0)),
        status: f.status,
        notes: f.notes,
      })}
      labels={{
        new: { ar: 'أمر عمل جديد', en: 'New Work Order' },
        edit: { ar: 'تعديل أمر العمل', en: 'Edit Work Order' },
        empty: { ar: 'لا توجد أوامر عمل لهذا المشروع', en: 'No work orders for this project' },
        title: { ar: 'حذف أمر العمل', en: 'Delete Work Order' },
      }}
      summary={(rows) => (
        <>{t('أوامر العمل', 'Work orders', lang)}: <span className="font-bold text-foreground">{rows.length}</span></>
      )}
      columns={[
        { header: { ar: 'الرقم', en: 'No' }, cell: r => <span className="font-mono text-xs">{r.orderNo}</span> },
        { header: { ar: 'العنوان', en: 'Title' }, cell: r => <span className="text-sm font-medium">{r.title}</span> },
        { header: { ar: 'المنفّذ', en: 'Assigned' }, cell: r => <span className="text-sm">{r.assignedTo || '—'}</span> },
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الإنجاز', en: 'Progress' }, cell: r => (
          <div className="flex items-center gap-2 min-w-[110px]">
            <Progress value={r.progressPercent || 0} className="h-2 flex-1" />
            <span className="text-xs tabular-nums">{r.progressPercent || 0}%</span>
          </div>
        ) },
        { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
          const s = WO_STATUS[r.status] || WO_STATUS.OPEN;
          return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s.color}`}>{lang === 'ar' ? s.ar : s.en}</span>;
        } },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('رقم أمر العمل', 'Order No', lang)}</Label>
            <Input value={form.orderNo || ''} readOnly className="bg-muted font-mono" />
          </div>
          <div className="space-y-1.5">
            <Label>{t('عنوان العمل', 'Title', lang)} *</Label>
            <Input value={form.title || ''} onChange={e => set('title', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الجهة المنفّذة', 'Assigned To', lang)}</Label>
            <Input value={form.assignedTo || ''} onChange={e => set('assignedTo', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)}</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('نسبة الإنجاز %', 'Progress %', lang)}</Label>
            <Input type="number" min={0} max={100} value={form.progressPercent ?? 0} onChange={e => set('progressPercent', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الحالة', 'Status', lang)}</Label>
            <Select value={form.status || 'OPEN'} onValueChange={v => set('status', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {Object.entries(WO_STATUS).map(([k, v]) => (
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