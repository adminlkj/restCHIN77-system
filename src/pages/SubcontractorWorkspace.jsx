import React, { useState, useEffect } from 'react';
import { HardHat, FileText, GitPullRequestArrow, AlertTriangle, ReceiptText, Wallet, BookOpen, Phone, Mail, Building2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import SubContractsTab from '@/components/workspace/tabs/SubContractsTab';
import SubInvoicesTab from '@/components/workspace/tabs/SubInvoicesTab';
import SubChangeOrdersTab from '@/components/workspace/tabs/SubChangeOrdersTab';
import SubPenaltiesTab from '@/components/workspace/tabs/SubPenaltiesTab';
import SubPaymentsTab from '@/components/workspace/tabs/SubPaymentsTab';
import SubStatementTab from '@/components/workspace/tabs/SubStatementTab';
import { Card, CardContent } from '@/components/ui/card';

export default function SubcontractorWorkspace() {
  const { lang, activeSubcontractorId, setActiveItem } = useStore();
  const [tab, setTab] = useState('statement');
  const [loading, setLoading] = useState(true);
  const [sub, setSub] = useState(null);
  const [projects, setProjects] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [payments, setPayments] = useState([]);
  const [penalties, setPenalties] = useState([]);

  const loadAll = async () => {
    if (!activeSubcontractorId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [s, proj, c, inv, pay, pen] = await Promise.all([
        base44.entities.Subcontractor.filter({ id: activeSubcontractorId }),
        base44.entities.Project.list('-created_date', 300),
        base44.entities.SubcontractorContract.filter({ subcontractorId: activeSubcontractorId }),
        base44.entities.SubcontractorInvoice.filter({ subcontractorId: activeSubcontractorId }),
        base44.entities.SubcontractorPayment.filter({ subcontractorId: activeSubcontractorId }),
        base44.entities.SubcontractorPenalty.filter({ subcontractorId: activeSubcontractorId }),
      ]);
      setSub(s[0] || null); setProjects(proj); setContracts(c); setInvoices(inv); setPayments(pay); setPenalties(pen);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, [activeSubcontractorId]);

  if (!activeSubcontractorId) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <HardHat className="size-14 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold">{t('لم يتم اختيار مورّد خدمات', 'No service provider selected', lang)}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('افتح سجل مورّدي الخدمات واختر مورّد خدمات لعرض مركز عمله المتكامل.', 'Open the service providers registry and pick one to view its workspace.', lang)}
          </p>
          <button onClick={() => setActiveItem('subcontractors-cycle')} className="mt-4 px-4 py-2 rounded-lg bg-orange-600 text-white text-sm font-medium hover:bg-orange-700">
            {t('الذهاب لمورّدي الخدمات', 'Go to Service Providers', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (loading || !sub) {
    return (
      <div className="p-4 md:p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const tabs = [
    { key: 'statement', ar: 'كشف الحساب', en: 'Statement', Icon: BookOpen },
    { key: 'contracts', ar: 'العقود', en: 'Contracts', Icon: FileText },
    { key: 'change-orders', ar: 'أوامر التغيير', en: 'Change Orders', Icon: GitPullRequestArrow },
    { key: 'invoices', ar: 'المستخلصات والإيصالات', en: 'Receipts', Icon: ReceiptText },
    { key: 'penalties', ar: 'الغرامات', en: 'Penalties', Icon: AlertTriangle },
    { key: 'payments', ar: 'السداد', en: 'Payments', Icon: Wallet },
  ];

  return (
    <div className="p-4 md:p-6">
      <WorkspaceHeader
        title={sub.name}
        subtitle={t('مركز عمل مورّد الخدمات', 'Service Provider Workspace', lang)}
        onBack={() => setActiveItem('subcontractors-cycle')}
      />

      {/* بطاقة بيانات المقاول */}
      <Card className="mb-5">
        <CardContent className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded">{sub.code}</span>
          {sub.specialty && <span className="flex items-center gap-1.5 text-muted-foreground"><Building2 className="size-3.5" />{sub.specialty}</span>}
          {sub.phone && <span className="flex items-center gap-1.5 text-muted-foreground"><Phone className="size-3.5" />{sub.phone}</span>}
          {sub.email && <span className="flex items-center gap-1.5 text-muted-foreground"><Mail className="size-3.5" />{sub.email}</span>}
          {sub.taxNumber && <span className="text-muted-foreground">{t('الرقم الضريبي', 'VAT', lang)}: {sub.taxNumber}</span>}
        </CardContent>
      </Card>

      <WorkspaceTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'statement' && <SubStatementTab invoices={invoices} payments={payments} penalties={penalties} />}
      {tab === 'contracts' && <SubContractsTab subcontractorId={activeSubcontractorId} projects={projects} />}
      {tab === 'change-orders' && <SubChangeOrdersTab subcontractorId={activeSubcontractorId} contracts={contracts} />}
      {tab === 'invoices' && <SubInvoicesTab subcontractorId={activeSubcontractorId} subcontractorName={sub.name} contracts={contracts} />}
      {tab === 'penalties' && <SubPenaltiesTab subcontractorId={activeSubcontractorId} contracts={contracts} />}
      {tab === 'payments' && <SubPaymentsTab subcontractorId={activeSubcontractorId} invoices={invoices} onChanged={loadAll} />}
    </div>
  );
}