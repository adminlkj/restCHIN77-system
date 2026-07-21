import React, { useEffect, useMemo, useState } from 'react';
import { Printer, Send, X, FileText, TrendingUp, Wallet, CreditCard, Bike, RotateCcw, Percent } from 'lucide-react';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useStore } from '@/lib/store';
import { t, formatCurrency } from '@/lib/utils-binaa';
import { base44 } from '@/api/base44Client';
import { buildAccountMap } from '@/lib/financialEngine';
import { toBusinessDayDate, DEFAULT_BUSINESS_HOURS, getOpenBusinessDay } from '@/lib/businessDay';

/**
 * مربع حوار "تقرير اليوم" من شاشة POS.
 *
 * يعرض للكاشير ملخصاً تنفيذياً ليوم العمل الحالي للفرع النشط:
 *   - ملخص النقد في الدرج (افتتاحي + تحصيلات + متوقع)
 *   - التحصيلات بالتفصيل: نقد / بنك / مدى / فيزا / ماستركارد / أخرى
 *   - مبيعات المنصات بالتفصيل (هنقرستيشن / كيتا / ...) مع العمولات
 *   - الخصومات الممنوحة
 *   - المرتجعات
 *   - عدد الفواتير + متوسط الإيصال
 *
 * يدعم:
 *   - طباعة حرارية 80mm (لطابعة الإيصالات)
 *   - طباعة A4 (للأرشفة)
 *   - إرسال عبر واتساب (يفتح whatsapp.com برسالة منسّقة)
 *
 * هذا يلبّي طلب المستخدم: الكاشير يجب أن يستطيع طباعة/إرسال تقرير اليوم
 * مباشرة من شاشة نقطة البيع دون مغادرة الشاشة أو الرجوع لمطور النظام.
 */
