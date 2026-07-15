import React, { useState, useEffect } from 'react';
import { LayoutGrid, FileText, ReceiptText, ShoppingCart, DollarSign, Building2, ListChecks, ClipboardCheck, GitPullRequestArrow, FolderOpen, BookOpen, ShieldCheck, AlertTriangle, Hammer, CalendarDays, PieChart } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, INVOICE_STATUS } from '@/lib/utils-binaa';
import { PROJECT_STATUS } from '@/lib/utils-binaa';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import ProjectBasicInfo from '@/components/workspace/tabs/ProjectBasicInfo';
import ProjectContractsTab from '@/components/workspace/tabs/ProjectContractsTab';
import RelatedList from '@/components/workspace/RelatedList';
import BoqTab from '@/components/workspace/tabs/BoqTab';
import ProgressBillingTab from '@/components/workspace/tabs/ProgressBillingTab';
import ChangeOrdersTab from '@/components/workspace/tabs/ChangeOrdersTab';
import DocumentsTab from '@/components/workspace/tabs/DocumentsTab';
import StatementTab from '@/components/workspace/tabs/StatementTab';
import GuaranteesTab from '@/components/workspace/tabs/GuaranteesTab';
import PenaltiesTab from '@/components/workspace/tabs/PenaltiesTab';
import WorkOrdersTab from '@/components/workspace/tabs/WorkOrdersTab';
import DailyReportsTab from '@/components/workspace/tabs/DailyReportsTab';
import ProfitabilityTab from '@/components/workspace/tabs/ProfitabilityTab';
import { computeProjectProfitabilityFromJE } from '@/lib/financialEngine';

