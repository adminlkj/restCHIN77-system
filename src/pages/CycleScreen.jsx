import React, { useState, useMemo, useEffect } from 'react';
import { useStore } from '@/lib/store';
import { useAuth } from '@/lib/AuthContext';
import { canAccess } from '@/lib/permissions';
import { CYCLE_BY_KEY, READY_TABS } from '@/lib/cycles';

// Tab content screens
import Projects from '@/pages/Projects';
import SalesInvoices from '@/pages/SalesInvoices';
import ClientPayments from '@/pages/ClientPayments';
import Equipment from '@/pages/Equipment';
import PurchaseRequests from '@/pages/PurchaseRequests';
import PurchaseOrders from '@/pages/PurchaseOrders';
import GoodsReceipts from '@/pages/GoodsReceipts';
import Expenses from '@/pages/Expenses';
import SupplierInvoices from '@/pages/SupplierInvoices';
import SupplierPayments from '@/pages/SupplierPayments';
import Employees from '@/pages/Employees';
import PayrollRuns from '@/pages/PayrollRuns';
import PayrollSheets from '@/pages/PayrollSheets';
import Attendance from '@/pages/Attendance';
import Advances from '@/pages/Advances';
import ChartAccounts from '@/pages/ChartAccounts';
import JournalEntries from '@/pages/JournalEntries';
import TrialBalance from '@/pages/TrialBalance';
import GeneralLedger from '@/pages/GeneralLedger';
import CostCenters from '@/pages/CostCenters';
import FiscalYears from '@/pages/FiscalYears';
import FixedAssets from '@/pages/FixedAssets';
import Inventory from '@/pages/Inventory';
import Warehouses from '@/pages/Warehouses';
import StockMovements from '@/pages/StockMovements';
import Reports from '@/pages/Reports';
import VATReport from '@/pages/VATReport';
import BranchReport from '@/pages/BranchReport';
import InventoryReports from '@/pages/InventoryReports';
import PartnerFollowUp from '@/pages/PartnerFollowUp';
import EmployeeReports from '@/pages/EmployeeReports';
import EquipmentMaintenance from '@/pages/EquipmentMaintenance';
import AuditSuite from '@/pages/AuditSuite';
import Clients from '@/pages/Clients';
import Suppliers from '@/pages/Suppliers';
import DeliveryPlatforms from '@/pages/DeliveryPlatforms';
import MenuManagement from '@/pages/MenuManagement';
import Users from '@/pages/Users';
import Settings from '@/pages/Settings';

const TAB_CONTENT = {
  projects: <Projects />,
  sales: <SalesInvoices />,
  'client-payments': <ClientPayments />,
  equipment: <Equipment />,
  'equipment-maintenance': <EquipmentMaintenance />,
  'purchase-requests': <PurchaseRequests />,
  'purchase-orders': <PurchaseOrders />,
  'goods-receipts': <GoodsReceipts />,
  expenses: <Expenses />,
  'supplier-invoices': <SupplierInvoices />,
  'supplier-payments': <SupplierPayments />,
  employees: <Employees />,
  'payroll-runs': <PayrollRuns />,
  'payroll-sheets': <PayrollSheets />,
  attendance: <Attendance />,
  advances: <Advances />,
  'chart-accounts': <ChartAccounts />,
  accounting: <JournalEntries />,
  'general-ledger': <GeneralLedger />,
  'trial-balance': <TrialBalance />,
  'cost-centers': <CostCenters />,
  vat: <VATReport />,
  reports: <Reports />,
  'fiscal-years': <FiscalYears />,
  'fixed-assets': <FixedAssets />,
  audit: <AuditSuite />,
  // Reports cycle
  'report-income': <Reports initialReport="income" hideSelector />,
  'report-balance': <Reports initialReport="balance" hideSelector />,
  'report-cashflow': <Reports initialReport="cashflow" hideSelector />,
  'report-ledger': <GeneralLedger />,
  'report-trial': <TrialBalance />,
  'report-vat': <VATReport />,
  'report-projects': <BranchReport />,
  'report-inventory': <InventoryReports />,
  'report-partners': <PartnerFollowUp />,
  'report-employees': <EmployeeReports />,
  clients: <Clients />,
  suppliers: <Suppliers />,
  platforms: <DeliveryPlatforms />,
  inventory: <Inventory />,
  warehouses: <Warehouses />,
  'stock-movements': <StockMovements />,
  menu: <MenuManagement />,
  users: <Users />,
  settings: <Settings />,
};

export default function CycleScreen({ cycleKey }) {
  const { lang, activeItem } = useStore();
  const { user: currentUser } = useAuth();
  const userLoaded = !!currentUser;
  const cycle = CYCLE_BY_KEY[cycleKey];

  // Only tabs the user is allowed to see
  const visibleTabs = useMemo(() => {
    if (!cycle) return [];
    return cycle.tabs.filter(tb => !userLoaded || canAccess(currentUser, tb.key));
  }, [cycle, currentUser, userLoaded]);

  // Initialize activeTab from the store's activeItem when it matches one of the
  // cycle's tab keys (so deep-links / cross-screen setActiveItem(<tabKey>) land
  // on the requested tab, not the first tab of the cycle). Falls back to the
  // first visible tab otherwise.
  const tabKeys = useMemo(() => visibleTabs.map(t => t.key), [visibleTabs]);
  const initialTab = tabKeys.includes(activeItem) ? activeItem : visibleTabs[0]?.key;
  const [activeTab, setActiveTab] = useState(initialTab);

  // Keep active tab valid when the visible set changes (e.g. cycle switch)
  useEffect(() => {
    if (!visibleTabs.length) return;
    if (!visibleTabs.some(t => t.key === activeTab)) {
      setActiveTab(visibleTabs[0].key);
    }
  }, [visibleTabs, activeTab]);

  if (!cycle) return null;

  const color = cycle.color;
  const content = TAB_CONTENT[activeTab] || <div className="p-8 text-center text-muted-foreground">{lang === 'ar' ? 'تعذر تحميل الشاشة المطلوبة.' : 'Could not load the requested screen.'}</div>;

  return (
    <div className="flex flex-col h-full">
      {/* Cycle header + top tabs */}
      <div className="border-b border-border bg-white sticky top-0 z-10">
        <div className="flex items-center gap-2.5 px-4 md:px-6 pt-4">
          <div className={`size-9 rounded-lg ${color.light} flex items-center justify-center`}>
            <cycle.Icon className={`size-5 ${color.text}`} />
          </div>
          <h1 className="text-lg font-bold text-foreground">{lang === 'ar' ? cycle.label.ar : cycle.label.en}</h1>
        </div>
        <div className="px-2 md:px-4 mt-2 overflow-x-auto">
          <div className="flex gap-1 min-w-max">
            {visibleTabs.map(tab => {
              const isActive = tab.key === activeTab;
              const isReady = READY_TABS.has(tab.key);
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                    ${isActive
                      ? `${color.border} ${color.text}`
                      : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                    }`}
                >
                  {tab.Icon && <tab.Icon className="size-4" />}
                  {lang === 'ar' ? tab.ar : tab.en}
                  {!isReady && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-amber-100 text-amber-600 font-semibold">
                      {lang === 'ar' ? 'قريباً' : 'Soon'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Active tab content */}
      <div className="flex-1 min-h-0">
        {content}
      </div>
    </div>
  );
}