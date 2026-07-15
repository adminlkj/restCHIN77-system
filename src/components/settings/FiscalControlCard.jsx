import React, { useEffect, useState } from 'react';
import { CalendarClock, CheckCircle2, Loader2, Lock, Plus, RotateCw } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { base44 } from '@/api/base44Client';
import { OperationEngine } from '@/lib/businessEngine';
import { useStore } from '@/lib/store';
import { t, formatDate } from '@/lib/utils-binaa';
import { toast } from 'sonner';

const statusTone = {
  OPEN: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  CLOSED: 'bg-amber-100 text-amber-700 border-amber-200',
  LOCKED: 'bg-rose-100 text-rose-700 border-rose-200',
};

export default function FiscalControlCard() {
  const { lang } = useStore();
  const [years, setYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState('');

  const load = async () => {
    setLoading(true);
    const rows = await base44.entities.FiscalYear.list('-startDate', 30);
    setYears(rows || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const current = years.find(y => y.isCurrent) || years.find(y => y.status === 'OPEN');
  const openYears = years.filter(y => y.status === 'OPEN');
  const statusLabel = (s) => ({ OPEN: t('مفتوحة', 'Open', lang), CLOSED: t('مغلقة', 'Closed', lang), LOCKED: t('مقفلة', 'Locked', lang) }[s] || s);

  const setCurrentYear = async (year) => {
    setWorking(`set-${year.id}`);
    await Promise.all(years.filter(y => y.isCurrent && y.id !== year.id).map(y => base44.entities.FiscalYear.update(y.id, { isCurrent: false })));
    await base44.entities.FiscalYear.update(year.id, { isCurrent: true });
    toast.success(t('تم تعيين السنة الجارية', 'Current fiscal year updated', lang));
    await load();
    setWorking('');
  };

  const createThisYear = async () => {
    setWorking('create');
    const year = new Date().getFullYear();
    const found = years.find(y => Number(y.year) === year);
    if (found) {
      await setCurrentYear(found);
      return;
    }
    await Promise.all(years.filter(y => y.isCurrent).map(y => base44.entities.FiscalYear.update(y.id, { isCurrent: false })));
    await base44.entities.FiscalYear.create({
      name: `${t('السنة المالية', 'Fiscal Year', lang)} ${year}`,
      year,
      startDate: `${year}-01-01`,
      endDate: `${year}-12-31`,
      status: 'OPEN',
      isCurrent: true,
    });
    toast.success(t('تم إنشاء سنة مالية جارية', 'Current fiscal year created', lang));
    await load();
    setWorking('');
  };

  const closeCurrentYear = async () => {
    if (!current || current.status !== 'OPEN') return;
    const ok = window.confirm(t('سيتم إقفال السنة وترحيل الأرصدة الافتتاحية للسنة التالية. هل تريد المتابعة؟', 'This will close the year and carry opening balances to the next year. Continue?', lang));
    if (!ok) return;
    setWorking('close');
    await OperationEngine.closeFiscalYear(current.id);
    toast.success(t('تم إقفال السنة وفتح السنة التالية', 'Year closed and next year opened', lang));
    await load();
    setWorking('');
  };

  if (loading) return <Card><CardContent className="py-10 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base flex items-center gap-2"><CalendarClock className="size-4" />{t('التحكم بالسنة المالية', 'Fiscal Year Control', lang)}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{t('السنة الجارية', 'Current Year', lang)}</p><p className="font-semibold mt-1">{current?.name || t('غير محددة', 'Not set', lang)}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{t('سنوات مفتوحة', 'Open Years', lang)}</p><p className="font-semibold mt-1">{openYears.length}</p></div>
          <div className="rounded-xl border p-3"><p className="text-xs text-muted-foreground">{t('حارس الترحيل', 'Posting Guard', lang)}</p><p className="font-semibold mt-1 text-emerald-700">{t('مفعّل', 'Active', lang)}</p></div>
        </div>

        <div className="rounded-xl border bg-emerald-50/50 p-3 text-sm text-emerald-800">
          {t('أي قيد أو عملية مالية لا تقع داخل سنة مالية مفتوحة سيتم رفضها تلقائياً، لذلك تتحكم هذه الإعدادات مباشرة في السماح بالترحيل.', 'Any financial posting outside an open fiscal year is rejected automatically, so these settings directly control posting access.', lang)}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={createThisYear} disabled={!!working} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">{working === 'create' ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}{t('إنشاء/تعيين سنة هذا العام', 'Create/Set This Year', lang)}</Button>
          <Button onClick={closeCurrentYear} disabled={!!working || !current || current.status !== 'OPEN'} variant="outline" className="gap-1.5">{working === 'close' ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-4" />}{t('إقفال السنة الجارية', 'Close Current Year', lang)}</Button>
          <Button onClick={load} disabled={!!working} variant="ghost" className="gap-1.5"><RotateCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>

        <div className="space-y-2">
          {years.map(y => (
            <div key={y.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border p-3">
              <div><p className="font-medium">{y.name}</p><p className="text-xs text-muted-foreground">{formatDate(y.startDate, lang)} — {formatDate(y.endDate, lang)}</p></div>
              <div className="flex items-center gap-2">
                {y.isCurrent && <span className="text-xs rounded-full bg-blue-100 text-blue-700 px-2 py-1">{t('جارية', 'Current', lang)}</span>}
                <span className={`text-xs rounded-full border px-2 py-1 ${statusTone[y.status] || statusTone.OPEN}`}>{statusLabel(y.status)}</span>
                {y.status === 'OPEN' && !y.isCurrent && <Button size="sm" variant="outline" disabled={working === `set-${y.id}`} onClick={() => setCurrentYear(y)}>{working === `set-${y.id}` ? <Loader2 className="size-3.5 animate-spin" /> : <CheckCircle2 className="size-3.5" />}{t('تعيين', 'Set', lang)}</Button>}
              </div>
            </div>
          ))}
          {years.length === 0 && <div className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">{t('لا توجد سنوات مالية بعد. أنشئ سنة هذا العام للبدء بالترحيل.', 'No fiscal years yet. Create this year to start posting.', lang)}</div>}
        </div>
      </CardContent>
    </Card>
  );
}