import React, { useEffect, useState, useCallback } from 'react';
import { Lock, Unlock, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { t, formatCurrency } from '@/lib/utils-binaa';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  getOpenBusinessDay, openBusinessDay, closeBusinessDay, DEFAULT_BUSINESS_HOURS,
} from '@/lib/businessDay';
import { buildAccountMap } from '@/lib/financialEngine';
import { toBusinessDayDate } from '@/lib/businessDay';

/**
 * زر حالة الوردية في الشريط العلوي.
 *
 * يعرض الحالة الحالية ليوم العمل للفرع النشط:
 *  - "وردية مغلقة" (أحمر) → النقر يفتح نافذة فتح وردية جديدة (يطلب النقد الافتتاحي).
 *  - "وردية مفتوحة" (أخضر) → النقر يفتح نافذة إقفال الوردية (يطلب النقد الفعلي + يُظهر
 *    المتوقع والفرق، ثم يُنتج Z-Report عند التأكيد).
 *
 * هذا يلبّي طلب المستخدم: زر علوي واضح لإغلاق الوردية، يدخل فيه الكاشير النقدية
 * ويُقفل. شاشة يوم العمل التفصيلية تبقى متاحة للتقارير والتاريخ.
 */
export default function ShiftStatusButton() {
  const { lang, activeProjectId, activeProjectName } = useStore();
  const { user } = useAuth();
  const [today, setToday] = useState(null);     // يوم العمل المفتوح (أو null)
  const [loading, setLoading] = useState(false);
  const [dialogMode, setDialogMode] = useState(''); // 'open' | 'close' | ''
  const [openingCash, setOpeningCash] = useState('');
  const [closingCash, setClosingCash] = useState('');
  const [working, setWorking] = useState(false);
  // بيانات النقد المتوقع (تُحسب عند فتح نافذة الإقفال)
  const [expected, setExpected] = useState({ total: 0, cashCollected: 0, cardCollected: 0, bankCollected: 0 });

  const refresh = useCallback(async () => {
    if (!activeProjectId) { setToday(null); return; }
    try {
      const open = await getOpenBusinessDay(activeProjectId, DEFAULT_BUSINESS_HOURS);
      setToday(open);
    } catch {
      setToday(null);
    }
  }, [activeProjectId]);

  useEffect(() => {
    refresh();
    // تحديث كل 30 ثانية + عند العودة للنافذة — ليعكس الحالة بعد عمليات البيع/الإقفال.
    const tid = setInterval(refresh, 30000);
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(tid); window.removeEventListener('focus', onFocus); };
  }, [refresh]);

  // عند فتح نافذة الإقفال: احسب النقد المتوقع من القيود المرحّلة لهذا الفرع واليوم.
  const computeExpected = useCallback(async () => {
    if (!today) { setExpected({ total: 0, cashCollected: 0, cardCollected: 0, bankCollected: 0 }); return; }
    try {
      const [jes, accs] = await Promise.all([
        base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
        base44.entities.ChartAccount.list('code', 1000).catch(() => []),
      ]);
      const accountMap = buildAccountMap(accs);
      const dayDate = today.dayDate;
      const branchName = today.branchName || '';
      let cashDelta = 0, cardDelta = 0, bankDelta = 0;
      for (const je of (jes || [])) {
        if (!je || !je.isPosted) continue;
        if (toBusinessDayDate(je.date, DEFAULT_BUSINESS_HOURS) !== dayDate) continue;
        for (const l of (je.lines || [])) {
          if (branchName && (l.costCenter || '') !== branchName) continue;
          const acc = accountMap[l.accountCode] || {};
          const code = acc.code || '';
          const d = (Number(l.debit) || 0) - (Number(l.credit) || 0);
          if (code === '1111' || acc.semanticRole === 'CASH') cashDelta += d;
          else if (code === '1114') cardDelta += d;
          else if (code === '1112' || acc.semanticRole === 'BANK') bankDelta += d;
        }
      }
      const exp = {
        total: +((Number(today.openingCash) || 0) + cashDelta).toFixed(2),
        cashCollected: +cashDelta.toFixed(2),
        cardCollected: +cardDelta.toFixed(2),
        bankCollected: +bankDelta.toFixed(2),
      };
      setExpected(exp);
      // اقترح على الكاشير إدخال النقد المتوقع كقيمة افتراضية للإقفال.
      setClosingCash(String(exp.total));
    } catch (e) {
      console.warn('computeExpected failed:', e);
    }
  }, [today]);

  const openCloseDialog = () => {
    setDialogMode('close');
    computeExpected();
  };

  const handleOpen = async () => {
    if (!activeProjectId) return;
    setWorking(true);
    try {
      const day = await openBusinessDay({
        branchId: activeProjectId,
        branchName: activeProjectName,
        user,
        openingCash: Number(openingCash) || 0,
        hours: DEFAULT_BUSINESS_HOURS,
      });
      if (day) {
        toast.success(t('فُتحت الوردية بنجاح', 'Shift opened', lang));
        setDialogMode('');
        await refresh();
      } else {
        toast.error(t('فشل فتح الوردية', 'Failed to open shift', lang));
      }
    } catch (e) {
      toast.error(e?.message || t('فشل فتح الوردية', 'Failed to open shift', lang));
    }
    setWorking(false);
  };

  const handleClose = async () => {
    if (!activeProjectId || !today) return;
    setWorking(true);
    try {
      // حمّل القيود + الحسابات + فواتير البيع + المرتجعات لتمريرها لـ closeBusinessDay
      // التي تُنتج Z-Report التفصيلي (نقد/بطاقات بالتفصيل/منصات/خصومات/مرتجعات).
      const [jes, accs, invs, rets] = await Promise.all([
        base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
        base44.entities.ChartAccount.list('code', 1000).catch(() => []),
        base44.entities.SalesInvoice.list('-date', 500).catch(() => []),
        base44.entities.SalesReturn.list('-date', 200).catch(() => []),
      ]);
      const accountMap = buildAccountMap(accs);
      const closing = Number(closingCash) || 0;
      const result = await closeBusinessDay({
        branchId: activeProjectId,
        hours: DEFAULT_BUSINESS_HOURS,
        closingCash: closing,
        user,
        journalEntries: jes,
        accountMap,
        salesInvoices: invs,
        salesReturns: rets,
      });
      const variance = Number(result?.cashVariance || 0);
      const msg = variance >= -0.01 && variance <= 0.01
        ? t('تم إقفال الوردية — لا فرق', 'Shift closed — no variance', lang)
        : (variance < 0
            ? t('تم الإقفال — عجز ', 'Closed — shortage of ', lang) + formatCurrency(Math.abs(variance), lang)
            : t('تم الإقفال — فائض ', 'Closed — surplus of ', lang) + formatCurrency(variance, lang));
      toast.success(msg + ' · Z-Report: ' + (result?.zReportNo || '—'));
      setDialogMode('');
      await refresh();
    } catch (e) {
      toast.error(e?.message || t('فشل إقفال الوردية', 'Failed to close shift', lang));
    }
    setWorking(false);
  };

  if (!activeProjectId) return null;

  const isOpen = !!today;

  return (
    <>
      <button
        type="button"
        onClick={() => isOpen ? openCloseDialog() : setDialogMode('open')}
        className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
          isOpen
            ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
            : 'bg-rose-100 text-rose-700 hover:bg-rose-200'
        }`}
        title={isOpen
          ? t('الوردية مفتوحة — انقر للإقفال', 'Shift open — click to close', lang)
          : t('لا توجد وردية مفتوحة — انقر للفتح', 'No open shift — click to open', lang)}
      >
        {isOpen ? <Unlock className="size-3.5" /> : <Lock className="size-3.5" />}
        <span className="hidden sm:inline">
          {isOpen ? t('وردية مفتوحة', 'Shift Open', lang) : t('وردية مغلقة', 'Shift Closed', lang)}
        </span>
      </button>

      {/* نافذة فتح الوردية */}
      <Dialog open={dialogMode === 'open'} onOpenChange={(o) => !o && setDialogMode('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Unlock className="size-5 text-emerald-600" />
              {t('فتح وردية جديدة', 'Open New Shift', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <p className="text-sm text-muted-foreground">
              {t('الفرع:', 'Branch:', lang)} <strong>{activeProjectName || '—'}</strong>
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">{t('النقد الافتتاحي في الدرّج', 'Opening Cash in Drawer', lang)}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={openingCash}
                onChange={(e) => setOpeningCash(e.target.value)}
                placeholder="0.00"
                className="w-40"
              />
              <p className="text-[11px] text-muted-foreground">
                {t('أدخل ما يوجد فعلياً في درج الكاشير عند بدء الوردية.', 'Enter the actual cash in the drawer at shift start.', lang)}
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('')} disabled={working}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={handleOpen} disabled={working} className="bg-emerald-600 hover:bg-emerald-700 gap-2">
              <Unlock className="size-4" />
              {working ? t('جاري الفتح...', 'Opening...', lang) : t('فتح الوردية', 'Open Shift', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* نافذة إقفال الوردية */}
      <Dialog open={dialogMode === 'close'} onOpenChange={(o) => !o && setDialogMode('')}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Lock className="size-5 text-rose-600" />
              {t('إقفال الوردية وإصدار Z-Report', 'Close Shift & Issue Z-Report', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="rounded-lg bg-muted/50 p-3 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('الفرع', 'Branch', lang)}</span>
                <strong>{activeProjectName || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('التاريخ', 'Date', lang)}</span>
                <strong>{today?.dayDate || '—'}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('النقد الافتتاحي', 'Opening Cash', lang)}</span>
                <strong>{formatCurrency(Number(today?.openingCash) || 0, lang)}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t('تحصيلات نقد اليوم', 'Today Cash Sales', lang)}</span>
                <strong className="text-emerald-700">{formatCurrency(expected.cashCollected, lang)}</strong>
              </div>
              <div className="border-t pt-1.5 flex justify-between text-base">
                <span className="font-medium">{t('النقد المتوقع في الدرّج', 'Expected Cash in Drawer', lang)}</span>
                <strong className="text-blue-700">{formatCurrency(expected.total, lang)}</strong>
              </div>
              {expected.cardCollected !== 0 && (
                <div className="text-[11px] text-muted-foreground flex justify-between">
                  <span>{t('(تحصيلات البطاقات خارج الدرّج)', '(Cards outside drawer)', lang)}</span>
                  <span>{formatCurrency(expected.cardCollected, lang)}</span>
                </div>
              )}
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">{t('النقد الفعلي المعدود في الدرّج', 'Actual Counted Cash in Drawer', lang)}</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={closingCash}
                onChange={(e) => setClosingCash(e.target.value)}
                className="w-40"
              />
              {closingCash !== '' && Math.abs((Number(closingCash) || 0) - expected.total) >= 0.01 && (
                <p className={`text-xs flex items-center gap-1 ${Number(closingCash) < expected.total ? 'text-rose-600' : 'text-emerald-700'}`}>
                  <AlertTriangle className="size-3" />
                  {Number(closingCash) < expected.total
                    ? t('عجز ', 'Shortage ', lang) + formatCurrency(expected.total - (Number(closingCash) || 0), lang)
                    : t('فائض ', 'Surplus ', lang) + formatCurrency((Number(closingCash) || 0) - expected.total, lang)}
                </p>
              )}
            </div>

            <p className="text-[11px] text-muted-foreground">
              {t('عند التأكيد سيُصدر النظام Z-Report ويُقفل اليوم. لا يمكن التراجع — استخدم يوماً جديداً للورديات اللاحقة.',
                 'On confirm the system issues a Z-Report and closes the day. Cannot be undone — open a new day for subsequent shifts.', lang)}
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogMode('')} disabled={working}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={handleClose} disabled={working} className="bg-rose-600 hover:bg-rose-700 gap-2">
              <Lock className="size-4" />
              {working ? t('جاري الإقفال...', 'Closing...', lang) : t('إقفال + Z-Report', 'Close + Z-Report', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