export default function ProjectWorkspace() {
  const { lang, activeProjectId, activeProjectName, setActiveItem } = useStore();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [project, setProject] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [invoices, setInvoices] = useState([]);
  const [purchases, setPurchases] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [clientPayments, setClientPayments] = useState([]);
  const [stockMovements, setStockMovements] = useState([]);
  const [supplierInvoices, setSupplierInvoices] = useState([]);
  const [subcontractorInvoices, setSubcontractorInvoices] = useState([]);
  const [journalEntries, setJournalEntries] = useState([]);
  const [chartAccounts, setChartAccounts] = useState([]);

  useEffect(() => {
    if (!activeProjectId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [p, c, inv, po, exp, cp, sm, si, subInv, je, acc] = await Promise.all([
          base44.entities.Project.filter({ id: activeProjectId }),
          base44.entities.Contract.filter({ projectId: activeProjectId }),
          base44.entities.SalesInvoice.filter({ projectId: activeProjectId }),
          base44.entities.PurchaseOrder.filter({ projectId: activeProjectId }),
          base44.entities.Expense.filter({ projectId: activeProjectId }),
          base44.entities.ClientPayment.filter({ projectId: activeProjectId }),
          base44.entities.StockMovement.filter({ projectId: activeProjectId }),
          base44.entities.SupplierInvoice.filter({ projectId: activeProjectId }),
          base44.entities.SubcontractorInvoice.filter({ projectId: activeProjectId }),
          base44.entities.JournalEntry.list('-date', 2000),
          base44.entities.ChartAccount.list('code', 1000),
        ]);
        setProject(p[0] || null);
        setContracts(c); setInvoices(inv); setPurchases(po); setExpenses(exp);
        setClientPayments(cp); setStockMovements(sm); setSupplierInvoices(si); setSubcontractorInvoices(subInv);
        setJournalEntries(je || []); setChartAccounts(acc || []);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeProjectId]);

  if (!activeProjectId) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Building2 className="size-14 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold">{t('لم يتم اختيار طلب', 'No order selected', lang)}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('افتح مركز الطلبات واختر طلباً لعرض مركز عمله المتكامل.', 'Open the Orders module and pick an order to view its integrated workspace.', lang)}
          </p>
          <button onClick={() => setActiveItem('projects')} className="mt-4 px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:bg-emerald-700">
            {t('الذهاب للطلبات', 'Go to Orders', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (loading || !project) {
    return (
      <div className="p-4 md:p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const postedInvoiceStatuses = ['APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
  const postedInvoices = invoices.filter(i => postedInvoiceStatuses.includes(i.status));

  // ════ المصدر الوحيد للحقيقة المالية: قيود اليومية المرحّلة ════
  // حساب الإيرادات والتكاليف من القيود المرحّلة المرتبطة بالمشروع فقط.
  // لا نقرأ من الفواتير/المصروفات/السندات مباشرةً — كلها تمر عبر القيود.
  const jeProfitability = computeProjectProfitabilityFromJE(
    journalEntries,
    chartAccounts,
    project?.name || '',
    activeProjectId || ''
  );
  const revenue = jeProfitability.revenue;
  const costs = jeProfitability.cost;

  const st = PROJECT_STATUS[project.status] || PROJECT_STATUS.PLANNING;
  const badge = <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>;

  // Tabs follow the project lifecycle workflow, not disjoint sections:
  // Overview → Contract → BOQ → Execution → Costs → Revenue → Profitability → Statement → Documents
  const tabs = [
    { key: 'overview', ar: 'نظرة عامة', en: 'Overview', Icon: LayoutGrid },
    { key: 'contracts', ar: 'العقود', en: 'Contracts', Icon: FileText },
    { key: 'change-orders', ar: 'الملاحق وأوامر التغيير', en: 'Change Orders', Icon: GitPullRequestArrow },
    { key: 'guarantees', ar: 'الضمانات', en: 'Guarantees', Icon: ShieldCheck },
    { key: 'penalties', ar: 'الغرامات', en: 'Penalties', Icon: AlertTriangle },
    { key: 'boq', ar: 'قائمة المكوّنات', en: 'Ingredients List', Icon: ListChecks },
    { key: 'work-orders', ar: 'أوامر العمل', en: 'Work Orders', Icon: Hammer },
    { key: 'daily-reports', ar: 'الأعمال اليومية', en: 'Daily Reports', Icon: CalendarDays },
    { key: 'billing', ar: 'المستخلصات', en: 'Progress Billing', Icon: ClipboardCheck },
    { key: 'sales', ar: 'المبيعات', en: 'Sales', Icon: ReceiptText },
    { key: 'purchases', ar: 'المشتريات', en: 'Purchases', Icon: ShoppingCart },
    { key: 'expenses', ar: 'المصروفات', en: 'Expenses', Icon: DollarSign },
    { key: 'profitability', ar: 'الربحية', en: 'Profitability', Icon: PieChart },
    { key: 'statement', ar: 'كشف الحساب', en: 'Statement', Icon: BookOpen },
    { key: 'documents', ar: 'المستندات', en: 'Documents', Icon: FolderOpen },
  ];

  return (
    <div className="p-4 md:p-6">
      <WorkspaceHeader
        title={project.name}
        subtitle={t('مركز عمل الطلب', 'Order Workspace', lang)}
        badge={badge}
        onBack={() => setActiveItem('projects')}
      />
      <WorkspaceTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <ProjectBasicInfo project={project} revenue={revenue} costs={costs} onUpdated={(p) => setProject(p)} />}

      {tab === 'contracts' && <ProjectContractsTab project={project} />}

      {tab === 'sales' && (
        <RelatedList
          emptyText={t('لا توجد إيصالات لهذا الطلب', 'No receipts for this order', lang)}
          columns={[
            { header: { ar: 'رقم الإيصال', en: 'Receipt No' }, cell: r => <span className="font-mono text-xs">{r.invoiceNo}</span> },
            { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
            { header: { ar: 'الإجمالي', en: 'Total' }, cell: r => formatCurrency(r.totalAmount, lang) },
            { header: { ar: 'المدفوع', en: 'Paid' }, cell: r => formatCurrency(r.paidAmount, lang) },
            { header: { ar: 'الحالة', en: 'Status' }, cell: r => {
              const s = INVOICE_STATUS?.[r.status];
              return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${s?.color || 'bg-muted'}`}>{s ? (lang === 'ar' ? s.ar : s.en) : r.status}</span>;
            } },
          ]}
          rows={invoices}
        />
      )}

      {tab === 'purchases' && (
        <RelatedList
          emptyText={t('لا توجد أوامر شراء لهذا الطلب', 'No purchase orders for this order', lang)}
          columns={[
            { header: { ar: 'رقم الأمر', en: 'Order No' }, cell: r => <span className="font-mono text-xs">{r.orderNo}</span> },
            { header: { ar: 'المورد', en: 'Supplier' }, cell: r => <span className="text-sm">{r.supplierName || '—'}</span> },
            { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
            { header: { ar: 'القيمة', en: 'Amount' }, cell: r => formatCurrency((r.totalAmount || 0) + (r.vatAmount || 0), lang) },
            { header: { ar: 'الحالة', en: 'Status' }, cell: r => <span className="text-xs">{r.status}</span> },
          ]}
          rows={purchases}
        />
      )}

      {tab === 'expenses' && (
        <RelatedList
          emptyText={t('لا توجد مصروفات لهذا الطلب', 'No expenses for this order', lang)}
          columns={[
            { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description}</span> },
            { header: { ar: 'البند', en: 'Category' }, cell: r => <span className="text-xs text-muted-foreground">{r.category}</span> },
            { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
            { header: { ar: 'المبلغ', en: 'Amount' }, cell: r => formatCurrency(r.totalAmount || r.amount, lang) },
          ]}
          rows={expenses}
        />
      )}

      {tab === 'change-orders' && <ChangeOrdersTab projectId={activeProjectId} />}
      {tab === 'guarantees' && <GuaranteesTab projectId={activeProjectId} />}
      {tab === 'penalties' && <PenaltiesTab projectId={activeProjectId} />}
      {tab === 'boq' && <BoqTab projectId={activeProjectId} />}
      {tab === 'work-orders' && <WorkOrdersTab projectId={activeProjectId} />}
      {tab === 'daily-reports' && <DailyReportsTab projectId={activeProjectId} />}
      {tab === 'billing' && <ProgressBillingTab projectId={activeProjectId} />}
      {tab === 'profitability' && <ProfitabilityTab revenue={revenue} costs={costs} contractValue={project.contractValue || 0} />}
      {tab === 'statement' && <StatementTab journalEntries={journalEntries} accounts={chartAccounts} projectName={project?.name} />}
      {tab === 'documents' && <DocumentsTab projectId={activeProjectId} />}
    </div>
  );
}