import React, { useState, useEffect, useMemo } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { clearAccountsCache } from '@/lib/postingEngine';
import { OperationEngine } from '@/lib/businessEngine';
import { buildStandardAccounts } from '@/lib/standardChart';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ChartAccountDialog from '@/components/accounting/ChartAccountDialog';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { useToast } from '@/components/ui/use-toast';
import { Plus, Search, Network, ListTree, Loader2, ChevronsDown, ChevronsUp } from 'lucide-react';
import ChartAccountSummary from '@/components/accounting/ChartAccountSummary';
import ChartAccountTree from '@/components/accounting/ChartAccountTree';

const TYPE_META = {
  ASSET: { ar: 'أصول', en: 'Assets', color: 'text-blue-600 bg-blue-50 border-blue-200', borderTop: 'border-t-blue-500' },
  LIABILITY: { ar: 'خصوم', en: 'Liabilities', color: 'text-amber-600 bg-amber-50 border-amber-200', borderTop: 'border-t-amber-500' },
  EQUITY: { ar: 'حقوق ملكية', en: 'Equity', color: 'text-violet-600 bg-violet-50 border-violet-200', borderTop: 'border-t-violet-500' },
  REVENUE: { ar: 'إيرادات', en: 'Revenue', color: 'text-emerald-600 bg-emerald-50 border-emerald-200', borderTop: 'border-t-emerald-500' },
  EXPENSE: { ar: 'مصروفات', en: 'Expenses', color: 'text-rose-600 bg-rose-50 border-rose-200', borderTop: 'border-t-rose-500' },
};

