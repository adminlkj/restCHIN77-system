import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';

export default function OperatingHoursTab({ equipmentId }) {
  const { lang } = useStore();

  return (
    <CrudTab
      entityName="OperatingHours"
      filter={{ equipmentId }}
      defaults={{
        equipmentId,
        date: new Date().toISOString().slice(0, 10),
        hours: 0,
        meterStart: 0,
        meterEnd: 0,
        operator: '',
        projectName: '',
        notes: '',
      }}
      validate={(f) => {
        if (!f.date) return t('أدخل التاريخ', 'Enter date', lang);
        if (Number(f.meterEnd) && Number(f.meterEnd) < Number(f.meterStart || 0)) return t('قراءة نهاية العداد لا يمكن أن تقل عن البداية', 'Meter end cannot be less than start', lang);
        const derived = Math.max(0, Number(f.meterEnd || 0) - Number(f.meterStart || 0));
        if ((Number(f.hours) || derived) <= 0) return t('أدخل ساعات تشغيل أكبر من صفر', 'Enter operating hours greater than zero', lang);
        return null;
      }}
      buildPayload={(f) => {
        const meterStart = Number(f.meterStart) || 0;
        const meterEnd = Number(f.meterEnd) || 0;
        const derivedHours = Math.max(0, meterEnd - meterStart);
        return {
          equipmentId,
          date: f.date || null,
          hours: Number(f.hours) || derivedHours,
          meterStart,
          meterEnd,
          operator: f.operator,
          projectName: f.projectName,
          notes: f.notes,
        };
      }}
      labels={{
        new: { ar: 'ساعات تشغيل', en: 'Log Hours' },
        edit: { ar: 'تعديل ساعات التشغيل', en: 'Edit Hours' },
        empty: { ar: 'لا توجد سجلات ساعات تشغيل', en: 'No operating-hours records' },
        title: { ar: 'حذف السجل', en: 'Delete Record' },
      }}
      summary={(rows) => (
        <>{t('إجمالي الساعات', 'Total hours', lang)}: <span className="font-bold text-foreground tabular-nums">{rows.reduce((s, r) => s + (r.hours || 0), 0)}</span></>
      )}
      columns={[
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الساعات', en: 'Hours' }, cell: r => <span className="tabular-nums font-medium">{r.hours || 0}</span> },
        { header: { ar: 'العداد', en: 'Meter' }, cell: r => <span className="tabular-nums text-xs">{r.meterStart || 0} → {r.meterEnd || 0}</span> },
        { header: { ar: 'المشغّل', en: 'Operator' }, cell: r => <span className="text-sm">{r.operator || '—'}</span> },
        { header: { ar: 'الموقع', en: 'Site' }, cell: r => <span className="text-sm text-muted-foreground">{r.projectName || '—'}</span> },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)} *</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('ساعات التشغيل', 'Hours', lang)}</Label>
            <Input type="number" value={form.hours ?? 0} onChange={e => set('hours', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('العداد بداية', 'Meter Start', lang)}</Label>
            <Input type="number" value={form.meterStart ?? 0} onChange={e => set('meterStart', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('العداد نهاية', 'Meter End', lang)}</Label>
            <Input type="number" value={form.meterEnd ?? 0} min={form.meterStart || 0} onChange={e => set('meterEnd', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('المشغّل', 'Operator', lang)}</Label>
            <Input value={form.operator || ''} onChange={e => set('operator', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الموقع / المشروع', 'Site / Project', lang)}</Label>
            <Input value={form.projectName || ''} onChange={e => set('projectName', e.target.value)} />
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