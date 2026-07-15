import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import CrudTab from '@/components/workspace/CrudTab';
import { toast } from 'sonner';

export default function DailyReportsTab({ projectId }) {
  const { lang } = useStore();
  const [uploading, setUploading] = useState(false);

  return (
    <CrudTab
      entityName="DailyReport"
      filter={{ projectId }}
      defaults={{
        projectId,
        date: new Date().toISOString().slice(0, 10),
        workDone: '',
        workforce: 0,
        weather: '',
        photos: [],
        notes: '',
      }}
      validate={(f) => (!f.date ? t('أدخل التاريخ', 'Enter date', lang) : null)}
      buildPayload={(f) => ({
        projectId,
        date: f.date || null,
        workDone: f.workDone,
        workforce: Number(f.workforce) || 0,
        weather: f.weather,
        photos: f.photos || [],
        notes: f.notes,
      })}
      labels={{
        new: { ar: 'تقرير يومي جديد', en: 'New Daily Report' },
        edit: { ar: 'تعديل التقرير اليومي', en: 'Edit Daily Report' },
        empty: { ar: 'لا توجد تقارير يومية لهذا المشروع', en: 'No daily reports for this project' },
        title: { ar: 'حذف التقرير', en: 'Delete Report' },
      }}
      summary={(rows) => (
        <>{t('التقارير اليومية', 'Daily reports', lang)}: <span className="font-bold text-foreground">{rows.length}</span></>
      )}
      columns={[
        { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
        { header: { ar: 'الأعمال المنجزة', en: 'Work Done' }, cell: r => <span className="text-sm line-clamp-1 max-w-[280px]">{r.workDone || '—'}</span> },
        { header: { ar: 'العمالة', en: 'Workforce' }, cell: r => <span className="tabular-nums">{r.workforce || 0}</span> },
        { header: { ar: 'الطقس', en: 'Weather' }, cell: r => <span className="text-sm text-muted-foreground">{r.weather || '—'}</span> },
        { header: { ar: 'الصور', en: 'Photos' }, cell: r => <span className="text-sm tabular-nums">{(r.photos || []).length}</span> },
      ]}
      fields={(form, set) => (
        <>
          <div className="space-y-1.5">
            <Label>{t('التاريخ', 'Date', lang)} *</Label>
            <Input type="date" value={form.date || ''} onChange={e => set('date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('عدد العمالة', 'Workforce', lang)}</Label>
            <Input type="number" value={form.workforce ?? 0} onChange={e => set('workforce', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('حالة الطقس', 'Weather', lang)}</Label>
            <Input value={form.weather || ''} onChange={e => set('weather', e.target.value)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('الأعمال المنجزة', 'Work Done', lang)}</Label>
            <Textarea value={form.workDone || ''} onChange={e => set('workDone', e.target.value)} rows={3} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label>{t('صور التقرير', 'Report Photos', lang)}</Label>
            <div className="flex items-center gap-2">
              <Input type="file" multiple accept="image/*" disabled={uploading} onChange={async e => {
                const files = Array.from(e.target.files || []);
                if (!files.length) return;
                setUploading(true);
                try {
                  const uploaded = await Promise.all(files.map(file => base44.integrations.Core.UploadFile({ file })));
                  set('photos', [...(form.photos || []), ...uploaded.map(r => r.file_url)]);
                  toast.success(t('تم رفع الصور', 'Photos uploaded', lang));
                } catch (err) {
                  toast.error(err?.message || t('فشل رفع الصور', 'Failed to upload photos', lang));
                } finally {
                  setUploading(false);
                }
              }} />
              {uploading && <Loader2 className="size-4 animate-spin text-muted-foreground shrink-0" />}
            </div>
            {(form.photos || []).length > 0 && <p className="text-xs text-muted-foreground">{(form.photos || []).length} {t('صورة مرفوعة', 'uploaded photos', lang)}</p>}
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