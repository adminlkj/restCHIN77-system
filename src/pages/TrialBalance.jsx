import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, CheckCircle, XCircle, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { buildTrialBalance, buildAccountLedger } from '@/lib/ledgerEngine';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import TableToolbar from '@/components/shared/TableToolbar';

const TYPE_META = {
  ASSET: { ar: 'أصول', en: 'Assets', color: 'text-blue-600' },
  LIABILITY: { ar: 'خصوم', en: 'Liabilities', color: 'text-amber-600' },
  EQUITY: { ar: 'حقوق ملكية', en: 'Equity', color: 'text-violet-600' },
  REVENUE: { ar: 'إيرادات', en: 'Revenue', color: 'text-emerald-600' },
  EXPENSE: { ar: 'مصروفات', en: 'Expenses', color: 'text-rose-600' },
};

export default function TrialBalance() {
  const { lang } = useStore();
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [ledgerFor, setLedgerFor] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [je, acc] = await Promise.all([
        base44.entities.JournalEntry.list('-date', 1000),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setEntries(je); setAccounts(acc);
    } catch { /* admin only */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const tb = useMemo(() => buildTrialBalance(entries, accounts, { from, to }), [entries, accounts, from, to]);
  const ledger = useMemo(() => ledgerFor ? buildAccountLedger(entries, ledgerFor.accountCode, { from, to }) : null, [ledgerFor, entries, from, to]);

  const tbColumns = [
    { header: { ar: 'الكود', en: 'Code' }, value: (r) => r.accountCode },
    { header: { ar: 'الحساب', en: 'Account' }, value: (r) => r.accountName },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => { const m = TYPE_META[r.accountType]; return m ? (lang === 'ar' ? m.ar : m.en) : '—'; } },
    { header: { ar: 'حركة مدين', en: 'Debit' }, value: (r) => formatCurrency(r.totalDebit, lang) },
    { header: { ar: 'حركة دائن', en: 'Credit' }, value: (r) => formatCurrency(r.totalCredit, lang) },
    { header: { ar: 'رصيد مدين', en: 'Dr Balance' }, value: (r) => r.debitBalance ? formatCurrency(r.debitBalance, lang) : '—' },
    { header: { ar: 'رصيد دائن', en: 'Cr Balance' }, value: (r) => r.creditBalance ? formatCurrency(r.creditBalance, lang) : '—' },
  ];
  const periodSub = (from || to) ? `${from || '—'} → ${to || '—'}` : '';

  return (
    <ModuleLayout
      title={t('ميزان المراجعة', 'Trial Balance', lang)}
      subtitle={t('أرصدة الحسابات من القيود المُرحّلة', 'Account balances from posted entries', lang)}
      actions={
        <div className="flex items-center gap-2">
          <TableToolbar columns={tbColumns} rows={tb.rows} title={{ ar: 'ميزان المراجعة', en: 'Trial Balance' }} subheading={periodSub} />
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      <div className={`flex items-center gap-3 p-3 rounded-xl border text-sm ${tb.balanced ? 'bg-emerald-50 border-emerald-200' : 'bg-rose-50 border-rose-200'}`}>
        {tb.balanced ? <CheckCircle className="size-4 text-emerald-600 shrink-0" /> : <XCircle className="size-4 text-rose-600 shrink-0" />}
        <span className={tb.balanced ? 'text-emerald-700' : 'text-rose-700'}>
          {t('إجمالي المدين', 'Total Debit', lang)}: {formatCurrency(tb.totals.debit, lang)} | {t('إجمالي الدائن', 'Total Credit', lang)}: {formatCurrency(tb.totals.credit, lang)}
          {tb.balanced ? ` — ${t('✓ متوازن', '✓ Balanced', lang)}` : ` — ${t('⚠ غير متوازن', '⚠ Unbalanced', lang)}`}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" /></div>
        {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}>{t('مسح الفترة', 'Clear', lang)}</Button>}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الكود', 'Code', lang)}</TableHead>
                <TableHead>{t('الحساب', 'Account', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead className="text-end">{t('حركة مدين', 'Debit', lang)}</TableHead>
                <TableHead className="text-end">{t('حركة دائن', 'Credit', lang)}</TableHead>
                <TableHead className="text-end">{t('رصيد مدين', 'Dr Balance', lang)}</TableHead>
                <TableHead className="text-end">{t('رصيد دائن', 'Cr Balance', lang)}</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 5 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : tb.rows.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد قيود مُرحّلة', 'No posted entries', lang)}</TableCell></TableRow>
                : tb.rows.map(r => {
                  const meta = TYPE_META[r.accountType];
                  return (
                    <TableRow key={r.accountCode} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{r.accountCode}</TableCell>
                      <TableCell className="font-medium">{r.accountName}</TableCell>
                      <TableCell className={`text-xs ${meta?.color || 'text-muted-foreground'}`}>{meta ? (lang === 'ar' ? meta.ar : meta.en) : '—'}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(r.totalDebit, lang)}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(r.totalCredit, lang)}</TableCell>
                      <TableCell className="text-end text-sm font-medium text-blue-700">{r.debitBalance ? formatCurrency(r.debitBalance, lang) : '—'}</TableCell>
                      <TableCell className="text-end text-sm font-medium text-amber-700">{r.creditBalance ? formatCurrency(r.creditBalance, lang) : '—'}</TableCell>
                      <TableCell><Button variant="ghost" size="icon" className="size-8" onClick={() => setLedgerFor(r)}><BookOpen className="size-3.5" /></Button></TableCell>
                    </TableRow>
                  );
                })}
              {!loading && tb.rows.length > 0 && (
                <TableRow className="bg-muted/40 font-bold">
                  <TableCell colSpan={3}>{t('الإجمالي', 'Total', lang)}</TableCell>
                  <TableCell className="text-end">{formatCurrency(tb.totals.debit, lang)}</TableCell>
                  <TableCell className="text-end">{formatCurrency(tb.totals.credit, lang)}</TableCell>
                  <TableCell className="text-end text-blue-700">{formatCurrency(tb.totals.debitBal, lang)}</TableCell>
                  <TableCell className="text-end text-amber-700">{formatCurrency(tb.totals.creditBal, lang)}</TableCell>
                  <TableCell></TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* General ledger drill-down */}
      <Dialog open={!!ledgerFor} onOpenChange={o => !o && setLedgerFor(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BookOpen className="size-4 text-teal-600" />
              {t('دفتر أستاذ', 'Ledger', lang)}: {ledgerFor?.accountName} <span className="font-mono text-xs text-muted-foreground">({ledgerFor?.accountCode})</span>
            </DialogTitle>
          </DialogHeader>
          {ledger && (
            <>
              <div className="grid grid-cols-3 gap-3 text-center text-sm">
                <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">{t('إجمالي مدين', 'Total Debit', lang)}</div><div className="font-bold text-blue-700">{formatCurrency(ledger.totalDebit, lang)}</div></div>
                <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">{t('إجمالي دائن', 'Total Credit', lang)}</div><div className="font-bold text-amber-700">{formatCurrency(ledger.totalCredit, lang)}</div></div>
                <div className="rounded-lg border p-2"><div className="text-xs text-muted-foreground">{t('الرصيد الختامي', 'Closing', lang)}</div><div className="font-bold">{formatCurrency(ledger.closingBalance, lang)}</div></div>
              </div>
              <div className="border rounded-lg overflow-hidden mt-2">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/50">
                      <TableHead className="text-xs">{t('التاريخ', 'Date', lang)}</TableHead>
                      <TableHead className="text-xs">{t('القيد', 'Entry', lang)}</TableHead>
                      <TableHead className="text-xs">{t('البيان', 'Description', lang)}</TableHead>
                      <TableHead className="text-xs text-end">{t('مدين', 'Debit', lang)}</TableHead>
                      <TableHead className="text-xs text-end">{t('دائن', 'Credit', lang)}</TableHead>
                      <TableHead className="text-xs text-end">{t('الرصيد', 'Balance', lang)}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ledger.movements.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-6 text-muted-foreground">{t('لا حركات', 'No movements', lang)}</TableCell></TableRow>
                      : ledger.movements.map((m, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-xs font-mono whitespace-nowrap" dir="ltr">{formatDate(m.date, lang)}</TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">{m.entryNo}</TableCell>
                          <TableCell className="text-xs min-w-56">{m.description || m.entryDescription}</TableCell>
                          <TableCell className="text-end text-xs tabular-nums whitespace-nowrap">{m.debit ? formatCurrency(m.debit, lang) : '—'}</TableCell>
                          <TableCell className="text-end text-xs tabular-nums whitespace-nowrap">{m.credit ? formatCurrency(m.credit, lang) : '—'}</TableCell>
                          <TableCell className="text-end text-xs font-medium tabular-nums whitespace-nowrap">{formatCurrency(m.balance, lang)}</TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}