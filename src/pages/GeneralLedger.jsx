import React, { useState, useEffect, useMemo } from 'react';
import { RefreshCw, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { buildAccountLedger } from '@/lib/ledgerEngine';

// الأستاذ العام: اختر حساباً لعرض كل حركاته المُرحّلة برصيد جارٍ عبر الفترة.
export default function GeneralLedger() {
  const { lang } = useStore();
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [accountCode, setAccountCode] = useState('');

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

  const activeAccounts = useMemo(
    () => accounts.filter(a => a.isPostable !== false).sort((a, b) => String(a.code).localeCompare(String(b.code))),
    [accounts]
  );

  const selected = accounts.find(a => a.code === accountCode);
  const ledger = useMemo(
    () => (accountCode ? buildAccountLedger(entries, accountCode, { from, to }) : null),
    [accountCode, entries, from, to]
  );

  const exportColumns = [
    { header: { ar: 'التاريخ', en: 'Date' }, value: (m) => formatDate(m.date, lang) },
    { header: { ar: 'رقم القيد', en: 'Entry' }, value: (m) => m.entryNo },
    { header: { ar: 'البيان', en: 'Description' }, value: (m) => m.description || m.entryDescription || '' },
    { header: { ar: 'مدين', en: 'Debit' }, value: (m) => m.debit ? formatCurrency(m.debit, lang) : '—' },
    { header: { ar: 'دائن', en: 'Credit' }, value: (m) => m.credit ? formatCurrency(m.credit, lang) : '—' },
    { header: { ar: 'الرصيد', en: 'Balance' }, value: (m) => formatCurrency(m.balance || 0, lang) },
  ];

  return (
    <ModuleLayout
      title={t('الأستاذ العام', 'General Ledger', lang)}
      subtitle={t('حركات حساب مفصّلة برصيد جارٍ من القيود المُرحّلة', 'Detailed account movements with running balance', lang)}
      actions={
        <div className="flex items-center gap-2">
          {ledger && selected && (
            <TableToolbar
              columns={exportColumns}
              rows={ledger.movements}
              title={{ ar: `الأستاذ العام — ${selected.name}`, en: `General Ledger — ${selected.nameEn || selected.name}` }}
              subheading={{ ar: `الحساب ${selected.code} · ${t('رصيد افتتاحي', 'Opening Balance', lang)} ${formatCurrency(ledger.openingBalance || 0, lang)}`, en: `Account ${selected.code} · Opening Balance ${formatCurrency(ledger.openingBalance || 0, lang)}` }}
            />
          )}
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1 min-w-64">
          <Label className="text-xs">{t('الحساب', 'Account', lang)}</Label>
          <Select value={accountCode} onValueChange={setAccountCode}>
            <SelectTrigger><SelectValue placeholder={t('اختر حساباً', 'Select account', lang)} /></SelectTrigger>
            <SelectContent className="max-h-80">
              {activeAccounts.length === 0 ? (
                <div className="px-3 py-6 text-center text-sm text-muted-foreground">{t('لا توجد حسابات قابلة للترحيل', 'No postable accounts', lang)}</div>
              ) : activeAccounts.map(a => (
                <SelectItem key={a.code} value={a.code}>
                  <span className="font-mono text-xs text-muted-foreground me-2">{a.code}</span>
                  {lang === 'ar' ? a.name : (a.nameEn || a.name)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1"><Label className="text-xs">{t('من تاريخ', 'From', lang)}</Label><Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="w-40" /></div>
        <div className="space-y-1"><Label className="text-xs">{t('إلى تاريخ', 'To', lang)}</Label><Input type="date" value={to} onChange={e => setTo(e.target.value)} className="w-40" /></div>
        {(from || to) && <Button variant="ghost" size="sm" onClick={() => { setFrom(''); setTo(''); }}>{t('مسح الفترة', 'Clear', lang)}</Button>}
      </div>

      {!accountCode ? (
        <Card className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
          <BookOpen className="size-8 text-teal-500/60" />
          {loading ? t('جارٍ التحميل...', 'Loading...', lang) : t('اختر حساباً لعرض حركاته', 'Select an account to view its ledger', lang)}
        </Card>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-center text-sm">
            <div className="rounded-lg border p-3 bg-slate-50/70"><div className="text-xs text-muted-foreground">{t('رصيد افتتاحي', 'Opening Balance', lang)}</div><div className="font-bold text-slate-700">{formatCurrency(ledger?.openingBalance || 0, lang)}</div></div>
            <div className="rounded-lg border p-3 bg-blue-50/50"><div className="text-xs text-muted-foreground">{t('إجمالي مدين', 'Total Debit', lang)}</div><div className="font-bold text-blue-700">{formatCurrency(ledger?.totalDebit, lang)}</div></div>
            <div className="rounded-lg border p-3 bg-amber-50/50"><div className="text-xs text-muted-foreground">{t('إجمالي دائن', 'Total Credit', lang)}</div><div className="font-bold text-amber-700">{formatCurrency(ledger?.totalCredit, lang)}</div></div>
            <div className="rounded-lg border p-3 bg-teal-50/50"><div className="text-xs text-muted-foreground">{t('الرصيد الختامي', 'Closing Balance', lang)}</div><div className="font-bold text-teal-700">{formatCurrency(ledger?.closingBalance, lang)}</div></div>
          </div>

          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                    <TableHead>{t('رقم القيد', 'Entry', lang)}</TableHead>
                    <TableHead>{t('البيان', 'Description', lang)}</TableHead>
                    <TableHead className="text-end">{t('مدين', 'Debit', lang)}</TableHead>
                    <TableHead className="text-end">{t('دائن', 'Credit', lang)}</TableHead>
                    <TableHead className="text-end">{t('الرصيد', 'Balance', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!ledger || ledger.movements.length === 0 ? (
                    <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد حركات في هذه الفترة', 'No movements in this period', lang)}</TableCell></TableRow>
                  ) : ledger.movements.map((m, i) => (
                    <TableRow key={i} className="hover:bg-muted/30">
                      <TableCell className="text-xs font-mono whitespace-nowrap" dir="ltr">{formatDate(m.date, lang)}</TableCell>
                      <TableCell className="font-mono text-xs whitespace-nowrap">{m.entryNo}</TableCell>
                      <TableCell className="text-sm min-w-64">{m.description || m.entryDescription}</TableCell>
                      <TableCell className="text-end text-sm tabular-nums whitespace-nowrap">{m.debit ? formatCurrency(m.debit, lang) : '—'}</TableCell>
                      <TableCell className="text-end text-sm tabular-nums whitespace-nowrap">{m.credit ? formatCurrency(m.credit, lang) : '—'}</TableCell>
                      <TableCell className="text-end text-sm font-semibold tabular-nums whitespace-nowrap">{formatCurrency(m.balance, lang)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        </>
      )}
    </ModuleLayout>
  );
}