export default function ChartAccounts() {
  const { lang } = useStore();
  const { toast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [seeding, setSeeding] = useState(false);
  const [expanded, setExpanded] = useState(new Set());

  const load = async () => {
    setLoading(true);
    const list = await base44.entities.ChartAccount.list('code', 1000);
    const safeList = list || [];
    setAccounts(safeList);
    setExpanded(new Set(safeList.filter(a => !a.parentCode || Number(a.level || 1) <= 2).map(a => a.code)));
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const sortedAccounts = useMemo(() => [...accounts].sort((a, b) => String(a.code).localeCompare(String(b.code))), [accounts]);
  const roots = useMemo(() => sortedAccounts.filter(a => !a.parentCode), [sortedAccounts]);
  const childrenMap = useMemo(() => sortedAccounts.reduce((map, acc) => {
    if (acc.parentCode) map[acc.parentCode] = [...(map[acc.parentCode] || []), acc];
    return map;
  }, {}), [sortedAccounts]);

  const filtered = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return sortedAccounts.filter(a =>
      String(a.code || '').toLowerCase().includes(q) ||
      String(a.name || '').toLowerCase().includes(q) ||
      String(a.nameEn || '').toLowerCase().includes(q) ||
      String(a.semanticRole || '').toLowerCase().includes(q));
  }, [search, sortedAccounts]);

  const handleSave = async (data, openingBalance = 0) => {
    if (editing) {
      // منع قلب نوع/طبيعة حساب له حركات مرحّلة — يقلب إشارة رصيده في الميزان بأثر رجعي.
      if ((data.accountType && data.accountType !== editing.accountType) || (data.nature && data.nature !== editing.nature)) {
        const jes = await base44.entities.JournalEntry.list('-date', 5000);
        const used = jes.some(je => (je.lines || []).some(l => l.accountCode === editing.code));
        if (used) {
          toast({ title: t('لا يمكن تغيير نوع أو طبيعة حساب له قيود مرحّلة', 'Cannot change type or nature of an account with posted entries', lang), variant: 'destructive' });
          return;
        }
      }
      await base44.entities.ChartAccount.update(editing.id, data);
    } else {
      await OperationEngine.createChartAccount(data, openingBalance);
    }
    clearAccountsCache();
    toast({ title: t('تم الحفظ', 'Saved', lang) });
    await load();
  };

  const handleDelete = async () => {
    try {
      const jes = await base44.entities.JournalEntry.list('-date', 5000);
      const hasLines = jes.some(je => (je.lines || []).some(l => l.accountCode === deleting.code));
      if (hasLines) {
        toast({ title: t('لا يمكن حذف حساب مستخدم في قيود', 'Cannot delete an account used in journal entries', lang), variant: 'destructive' });
        setDeleting(null);
        return;
      }
      await base44.entities.ChartAccount.delete(deleting.id);
      clearAccountsCache();
      setDeleting(null);
      toast({ title: t('تم الحذف', 'Deleted', lang) });
      await load();
    } catch { toast({ title: t('فشل الحذف', 'Delete failed', lang), variant: 'destructive' }); setDeleting(null); }
  };

  const seedStandardChart = async () => {
    setSeeding(true);
    try {
      const existingCodes = new Set(accounts.map(a => a.code));
      const toCreate = buildStandardAccounts().filter(a => !existingCodes.has(a.code));
      if (toCreate.length === 0) {
        toast({ title: t('الشجرة القياسية موجودة بالفعل', 'Standard chart already present', lang) });
      } else {
        await base44.entities.ChartAccount.bulkCreate(toCreate);
        clearAccountsCache();
        toast({ title: t(`تمت إضافة ${toCreate.length} حساباً`, `Added ${toCreate.length} accounts`, lang) });
        await load();
      }
    } catch {
      toast({ title: t('فشل تهيئة الشجرة', 'Failed to seed chart', lang), variant: 'destructive' });
    }
    setSeeding(false);
  };

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (acc) => { setEditing(acc); setDialogOpen(true); };
  const toggleAccount = (code) => setExpanded(prev => {
    const next = new Set(prev);
    next.has(code) ? next.delete(code) : next.add(code);
    return next;
  });
  const expandAll = () => setExpanded(new Set(accounts.map(a => a.code)));
  const collapseAll = () => setExpanded(new Set(roots.map(a => a.code)));

  return (
    <ModuleLayout
      title={t('الدليل المحاسبي', 'Chart of Accounts', lang)}
      subtitle={t('شجرة حسابات واضحة تشرح هيكل النظام وتوضح الحسابات التجميعية والنهائية', 'A clear account tree that explains system structure and postable accounts', lang)}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={seedStandardChart} disabled={seeding} className="gap-1.5">
            {seeding ? <Loader2 className="size-4 animate-spin" /> : <ListTree className="size-4" />}
            {t('تهيئة الشجرة القياسية', 'Seed Standard Chart', lang)}
          </Button>
          <Button onClick={openNew} className="bg-teal-600 hover:bg-teal-700 gap-1.5">
            <Plus className="size-4" />{t('حساب جديد', 'New Account', lang)}
          </Button>
        </div>
      }
    >
      <ChartAccountSummary accounts={accounts} typeMeta={TYPE_META} lang={lang} />

      <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between rounded-xl border bg-white p-3">
        <div className="relative flex-1 max-w-xl">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالرقم أو الاسم أو الدور أو الحساب الدلالي', 'Search code, name, role or semantic account', lang)} className="ps-9 h-10" />
        </div>
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={expandAll} className="gap-1.5" disabled={accounts.length === 0}>
            <ChevronsDown className="size-4" />{t('توسيع الكل', 'Expand All', lang)}
          </Button>
          <Button type="button" variant="outline" onClick={collapseAll} className="gap-1.5" disabled={accounts.length === 0}>
            <ChevronsUp className="size-4" />{t('طي الكل', 'Collapse All', lang)}
          </Button>
        </div>
      </div>

      {loading ? (
        <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</CardContent></Card>
      ) : accounts.length === 0 ? (
        <Card><CardContent className="py-16 flex flex-col items-center text-center"><Network className="size-10 text-muted-foreground/40 mb-3" /><p className="text-sm text-muted-foreground">{t('لا توجد حسابات بعد', 'No accounts yet', lang)}</p></CardContent></Card>
      ) : (
        <ChartAccountTree
          roots={roots}
          childrenMap={childrenMap}
          searchResults={filtered}
          expanded={expanded}
          onToggle={toggleAccount}
          onEdit={openEdit}
          onDelete={setDeleting}
          typeMeta={TYPE_META}
          lang={lang}
        />
      )}

      <ChartAccountDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        account={editing}
        parents={accounts}
        allAccounts={accounts}
        onSave={handleSave}
        lang={lang}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('حذف الحساب', 'Delete Account', lang)}
        description={t('هل أنت متأكد من حذف هذا الحساب؟', 'Are you sure you want to delete this account?', lang)}
        onConfirm={handleDelete}
      />
    </ModuleLayout>
  );
}