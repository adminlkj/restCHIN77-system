import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, FileText } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency as fmt } from '@/lib/utils-binaa';
import { buildPartyBalances, buildPartyStatement } from '@/lib/partyStatement';
import PartyStatementReport from '@/components/partners/PartyStatementReport';

/**
 * قسم الكشوفات ومتابعة الدفعات — مصدره الوحيد قيود اليومية المُرحّلة فقط.
 * يُستخدم لكل من العملاء والموردين عبر خاصية type دون خلط بين البيانات.
 *
 * partyType: 'CLIENT' | 'SUPPLIER'
 * parties:   قائمة العملاء أو الموردين (تُمرّر من الشاشة الأم)
 */
export default function PartyStatementSection({ partyType, parties = [] }) {
  const { lang } = useStore();
  const isSupplier = partyType === 'SUPPLIER';

  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [selectedId, setSelectedId] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [je, acc] = await Promise.all([
        base44.entities.JournalEntry.filter({ isPosted: true }, '-date', 5000),
        base44.entities.ChartAccount.list('code', 1000),
      ]);
      setEntries(je || []);
      setAccounts(acc || []);
    } catch { /* الأرصدة تظهر صفراً إن تعذّر التحميل */ }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  // أرصدة كل الأطراف — مبنية من القيود المرحّلة فقط.
  const { rows, totals } = useMemo(
    () => buildPartyBalances(entries, accounts, parties, partyType, { from, to }),
    [entries, accounts, parties, partyType, from, to]
  );

  const filtered = rows.filter(r =>
    !search || r.name?.toLowerCase().includes(search.toLowerCase()) || r.code?.toLowerCase().includes(search.toLowerCase())
  );

  const selectedParty = parties.find(p => p.id === selectedId);
  const statement = useMemo(() => {
    if (!selectedParty) return null;
    return buildPartyStatement(entries, accounts, { id: selectedParty.id, name: selectedParty.name, type: partyType }, { from, to });
  }, [selectedParty, entries, accounts, partyType, from, to]);

  const outstandingLabel = isSupplier
    ? t('مستحق للمورد', 'Owed to Supplier', lang)
    : t('مستحق على العميل', 'Owed by Client', lang);

  return (
    <div className="space-y-4">
      {/* شريط الملخّص */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{isSupplier ? t('إجمالي الفواتير والأوامر', 'Total Invoices & Orders', lang) : t('إجمالي المستحقات', 'Total Billed', lang)}</p>
          <p className="text-xl font-bold mt-1">{fmt(isSupplier ? totals.credit : totals.debit)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-muted-foreground">{isSupplier ? t('إجمالي المسدّد', 'Total Paid', lang) : t('إجمالي المُحصّل', 'Total Collected', lang)}</p>
          <p className="text-xl font-bold mt-1">{fmt(isSupplier ? totals.debit : totals.credit)}</p>
        </Card>
        <Card className={`p-4 ${isSupplier ? 'bg-amber-50' : 'bg-emerald-50'}`}>
          <p className="text-xs text-muted-foreground">{t('صافي المتبقّي', 'Net Outstanding', lang)}</p>
          <p className={`text-xl font-bold mt-1 ${isSupplier ? 'text-amber-700' : 'text-emerald-700'}`}>{fmt(totals.outstanding)}</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto_auto_auto] gap-3 items-end">
        <div className="relative">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالاسم أو الكود...', 'Search by name or code...', lang)} className="ps-9" />
        </div>
        <Input type="date" value={from} onChange={e => setFrom(e.target.value)} className="md:w-40" />
        <Input type="date" value={to} onChange={e => setTo(e.target.value)} className="md:w-40" />
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      {/* جدول متابعة الأرصدة */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الكود', 'Code', lang)}</TableHead>
                <TableHead>{t('الاسم', 'Name', lang)}</TableHead>
                <TableHead className="text-center">{t('مدين', 'Debit', lang)}</TableHead>
                <TableHead className="text-center">{t('دائن', 'Credit', lang)}</TableHead>
                <TableHead className="text-center">{outstandingLabel}</TableHead>
                <TableHead className="text-center">{t('الكشف', 'Statement', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 3 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 6 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={6} className="text-center py-10 text-muted-foreground">{t('لا توجد حركات مرحّلة', 'No posted movements', lang)}</TableCell></TableRow>
                : filtered.map(r => (
                  <TableRow key={r.id} className={`hover:bg-muted/30 ${selectedId === r.id ? (isSupplier ? 'bg-amber-50' : 'bg-emerald-50') : ''}`}>
                    <TableCell className="font-mono text-xs font-medium">{r.code || '—'}</TableCell>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-center text-sm">{fmt(r.totalDebit)}</TableCell>
                    <TableCell className="text-center text-sm">{fmt(r.totalCredit)}</TableCell>
                    <TableCell className={`text-center text-sm font-semibold ${r.outstanding > 0 ? (isSupplier ? 'text-amber-700' : 'text-emerald-700') : 'text-muted-foreground'}`}>{fmt(r.outstanding)}</TableCell>
                    <TableCell className="text-center">
                      <Button variant="ghost" size="sm" className="gap-1" onClick={() => setSelectedId(selectedId === r.id ? null : r.id)}>
                        <FileText className="size-3.5" />{selectedId === r.id ? t('إخفاء', 'Hide', lang) : t('عرض', 'View', lang)}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* تقرير كشف الحساب الاحترافي للطرف المختار */}
      {selectedParty && statement && (
        <PartyStatementReport
          party={selectedParty}
          statement={statement}
          partyType={partyType}
          onClose={() => setSelectedId(null)}
        />
      )}
    </div>
  );
}