export default function DailyReportDialog({ open, onOpenChange }) {
  const { lang, activeProjectId, activeProjectName } = useStore();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!open || !activeProjectId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [jes, accs, invs, rets, open] = await Promise.all([
          base44.entities.JournalEntry.filter({ isPosted: true }).catch(() => []),
          base44.entities.ChartAccount.list('code', 1000).catch(() => []),
          base44.entities.SalesInvoice.list('-date', 500).catch(() => []),
          base44.entities.SalesReturn.list('-date', 200).catch(() => []),
          getOpenBusinessDay(activeProjectId, DEFAULT_BUSINESS_HOURS).catch(() => null),
        ]);
        if (cancelled) return;
        const result = computeDayTotals({ jes, accs, invs, rets, open, branchName: activeProjectName });
        setData(result);
      } catch (e) {
        console.warn('DailyReport load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [open, activeProjectId, activeProjectName]);

  if (!open) return null;

  const handlePrint = (paperSize = '80mm') => {
    if (!data) return;
    const html = buildPrintHtml(data, lang, activeProjectName, paperSize);
    const w = window.open('', '_blank', paperSize === '80mm' ? 'width=380,height=620' : 'width=800,height=1000');
    if (!w) {
      alert(lang === 'ar' ? 'متصفحك حظر النافذة المنبثقة. الرجاء السماح بالنوافذ المنبثقة لهذا الموقع.' : 'Your browser blocked the popup.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.focus();
  };

  const handleWhatsApp = () => {
    if (!data) return;
    const msg = buildWhatsAppMessage(data, lang, activeProjectName);
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[92vh] overflow-y-auto">
        <DialogTitle className="sr-only">{t('تقرير اليوم', 'Daily Report', lang)}</DialogTitle>
        <div className="flex items-center justify-between px-4 py-3 border-b bg-blue-50">
          <div className="flex items-center gap-2">
            <FileText className="size-5 text-blue-700" />
            <h3 className="font-bold text-blue-900">{t('تقرير اليوم', 'Daily Report', lang)}</h3>
            <span className="text-xs text-muted-foreground">· {activeProjectName || '—'}</span>
          </div>
          <button onClick={() => onOpenChange(false)} className="text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('جاري التحميل...', 'Loading...', lang)}</div>
        ) : !data ? (
          <div className="p-8 text-center text-muted-foreground text-sm">{t('لا توجد بيانات', 'No data', lang)}</div>
        ) : (
          <>
            <div className="p-4 space-y-4 text-sm">
              {/* رأس التقرير */}
              <div className="rounded-lg bg-muted/50 p-3 text-xs">
                <div className="flex justify-between"><span className="text-muted-foreground">{t('الفرع', 'Branch', lang)}</span><strong>{activeProjectName || '—'}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('التاريخ', 'Date', lang)}</span><strong>{data.dayDate}</strong></div>
                <div className="flex justify-between"><span className="text-muted-foreground">{t('حالة الوردية', 'Shift Status', lang)}</span><strong>{data.shiftOpen ? t('مفتوحة', 'Open', lang) : t('مغلقة', 'Closed', lang)}</strong></div>
                {data.openingCash > 0 && (
                  <div className="flex justify-between"><span className="text-muted-foreground">{t('النقد الافتتاحي', 'Opening Cash', lang)}</span><strong>{formatCurrency(data.openingCash, lang)}</strong></div>
                )}
              </div>

              {/* ملخص الإيرادات */}
              <Section icon={<TrendingUp className="size-4 text-emerald-600" />} title={t('ملخص المبيعات', 'Sales Summary', lang)}>
                <Row label={t('عدد الفواتير', 'Invoices', lang)} value={data.invoiceCount} />
                <Row label={t('إجمالي المبيعات (شامل VAT)', 'Gross Sales (incl. VAT)', lang)} value={formatCurrency(data.grossSales, lang)} />
                <Row label={t('ضريبة القيمة المضافة', 'VAT Collected', lang)} value={formatCurrency(data.vatCollected, lang)} />
                <Row label={t('صافي المبيعات (بدون VAT)', 'Net Sales (excl. VAT)', lang)} value={formatCurrency(data.netSales, lang)} strong />
                {data.invoiceCount > 0 && (
                  <Row label={t('متوسط الإيصال', 'Avg. Invoice', lang)} value={formatCurrency(data.grossSales / data.invoiceCount, lang)} />
                )}
              </Section>

              {/* النقد في الدرج */}
              <Section icon={<Wallet className="size-4 text-amber-600" />} title={t('النقد في الدرج', 'Cash in Drawer', lang)}>
                <Row label={t('الافتتاحي', 'Opening', lang)} value={formatCurrency(data.openingCash, lang)} />
                <Row label={t('تحصيلات نقد اليوم', 'Today Cash Sales', lang)} value={formatCurrency(data.cashCollected, lang)} />
                <Row label={t('النقد المتوقع', 'Expected Cash', lang)} value={formatCurrency(data.expectedCash, lang)} strong />
              </Section>

              {/* تفصيل طرق التحصيل */}
              <Section icon={<CreditCard className="size-4 text-blue-600" />} title={t('تفصيل طرق التحصيل', 'Collection Methods', lang)}>
                <Row label={t('نقداً', 'Cash', lang)} value={formatCurrency(data.payments.cash, lang)} />
                <Row label={t('تحويل بنكي', 'Bank Transfer', lang)} value={formatCurrency(data.payments.bank, lang)} />
                <Row label={t('بطاقة مدى', 'Mada', lang)} value={formatCurrency(data.payments.cards.mada, lang)} />
                <Row label={t('بطاقة فيزا', 'Visa', lang)} value={formatCurrency(data.payments.cards.visa, lang)} />
                <Row label={t('بطاقة ماستركارد', 'Mastercard', lang)} value={formatCurrency(data.payments.cards.mastercard, lang)} />
                <Row label={t('بطاقة أخرى', 'Other Card', lang)} value={formatCurrency(data.payments.cards.other, lang)} />
                <Row label={t('إجمالي البطاقات', 'Total Cards', lang)} value={formatCurrency(data.payments.cards.total, lang)} strong />
              </Section>

              {/* بيع المنصات */}
              {Object.keys(data.platforms).length > 0 && (
                <Section icon={<Bike className="size-4 text-purple-600" />} title={t('بيع المنصات', 'Platform Sales', lang)}>
                  {Object.entries(data.platforms).map(([name, p]) => (
                    <div key={name} className="py-1.5 border-b last:border-0">
                      <div className="flex justify-between text-xs">
                        <span className="font-medium">{name}</span>
                        <span className="text-muted-foreground">{p.count} {t('طلب', 'orders', lang)}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-0.5">
                        <span className="text-muted-foreground">{t('الإجمالي', 'Gross', lang)}: {formatCurrency(p.gross, lang)}</span>
                        <span className="text-muted-foreground">{t('العمولة', 'Commission', lang)}: {formatCurrency(p.commission, lang)}</span>
                      </div>
                      <div className="flex justify-between text-xs mt-0.5">
                        <span className="font-semibold">{t('الصافي', 'Net', lang)}</span>
                        <span className="font-semibold">{formatCurrency(p.net, lang)}</span>
                      </div>
                    </div>
                  ))}
                </Section>
              )}

              {/* الخصومات */}
              {data.discounts > 0 && (
                <Section icon={<Percent className="size-4 text-rose-600" />} title={t('الخصومات الممنوحة', 'Discounts Granted', lang)}>
                  <Row label={t('إجمالي الخصومات', 'Total Discounts', lang)} value={formatCurrency(data.discounts, lang)} strong />
                </Section>
              )}

              {/* المرتجعات */}
              {data.returns.total > 0 && (
                <Section icon={<RotateCcw className="size-4 text-rose-600" />} title={t('المرتجعات', 'Returns', lang)}>
                  <Row label={t('عدد المرتجعات', 'Returns Count', lang)} value={data.returns.count} />
                  <Row label={t('إجمالي المرتجعات', 'Returns Total', lang)} value={formatCurrency(data.returns.total, lang)} tone="text-rose-600" strong />
                </Section>
              )}
            </div>

            {/* أزرار الإجراءات */}
            <div className="border-t p-3 flex flex-wrap gap-2 justify-end">
              <Button variant="outline" size="sm" onClick={() => handlePrint('80mm')} className="gap-1.5">
                <Printer className="size-3.5" />
                {t('طباعة حرارية', 'Thermal Print', lang)}
              </Button>
              <Button variant="outline" size="sm" onClick={() => handlePrint('A4')} className="gap-1.5">
                <FileText className="size-3.5" />
                {t('طباعة A4', 'A4 Print', lang)}
              </Button>
              <Button variant="outline" size="sm" onClick={handleWhatsApp} className="gap-1.5 text-emerald-700 border-emerald-300 hover:bg-emerald-50">
                <Send className="size-3.5" />
                {t('إرسال واتساب', 'WhatsApp', lang)}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Section({ icon, title, children }) {
  return (
    <div>
      <h4 className="font-bold mb-2 flex items-center gap-1.5 text-sm">{icon}{title}</h4>
      <div className="rounded-md border divide-y">{children}</div>
    </div>
  );
}

function Row({ label, value, strong, tone }) {
  return (
    <div className="flex items-center justify-between px-3 py-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm ${strong ? 'font-bold' : 'font-medium'} ${tone || ''}`}>{value}</span>
    </div>
  );
}

/**
 * يبنى كائن الإحصاءات ليوم واحد وفرع واحد.
 */
function computeDayTotals({ jes, accs, invs, rets, open, branchName }) {
  const accountMap = buildAccountMap(accs);
  const dayDate = open?.dayDate || toBusinessDayDate(new Date().toISOString(), DEFAULT_BUSINESS_HOURS);
  const openingCash = Number(open?.openingCash) || 0;

  // من القيود المرحّلة: الإيرادات/VAT/النقد/البطاقات (صافي = مدين − دائن).
  let grossSales = 0, vatCollected = 0, cashDelta = 0, cardDelta = 0, bankDelta = 0;
  for (const je of (jes || [])) {
    if (!je || !je.isPosted) continue;
    if (toBusinessDayDate(je.date, DEFAULT_BUSINESS_HOURS) !== dayDate) continue;
    for (const l of (je.lines || [])) {
      if (branchName && (l.costCenter || '') !== branchName) continue;
      const acc = accountMap[l.accountCode] || {};
      const code = acc.code || '';
      const d = (Number(l.debit) || 0) - (Number(l.credit) || 0);
      if (acc.accountType === 'REVENUE') {
        if (je.sourceType === 'SalesReturn') continue; // يُحسب من جداول المرتجعات
        grossSales += (l.credit - l.debit);
      } else if (acc.semanticRole === 'VAT_PAYABLE') {
        if (je.sourceType === 'SalesReturn') continue;
        vatCollected += (l.credit - l.debit);
      }
      if (code === '1111' || acc.semanticRole === 'CASH') cashDelta += d;
      else if (code === '1114') cardDelta += d;
      else if (code === '1112' || acc.semanticRole === 'BANK') bankDelta += d;
    }
  }

  // من فواتير اليوم: تفصيل طرق الدفع، المنصات، الخصومات.
  const payments = { cash: 0, bank: 0, cards: { mada: 0, visa: 0, mastercard: 0, other: 0, total: 0 } };
  const platforms = {};
  let discounts = 0, invoiceCount = 0;
  for (const inv of (invs || [])) {
    if (!inv || inv.status === 'CANCELLED' || inv.status === 'DRAFT') continue;
    if (toBusinessDayDate(inv.date, DEFAULT_BUSINESS_HOURS) !== dayDate) continue;
    if (branchName && (inv.projectName || '') !== branchName) continue;
    invoiceCount++;
    const disc = Number(inv.discountAmount || 0);
    if (disc > 0) discounts += disc;
    let notesObj = {};
    try { notesObj = inv.notes ? JSON.parse(inv.notes) : {}; } catch { notesObj = {}; }
    const pays = Array.isArray(notesObj.payments) ? notesObj.payments : [];
    for (const p of pays) {
      const amt = Number(p.amount || 0);
      const m = String(p.method || '').toUpperCase();
      if (m === 'CASH' || m === 'C') payments.cash += amt;
      else if (m === 'CARD_MADA' || m === 'MADA') payments.cards.mada += amt;
      else if (m === 'CARD_VISA' || m === 'VISA') payments.cards.visa += amt;
      else if (m === 'CARD_MC' || m === 'MASTERCARD' || m === 'MC') payments.cards.mastercard += amt;
      else if (m === 'CARD_OTHER' || m === 'CARD') payments.cards.other += amt;
      else if (m === 'BANK' || m === 'BANK_TRANSFER') payments.bank += amt;
    }
    payments.cards.total = payments.cards.mada + payments.cards.visa + payments.cards.mastercard + payments.cards.other;
    if (notesObj.isPlatformSale || inv.isPlatformSale) {
      const pname = notesObj?.platform?.platformName || inv.platformName || 'منصة';
      const commission = Number(notesObj?.platform?.platformCommission || inv.platformCommission || 0);
      if (!platforms[pname]) platforms[pname] = { count: 0, gross: 0, commission: 0, net: 0 };
      platforms[pname].count += 1;
      platforms[pname].gross += Number(inv.totalAmount || 0);
      platforms[pname].commission += commission;
      platforms[pname].net += Number(inv.totalAmount || 0) - commission;
    }
  }

  // المرتجعات.
  const returnsAgg = { count: 0, total: 0 };
  for (const sr of (rets || [])) {
    if (!sr) continue;
    if (toBusinessDayDate(sr.date || sr.createdAt, DEFAULT_BUSINESS_HOURS) !== dayDate) continue;
    if (branchName && (sr.branchName || sr.costCenter || '') !== branchName) continue;
    returnsAgg.count++;
    returnsAgg.total += Number(sr.totalAmount || 0);
  }

  return {
    dayDate,
    shiftOpen: !!open,
    openingCash,
    grossSales: +grossSales.toFixed(2),
    vatCollected: +vatCollected.toFixed(2),
    netSales: +(grossSales - vatCollected).toFixed(2),
    invoiceCount,
    cashCollected: +cashDelta.toFixed(2),
    expectedCash: +(openingCash + cashDelta).toFixed(2),
    payments: {
      cash: +payments.cash.toFixed(2),
      bank: +payments.bank.toFixed(2),
      cards: {
        mada: +payments.cards.mada.toFixed(2),
        visa: +payments.cards.visa.toFixed(2),
        mastercard: +payments.cards.mastercard.toFixed(2),
        other: +payments.cards.other.toFixed(2),
        total: +payments.cards.total.toFixed(2),
      },
    },
    platforms,
    discounts: +discounts.toFixed(2),
    returns: { count: returnsAgg.count, total: +returnsAgg.total.toFixed(2) },
  };
}

/**
 * يبني HTML قابل للطباعة (80mm أو A4) من بيانات التقرير.
 */
function buildPrintHtml(data, lang, branchName, paperSize) {
  const rtl = lang === 'ar';
  const width = paperSize === '80mm' ? '80mm' : '210mm';
  const padding = paperSize === '80mm' ? '2mm' : '15mm';
  const fontSize = paperSize === '80mm' ? '11px' : '13px';
  const titleSize = paperSize === '80mm' ? '14px' : '20px';
  const lines = [];

  const push = (label, value, opts = {}) => {
    const strong = opts.strong ? 'font-weight:700;' : '';
    const tone = opts.tone === 'red' ? 'color:#dc2626;' : opts.tone === 'green' ? 'color:#059669;' : '';
    lines.push(`<div style="display:flex;justify-content:space-between;padding:2px 0;${strong}${tone}"><span>${label}</span><span>${value}</span></div>`);
  };
  const section = (title) => lines.push(`<div style="margin-top:8px;padding:3px 0;border-bottom:1px dashed #999;font-weight:700;font-size:${paperSize === '80mm' ? '12px' : '15px'}">${title}</div>`);

  lines.push(`<div style="text-align:center;font-size:${titleSize};font-weight:700;margin-bottom:4px">${lang === 'ar' ? 'تقرير اليوم' : 'Daily Report'}</div>`);
  lines.push(`<div style="text-align:center;font-size:11px;margin-bottom:6px">${branchName || ''} · ${data.dayDate}</div>`);

  section(lang === 'ar' ? 'ملخص المبيعات' : 'Sales Summary');
  push(lang === 'ar' ? 'عدد الفواتير' : 'Invoices', data.invoiceCount);
  push(lang === 'ar' ? 'الإجمالي شامل VAT' : 'Gross (incl. VAT)', formatCurrency(data.grossSales, lang));
  push(lang === 'ar' ? 'ضريبة القيمة المضافة' : 'VAT', formatCurrency(data.vatCollected, lang));
  push(lang === 'ar' ? 'الصافي قبل VAT' : 'Net (excl. VAT)', formatCurrency(data.netSales, lang), { strong: true });

  section(lang === 'ar' ? 'النقد في الدرج' : 'Cash in Drawer');
  push(lang === 'ar' ? 'الافتتاحي' : 'Opening', formatCurrency(data.openingCash, lang));
  push(lang === 'ar' ? 'تحصيلات اليوم' : 'Today Cash', formatCurrency(data.cashCollected, lang));
  push(lang === 'ar' ? 'المتوقع' : 'Expected', formatCurrency(data.expectedCash, lang), { strong: true });

  section(lang === 'ar' ? 'طرق التحصيل' : 'Collection Methods');
  push(lang === 'ar' ? 'نقداً' : 'Cash', formatCurrency(data.payments.cash, lang));
  push(lang === 'ar' ? 'بنك' : 'Bank', formatCurrency(data.payments.bank, lang));
  push(lang === 'ar' ? 'مدى' : 'Mada', formatCurrency(data.payments.cards.mada, lang));
  push(lang === 'ar' ? 'فيزا' : 'Visa', formatCurrency(data.payments.cards.visa, lang));
  push(lang === 'ar' ? 'ماستركارد' : 'Mastercard', formatCurrency(data.payments.cards.mastercard, lang));
  push(lang === 'ar' ? 'أخرى' : 'Other', formatCurrency(data.payments.cards.other, lang));
  push(lang === 'ar' ? 'إجمالي البطاقات' : 'Total Cards', formatCurrency(data.payments.cards.total, lang), { strong: true });

  if (Object.keys(data.platforms).length > 0) {
    section(lang === 'ar' ? 'بيع المنصات' : 'Platform Sales');
    for (const [name, p] of Object.entries(data.platforms)) {
      push(`${name} (${p.count})`, formatCurrency(p.gross, lang));
      push(`↳ ${lang === 'ar' ? 'العمولة' : 'Commission'}`, '-' + formatCurrency(p.commission, lang), { tone: 'red' });
      push(`↳ ${lang === 'ar' ? 'الصافي' : 'Net'}`, formatCurrency(p.net, lang), { strong: true });
    }
  }

  if (data.discounts > 0) {
    section(lang === 'ar' ? 'الخصومات' : 'Discounts');
    push(lang === 'ar' ? 'الإجمالي' : 'Total', formatCurrency(data.discounts, lang), { tone: 'red', strong: true });
  }

  if (data.returns.total > 0) {
    section(lang === 'ar' ? 'المرتجعات' : 'Returns');
    push(lang === 'ar' ? 'العدد' : 'Count', data.returns.count);
    push(lang === 'ar' ? 'الإجمالي' : 'Total', formatCurrency(data.returns.total, lang), { tone: 'red', strong: true });
  }

  lines.push(`<div style="margin-top:10px;text-align:center;font-size:10px;color:#666">${new Date().toLocaleString(lang === 'ar' ? 'ar-SA' : 'en-US')}</div>`);

  return `<!DOCTYPE html><html dir="${rtl ? 'rtl' : 'ltr'}" lang="${lang}"><head><meta charset="utf-8"><title>${lang === 'ar' ? 'تقرير اليوم' : 'Daily Report'}</title>
    <style>
      @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&display=swap');
      @font-face { font-family:'saudi_riyal'; src:url('https://cdn.jsdelivr.net/gh/emran-alhaddad/Saudi-Riyal-Font@1.1.1/fonts/regular/saudi_riyal.woff2') format('woff2'); unicode-range:U+20C1; }
      * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      body { margin:0; padding:0; font-family:'saudi_riyal','Cairo','Tahoma',sans-serif; color:#000; direction:${rtl ? 'rtl' : 'ltr'}; font-size:${fontSize}; }
      .wrap { width:${width}; margin:0 auto; padding:${padding}; }
      @page { size:${width} auto; margin:2mm; }
      @media screen { body { background:#f1f5f9; padding:16px; } }
    </style></head>
    <body><div class="wrap">${lines.join('')}</div>
    <script>window.onload=function(){setTimeout(function(){window.print();},400);}<\/script>
    </body></html>`;
}

/**
 * يبني رسالة واتساب منسّقة من بيانات التقرير.
 */
function buildWhatsAppMessage(data, lang, branchName) {
  const L = lang === 'ar';
  const lines = [];
  lines.push(`*${L ? '📊 تقرير اليوم' : '📊 Daily Report'}*`);
  lines.push(`${L ? '🏪 الفرع' : '🏪 Branch'}: ${branchName || '-'}`);
  lines.push(`${L ? '📅 التاريخ' : '📅 Date'}: ${data.dayDate}`);
  lines.push('');
  lines.push(`*${L ? '💰 ملخص المبيعات' : '💰 Sales Summary'}*`);
  lines.push(`${L ? 'عدد الفواتير' : 'Invoices'}: ${data.invoiceCount}`);
  lines.push(`${L ? 'الإجمالي شامل VAT' : 'Gross (incl. VAT)'}: ${formatCurrency(data.grossSales, lang)}`);
  lines.push(`${L ? 'الصافي قبل VAT' : 'Net (excl. VAT)'}: ${formatCurrency(data.netSales, lang)}`);
  lines.push('');
  lines.push(`*${L ? '💵 النقد' : '💵 Cash'}*`);
  lines.push(`${L ? 'الافتتاحي' : 'Opening'}: ${formatCurrency(data.openingCash, lang)}`);
  lines.push(`${L ? 'تحصيلات اليوم' : 'Today Cash'}: ${formatCurrency(data.cashCollected, lang)}`);
  lines.push(`${L ? 'المتوقع في الدرج' : 'Expected'}: ${formatCurrency(data.expectedCash, lang)}`);
  lines.push('');
  lines.push(`*${L ? '💳 البطاقات' : '💳 Cards'}*`);
  lines.push(`${L ? 'مدى' : 'Mada'}: ${formatCurrency(data.payments.cards.mada, lang)}`);
  lines.push(`${L ? 'فيزا' : 'Visa'}: ${formatCurrency(data.payments.cards.visa, lang)}`);
  lines.push(`${L ? 'ماستركارد' : 'Mastercard'}: ${formatCurrency(data.payments.cards.mastercard, lang)}`);
  lines.push(`${L ? 'أخرى' : 'Other'}: ${formatCurrency(data.payments.cards.other, lang)}`);
  lines.push(`${L ? 'إجمالي البطاقات' : 'Total Cards'}: ${formatCurrency(data.payments.cards.total, lang)}`);
  if (Object.keys(data.platforms).length > 0) {
    lines.push('');
    lines.push(`*${L ? '🛵 المنصات' : '🛵 Platforms'}*`);
    for (const [name, p] of Object.entries(data.platforms)) {
      lines.push(`${name}: ${formatCurrency(p.gross, lang)} (${L ? 'صافي' : 'net'} ${formatCurrency(p.net, lang)})`);
    }
  }
  if (data.discounts > 0) {
    lines.push('');
    lines.push(`*${L ? '🏷️ الخصومات' : '🏷️ Discounts'}*: ${formatCurrency(data.discounts, lang)}`);
  }
  if (data.returns.total > 0) {
    lines.push('');
    lines.push(`*${L ? '↩️ المرتجعات' : '↩️ Returns'}*: ${data.returns.count} ${L ? 'بقيمة' : 'worth'} ${formatCurrency(data.returns.total, lang)}`);
  }
  return lines.join('\n');
}
