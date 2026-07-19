import React, { useState, useEffect } from 'react';
import { RefreshCw, Lock, Unlock, Receipt as ReceiptIcon, Printer, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { toast } from 'sonner';
import {
  currentBusinessDay, getOpenBusinessDay, openBusinessDay, closeBusinessDay, DEFAULT_BUSINESS_HOURS,
} from '@/lib/businessDay';
import { buildAccountMap } from '@/lib/financialEngine';

// شاشة إدارة يوم العمل: فتح/إغلاق الوردية + Z-Report.
// هذه الشاشة تكمّل محرّك businessDay.js: تتيح فتح اليوم بعدد افتتاحي،
// وإقفاله بعد عدّ النقد الفعلي، فتُحسب الفروقات وتُصدر Z-Report.
export default function BusinessDayScreen() {
  const { lang, activeProjectId, activeProjectName } = useStore();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [today, setToday] = useState(null); // يوم العمل المفتوح الحالي
  const [history, setHistory] = useState([]);
  const [journal, setJournal] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [closeOpen, setCloseOpen] = useState(false);
  const [working, setWorking] = useState('');

  const load = async () => {
    if (!activeProjectId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [open, days, jes, accs] = await Promise.all([
        getOpenBusinessDay(activeProjectId, DEFAULT_BUSINESS_HOURS),
        base44.entities.BusinessDay.filter({ branchId: activeProjectId }, '-dayDate', 60).catch(() => []),
        base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
        base44.entities.ChartAccount.list('code', 1000).catch(() => []),
      ]);
      setToday(open);
      setHistory(days || []);
      setJournal(jes || []);
      setAccounts(accs || []);
    } catch (e) {
      toast.error(e?.message || t('فشل تحميل البيانات', 'Failed to load', lang));
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, [activeProjectId]);

  if (!activeProjectId) {
    return (
      <ModuleLayout title={t('يوم العمل', 'Business Day', lang)} subtitle={t('اختر فرعاً أولاً', 'Select a branch first', lang)}>
        <Card><CardContent className="p-8 text-center text-muted-foreground">{t('اختر فرعاً', 'Select a branch', lang)}</CardContent></Card>
      </ModuleLayout>
    );
  }

  const handleOpen = async () => {
    setWorking('open');
    try {
      const day = await openBusinessDay({
        branchId: activeProjectId,
        branchName: activeProjectName,
        user,
        openingCash: Number(openingCash) || 0,
        hours: DEFAULT_BUSINESS_HOURS,
      });
      if (day) {
        toast.success(t('تم فتح يوم العمل', 'Business day opened', lang));
        setToday(day);
        setOpeningCash('');
        load();
      } else {
        toast.error(t('فشل فتح اليوم', 'Failed to open day', lang));
      }
    } catch (e) {
      toast.error(e?.message || t('فشل', 'Failed', lang));
    }
    setWorking('');
  };

  const handleClose = async () => {
    if (!today) return;
    setWorking('close');
    try {
      const accountMap = buildAccountMap(accounts);
      const closed = await closeBusinessDay({
        branchId: activeProjectId,
        hours: DEFAULT_BUSINESS_HOURS,
        closingCash: Number(closingCash) || 0,
        user,
        journalEntries: journal,
        accountMap,
      });
      toast.success(t('تم إقفال اليوم وإصدار Z-Report', 'Day closed & Z-Report issued', lang));
      setCloseOpen(false);
      setClosingCash('');
      setToday(null);
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل الإقفال', 'Close failed', lang));
    }
    setWorking('');
  };

  // النقد المتوقع في الدرج (للعرض قبل الإقفال) من القيود المرحّلة اليوم.
  // مهم: نحسب الصندوق (1111) فقط — البطاقات (1114) والبنك (1112) تُحصّل لاحقاً
  // ولا تدخل في عدّاد الدرّج الفعلي. لو جمعناها لظهر "النقد المتوقع" = إجمالي
  // المحصّل، وهو خطأ محاسبي يربك الكاشير.
  const expectedCash = React.useMemo(() => {
    if (!today) return 0;
    const accountMap = buildAccountMap(accounts);
    const dayDate = today.dayDate;
    let cashDelta = 0;       // 1111 — ما يدخل الدرّج
    let cardDelta = 0;       // 1114 — للمعلومة
    let bankDelta = 0;       // 1112 — للمعلومة
    for (const je of journal) {
      if (!je.isPosted) continue;
      // نصنّف القيد حسب يوم العمل (لا UTC) ليتوافق مع باقي التقارير.
      if (toBusinessDayDate(je.date, DEFAULT_BUSINESS_HOURS) !== dayDate) continue;
      for (const l of (je.lines || [])) {
        const acc = accountMap[l.accountCode] || {};
        const code = acc.code || '';
        const d = (Number(l.debit) || 0) - (Number(l.credit) || 0);
        if (code === '1111' || acc.semanticRole === 'CASH') cashDelta += d;
        else if (code === '1114') cardDelta += d;
        else if (code === '1112' || acc.semanticRole === 'BANK') bankDelta += d;
      }
    }
    return {
      total: +((Number(today.openingCash) || 0) + cashDelta).toFixed(2),
      cashCollected: +cashDelta.toFixed(2),
      cardCollected: +cardDelta.toFixed(2),
      bankCollected: +bankDelta.toFixed(2),
    };
  }, [today, journal, accounts]);

  return (
    <ModuleLayout
      title={t('يوم العمل والورديات', 'Business Day & Shifts', lang)}
      subtitle={t('فتح/إقفال الوردية وإصدار Z-Report للفرع: ', 'Open/close shifts and issue Z-Report for branch: ', lang) + (activeProjectName || '')}
      actions={<Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>}
    >
      {/* بطاقة حالة اليوم */}
      <Card className={today ? 'border-t-4 border-t-emerald-500' : 'border-t-4 border-t-amber-500'}>
        <CardContent className="p-5">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-2 mb-1">
                {today ? <Unlock className="size-5 text-emerald-600" /> : <Lock className="size-5 text-amber-600" />}
                <h2 className="text-lg font-bold">
                  {today
                    ? t('يوم العمل مفتوح', 'Business day open', lang)
                    : t('لا يوجد يوم عمل مفتوح', 'No open business day', lang)}
                </h2>
              </div>
              {today && (
                <p className="text-sm text-muted-foreground">
                  {t('التاريخ', 'Date', lang)}: <strong>{formatDate(today.dayDate, lang)}</strong>
                  {' · '}
                  {t('افتُتح بواسطة', 'Opened by', lang)}: <strong>{today.openedByName || '—'}</strong>
                  {' · '}
                  {t('النقد الافتتاحي', 'Opening cash', lang)}: <strong>{formatCurrency(today.openingCash, lang)}</strong>
                </p>
              )}
            </div>
            {today ? (
              <Button onClick={() => { setClosingCash(String(expectedCash.total)); setCloseOpen(true); }} className="gap-2 bg-rose-600 hover:bg-rose-700">
                <Lock className="size-4" /> {t('إقفال اليوم + Z-Report', 'Close day + Z-Report', lang)}
              </Button>
            ) : (
              <div className="flex items-end gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t('النقد الافتتاحي', 'Opening cash', lang)}</Label>
                  <Input type="number" min="0" step="0.01" value={openingCash} onChange={e => setOpeningCash(e.target.value)} placeholder="0.00" className="w-32" />
                </div>
                <Button onClick={handleOpen} disabled={working === 'open'} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
                  <Unlock className="size-4" /> {working === 'open' ? t('جاري...', '...', lang) : t('فتح يوم العمل', 'Open day', lang)}
                </Button>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* النقد المتوقع اليوم */}
      {today && (
        <Card>
          <CardHeader><CardTitle className="text-base">{t('النقد المتوقع في الدرج', 'Expected Cash in Drawer', lang)}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-muted-foreground">{t('افتتاحي', 'Opening', lang)}</p>
                <p className="text-lg font-bold">{formatCurrency(Number(today.openingCash) || 0, lang)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('تحصيلات نقد اليوم', 'Today cash collections', lang)}</p>
                <p className="text-lg font-bold text-emerald-600">{formatCurrency(expectedCash.cashCollected, lang)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{t('المتوقع للإغلاق', 'Expected at close', lang)}</p>
                <p className="text-lg font-bold text-blue-600">{formatCurrency(expectedCash.total, lang)}</p>
              </div>
            </div>
            {/* تفصيل التحصيلات حسب النوع — البطاقات/البنك لا تدخل الدرّج الفعلي
                (تُحصّل لاحقاً عبر تسويات). نعرضها للمعلومة فقط ليفهم الكاشير الفرق. */}
            {(expectedCash.cardCollected !== 0 || expectedCash.bankCollected !== 0) && (
              <div className="mt-3 pt-3 border-t grid grid-cols-2 gap-3 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>{t('تحصيلات البطاقات (خارج الدرّج)', 'Card collections (not in drawer)', lang)}</span>
                  <span className="font-medium">{formatCurrency(expectedCash.cardCollected, lang)}</span>
                </div>
                <div className="flex justify-between">
                  <span>{t('تحويلات بنكية (خارج الدرّج)', 'Bank transfers (not in drawer)', lang)}</span>
                  <span className="font-medium">{formatCurrency(expectedCash.bankCollected, lang)}</span>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* سجل الأيام السابقة */}
      <Card>
        <CardHeader><CardTitle className="text-base">{t('سجل الأيام', 'Days History', lang)}</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                  <TableHead>{t('الحالة', 'Status', lang)}</TableHead>
                  <TableHead>{t('افتتحها', 'Opened by', lang)}</TableHead>
                  <TableHead>{t('أقفلها', 'Closed by', lang)}</TableHead>
                  <TableHead className="text-end">{t('افتتاحي', 'Opening', lang)}</TableHead>
                  <TableHead className="text-end">{t('متوقع', 'Expected', lang)}</TableHead>
                  <TableHead className="text-end">{t('فعلي', 'Counted', lang)}</TableHead>
                  <TableHead className="text-end">{t('الفرق', 'Variance', lang)}</TableHead>
                  <TableHead>{t('Z-Report', 'Z-Report', lang)}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
                ) : history.length === 0 ? (
                  <TableRow><TableCell colSpan={9} className="text-center py-6 text-muted-foreground">{t('لا يوجد سجل', 'No history', lang)}</TableCell></TableRow>
                ) : history.map(d => {
                  const variance = Number(d.cashVariance) || 0;
                  return (
                    <TableRow key={d.id}>
                      <TableCell className="text-sm">{formatDate(d.dayDate, lang)}</TableCell>
                      <TableCell>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${d.status === 'OPEN' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-700'}`}>
                          {d.status === 'OPEN' ? t('مفتوح', 'Open', lang) : t('مقفل', 'Closed', lang)}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">{d.openedByName || '—'}</TableCell>
                      <TableCell className="text-xs">{d.closedByName || '—'}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(Number(d.openingCash) || 0, lang)}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(Number(d.expectedCash) || 0, lang)}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(Number(d.closingCash) || 0, lang)}</TableCell>
                      <TableCell className={`text-end text-sm font-semibold ${Math.abs(variance) < 0.01 ? 'text-muted-foreground' : variance > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {variance >= 0 ? '+' : ''}{formatCurrency(variance, lang)}
                      </TableCell>
                      <TableCell className="text-xs font-mono">{d.zReportNo || '—'}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* حوار إقفال اليوم */}
      <Dialog open={closeOpen} onOpenChange={setCloseOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ReceiptIcon className="size-5" />{t('إقفال يوم العمل', 'Close Business Day', lang)}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">{t('النقد المتوقع في الدرج', 'Expected cash in drawer', lang)}</span><strong>{formatCurrency(expectedCash.total, lang)}</strong></div>
              <p className="text-xs text-blue-700">{t('أدخل العدّاد الفعلي للنقد في الدرج فقط (لا يشمل البطاقات/البنك). سيتم حساب الفرق وإصدار Z-Report.', 'Enter the actual counted cash in the drawer only (excludes cards/bank). Variance will be computed and Z-Report issued.', lang)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('النقد الفعلي المعدود', 'Counted cash', lang)} *</Label>
              <Input type="number" min="0" step="0.01" value={closingCash} onChange={e => setClosingCash(e.target.value)} className="h-10" autoFocus />
              {closingCash !== '' && Math.abs((Number(closingCash) || 0) - expectedCash.total) >= 0.01 && (
                <p className={`text-xs flex items-center gap-1 ${Number(closingCash) < expectedCash.total ? 'text-rose-600' : 'text-emerald-600'}`}>
                  <AlertTriangle className="size-3" />
                  {Number(closingCash) < expectedCash.total
                    ? t('عجز بمقدار', 'Shortage of', lang) + ' ' + formatCurrency(expectedCash.total - (Number(closingCash) || 0), lang)
                    : t('فائض بمقدار', 'Surplus of', lang) + ' ' + formatCurrency((Number(closingCash) || 0) - expectedCash.total, lang)}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={handleClose} disabled={working === 'close' || closingCash === ''} className="bg-rose-600 hover:bg-rose-700 gap-2">
              <Lock className="size-4" />
              {working === 'close' ? t('جاري الإقفال...', 'Closing...', lang) : t('إقفال وإصدار Z-Report', 'Close & Issue Z-Report', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}
