import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { t } from '@/lib/utils-binaa';
import { BookOpen, Layers, CheckCircle2, FolderTree } from 'lucide-react';

export default function ChartAccountSummary({ accounts, typeMeta, lang }) {
  const postable = accounts.filter(a => a.isPostable !== false).length;
  const groups = accounts.length - postable;
  const active = accounts.filter(a => a.isActive !== false).length;

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat icon={BookOpen} label={t('إجمالي الحسابات', 'Total Accounts', lang)} value={accounts.length} tone="text-teal-700 bg-teal-50 border-teal-200" />
        <Stat icon={FolderTree} label={t('حسابات تجميعية', 'Group Accounts', lang)} value={groups} tone="text-slate-700 bg-slate-50 border-slate-200" />
        <Stat icon={CheckCircle2} label={t('حسابات قابلة للترحيل', 'Postable Accounts', lang)} value={postable} tone="text-emerald-700 bg-emerald-50 border-emerald-200" />
        <Stat icon={Layers} label={t('حسابات نشطة', 'Active Accounts', lang)} value={active} tone="text-blue-700 bg-blue-50 border-blue-200" />
      </div>

      <Card className="border-dashed bg-muted/20">
        <CardContent className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground me-1">{t('دليل القراءة:', 'Reading guide:', lang)}</span>
            {Object.entries(typeMeta).map(([key, meta]) => (
              <span key={key} className={`inline-flex items-center rounded-full border px-2.5 py-1 font-medium ${meta.color}`}>
                {lang === 'ar' ? meta.ar : meta.en}
              </span>
            ))}
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-white px-2.5 py-1 text-slate-600">{t('تجميعي = لا يرحّل عليه', 'Group = not postable', lang)}</span>
            <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">{t('نهائي = يقبل القيود', 'Leaf = accepts entries', lang)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ icon: Icon, label, value, tone }) {
  return (
    <Card className={`border ${tone}`}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="size-10 rounded-xl bg-white/70 flex items-center justify-center shrink-0">
          <Icon className="size-5" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">{value}</p>
          <p className="text-xs mt-1 opacity-80">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}