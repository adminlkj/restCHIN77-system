import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { TrendingUp, TrendingDown, Wallet, Percent, Pencil, Save, X, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t, formatCurrency, formatDate, PROJECT_STATUS } from '@/lib/utils-binaa';
import { canTransition, nextStates } from '@/lib/workflowEngine';

const PROJECT_TYPES = {
  CONSTRUCTION: { ar: 'مقاولات', en: 'Construction' },
  RENTAL: { ar: 'تأجير', en: 'Rental' },
  BOTH: { ar: 'مقاولات وتأجير', en: 'Both' },
};

function Stat({ label, value, Icon, tone }) {
  const tones = {
    emerald: 'bg-emerald-50 text-emerald-700',
    rose: 'bg-rose-50 text-rose-700',
    blue: 'bg-blue-50 text-blue-700',
  };
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className={`size-10 rounded-lg flex items-center justify-center ${tones[tone] || tones.blue}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="text-lg font-bold text-foreground truncate">{value}</div>
        </div>
      </div>
    </Card>
  );
}

function Field({ label, value }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-sm font-medium text-foreground">{value || '—'}</div>
    </div>
  );
}

export default function ProjectBasicInfo({ project, revenue, costs, onUpdated }) {
  const { lang } = useStore();
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(project);

  // Keep form in sync with project prop when not editing
  useEffect(() => {
    if (!editing) setForm(project);
  }, [project, editing]);

  const profit = revenue - costs;
  const margin = revenue > 0 ? Math.round((profit / revenue) * 100) : 0;
  const st = PROJECT_STATUS[project.status] || PROJECT_STATUS.PLANNING;
  const pt = PROJECT_TYPES[project.projectType] || PROJECT_TYPES.CONSTRUCTION;
  const availableStatuses = nextStates('PROJECT', project.status) || Object.keys(PROJECT_STATUS);

  const startEdit = () => { setForm(project); setEditing(true); };
  const cancel = () => { setEditing(false); setForm(project); };
  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    if (!canTransition('PROJECT', project.status, form.status)) {
      toast({ title: t('انتقال غير مسموح', 'Invalid transition', lang), description: t('لا يمكن تغيير حالة المشروع إلى الحالة المحددة من حالته الحالية', 'This project status change is not allowed from the current state', lang), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: form.name,
        clientName: form.clientName,
        branchName: form.branchName,
        projectManager: form.projectManager,
        costCenter: form.costCenter,
        location: form.location,
        status: form.status,
        projectType: form.projectType,
        progressPercent: Number(form.progressPercent) || 0,
        contractValue: Number(form.contractValue) || 0,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        description: form.description,
      };
      const updated = await base44.entities.Project.update(project.id, payload);
      toast({ title: t('تم الحفظ', 'Saved', lang), description: t('تم تحديث بيانات المشروع', 'Project data updated', lang) });
      setEditing(false);
      onUpdated?.(updated);
    } catch (err) {
      toast({ title: t('خطأ', 'Error', lang), description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* Financial summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label={t('الإيرادات', 'Revenue', lang)} value={formatCurrency(revenue, lang)} Icon={TrendingUp} tone="emerald" />
        <Stat label={t('التكاليف', 'Costs', lang)} value={formatCurrency(costs, lang)} Icon={TrendingDown} tone="rose" />
        <Stat label={t('صافي الربح', 'Net Profit', lang)} value={formatCurrency(profit, lang)} Icon={Wallet} tone={profit >= 0 ? 'emerald' : 'rose'} />
        <Stat label={t('هامش الربح', 'Profit Margin', lang)} value={`${margin}%`} Icon={Percent} tone="blue" />
      </div>

      {/* Progress */}
      <Card className="p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold">{t('نسبة الإنجاز', 'Completion', lang)}</span>
          <span className="text-sm font-bold text-emerald-600">{project.progressPercent || 0}%</span>
        </div>
        <Progress value={project.progressPercent || 0} className="h-2" />
      </Card>

      {/* Basic data card */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-bold text-foreground">{t('البيانات الأساسية', 'Basic Data', lang)}</h3>
          {!editing ? (
            <Button size="sm" variant="outline" onClick={startEdit} className="gap-1.5">
              <Pencil className="size-3.5" /> {t('تعديل', 'Edit', lang)}
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={cancel} disabled={saving} className="gap-1.5">
                <X className="size-3.5" /> {t('إلغاء', 'Cancel', lang)}
              </Button>
              <Button size="sm" onClick={save} disabled={saving} className="gap-1.5">
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
                {t('حفظ', 'Save', lang)}
              </Button>
            </div>
          )}
        </div>

        {!editing ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Field label={t('كود المشروع', 'Project Code', lang)} value={project.code} />
              <Field label={t('اسم المشروع', 'Project Name', lang)} value={project.name} />
              <Field label={t('العميل', 'Client', lang)} value={project.clientName} />
              <Field label={t('الفرع', 'Branch', lang)} value={project.branchName} />
              <Field label={t('مدير المشروع', 'Project Manager', lang)} value={project.projectManager} />
              <Field label={t('مركز التكلفة', 'Cost Center', lang)} value={project.costCenter} />
              <Field label={t('الموقع', 'Location', lang)} value={project.location} />
              <Field label={t('نوع المشروع', 'Project Type', lang)} value={lang === 'ar' ? pt.ar : pt.en} />
              <Field
                label={t('الحالة', 'Status', lang)}
                value={<span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>}
              />
              <Field label={t('قيمة العقد', 'Contract Value', lang)} value={formatCurrency(project.contractValue, lang)} />
              <Field label={t('تاريخ البدء', 'Start Date', lang)} value={formatDate(project.startDate, lang)} />
              <Field label={t('تاريخ الانتهاء', 'End Date', lang)} value={formatDate(project.endDate, lang)} />
            </div>
            {project.description && (
              <div className="mt-4 pt-4 border-t border-border">
                <div className="text-xs text-muted-foreground mb-1">{t('الوصف', 'Description', lang)}</div>
                <p className="text-sm text-foreground">{project.description}</p>
              </div>
            )}
          </>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>{t('كود المشروع', 'Project Code', lang)}</Label>
              <Input value={form.code || ''} disabled className="bg-muted/50" />
            </div>
            <div className="space-y-1.5">
              <Label>{t('اسم المشروع', 'Project Name', lang)}</Label>
              <Input value={form.name || ''} onChange={e => set('name', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('العميل', 'Client', lang)}</Label>
              <Input value={form.clientName || ''} onChange={e => set('clientName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الفرع', 'Branch', lang)}</Label>
              <Input value={form.branchName || ''} onChange={e => set('branchName', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('مدير المشروع', 'Project Manager', lang)}</Label>
              <Input value={form.projectManager || ''} onChange={e => set('projectManager', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('مركز التكلفة', 'Cost Center', lang)}</Label>
              <Input value={form.costCenter || ''} onChange={e => set('costCenter', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الموقع', 'Location', lang)}</Label>
              <Input value={form.location || ''} onChange={e => set('location', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('نوع المشروع', 'Project Type', lang)}</Label>
              <Select value={form.projectType || 'CONSTRUCTION'} onValueChange={v => set('projectType', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(PROJECT_TYPES).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('الحالة', 'Status', lang)}</Label>
              <Select value={form.status || 'PLANNING'} onValueChange={v => set('status', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {availableStatuses.map(k => {
                    const v = PROJECT_STATUS[k];
                    return <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>;
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>{t('نسبة الإنجاز %', 'Completion %', lang)}</Label>
              <Input type="number" min="0" max="100" value={form.progressPercent ?? 0} onChange={e => set('progressPercent', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('قيمة العقد', 'Contract Value', lang)}</Label>
              <Input type="number" value={form.contractValue ?? 0} onChange={e => set('contractValue', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('تاريخ البدء', 'Start Date', lang)}</Label>
              <Input type="date" value={form.startDate || ''} onChange={e => set('startDate', e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('تاريخ الانتهاء', 'End Date', lang)}</Label>
              <Input type="date" value={form.endDate || ''} onChange={e => set('endDate', e.target.value)} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <Label>{t('الوصف', 'Description', lang)}</Label>
              <Textarea value={form.description || ''} onChange={e => set('description', e.target.value)} rows={3} />
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}