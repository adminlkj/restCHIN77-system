import React, { useState, useEffect } from 'react';
import { LayoutGrid, FileText, Wrench, Fuel, DollarSign, Truck, PackageCheck, Timer, ReceiptText, PieChart } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate, EQUIPMENT_STATUS } from '@/lib/utils-binaa';
import WorkspaceHeader from '@/components/workspace/WorkspaceHeader';
import WorkspaceTabs from '@/components/workspace/WorkspaceTabs';
import EquipmentOverview from '@/components/workspace/EquipmentOverview';
import RelatedList from '@/components/workspace/RelatedList';
import MaintenanceTab from '@/components/workspace/tabs/MaintenanceTab';
import FuelTab from '@/components/workspace/tabs/FuelTab';
import DeliveryOrdersTab from '@/components/workspace/tabs/DeliveryOrdersTab';
import OperatingHoursTab from '@/components/workspace/tabs/OperatingHoursTab';
import RentalInvoicesTab from '@/components/workspace/tabs/RentalInvoicesTab';
import ProfitabilityTab from '@/components/workspace/tabs/ProfitabilityTab';

export default function EquipmentWorkspace() {
  const { lang, activeEquipmentId, setActiveItem } = useStore();
  const [tab, setTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [equipment, setEquipment] = useState(null);
  const [rentals, setRentals] = useState([]);
  const [maintenance, setMaintenance] = useState([]);
  const [fuel, setFuel] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [rentalInvoices, setRentalInvoices] = useState([]);

  useEffect(() => {
    if (!activeEquipmentId) { setLoading(false); return; }
    (async () => {
      setLoading(true);
      try {
        const [eq, rc, mr, fl, exp, rinv] = await Promise.all([
          base44.entities.Equipment.filter({ id: activeEquipmentId }),
          base44.entities.RentalContract.filter({ equipmentId: activeEquipmentId }),
          base44.entities.MaintenanceRecord.filter({ equipmentId: activeEquipmentId }),
          base44.entities.FuelLog.filter({ equipmentId: activeEquipmentId }),
          base44.entities.Expense.filter({ equipmentId: activeEquipmentId }),
          base44.entities.RentalInvoice.filter({ equipmentId: activeEquipmentId }),
        ]);
        setEquipment(eq[0] || null);
        setRentals(rc); setMaintenance(mr); setFuel(fl); setExpenses(exp); setRentalInvoices(rinv);
      } finally {
        setLoading(false);
      }
    })();
  }, [activeEquipmentId]);

  if (!activeEquipmentId) {
    return (
      <div className="p-4 md:p-6">
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <Truck className="size-14 text-muted-foreground/40 mb-4" />
          <h2 className="text-lg font-bold">{t('لم يتم اختيار معدة', 'No equipment selected', lang)}</h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-md">
            {t('افتح سجل المعدات واختر معدة لعرض مركز عملها المتكامل.', 'Open the Equipment registry and pick a piece of equipment to view its integrated workspace.', lang)}
          </p>
          <button onClick={() => setActiveItem('equipment')} className="mt-4 px-4 py-2 rounded-lg bg-cyan-600 text-white text-sm font-medium hover:bg-cyan-700">
            {t('الذهاب للمعدات', 'Go to Equipment', lang)}
          </button>
        </div>
      </div>
    );
  }

  if (loading || !equipment) {
    return (
      <div className="p-4 md:p-6">
        <div className="h-8 w-64 bg-muted animate-pulse rounded mb-6" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}
        </div>
      </div>
    );
  }

  const postedRentalStatuses = ['APPROVED', 'SENT', 'PARTIALLY_PAID', 'PAID', 'OVERDUE'];
  const revenue = rentalInvoices
    .filter(r => postedRentalStatuses.includes(r.status))
    .reduce((s, r) => s + (r.totalAmount || 0), 0);
  const costs = maintenance.reduce((s, m) => s + (m.cost || 0), 0)
    + fuel.reduce((s, f) => s + (f.totalCost || 0), 0)
    + expenses.reduce((s, e) => s + (e.totalAmount || e.amount || 0), 0);

  const st = EQUIPMENT_STATUS[equipment.status] || EQUIPMENT_STATUS.AVAILABLE;
  const badge = <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${st.color}`}>{lang === 'ar' ? st.ar : st.en}</span>;

  // Rental lifecycle workflow order:
  // Overview → Rentals → Delivery/Return → Operating Hours → Maintenance → Fuel → Invoices → Expenses → Profitability
  const tabs = [
    { key: 'overview', ar: 'نظرة عامة', en: 'Overview', Icon: LayoutGrid },
    { key: 'rentals', ar: 'عقود التأجير', en: 'Rentals', Icon: FileText },
    { key: 'delivery', ar: 'التسليم والاسترجاع', en: 'Delivery/Return', Icon: PackageCheck },
    { key: 'hours', ar: 'ساعات التشغيل', en: 'Operating Hours', Icon: Timer },
    { key: 'maintenance', ar: 'الصيانة', en: 'Maintenance', Icon: Wrench },
    { key: 'fuel', ar: 'الوقود', en: 'Fuel', Icon: Fuel },
    { key: 'invoices', ar: 'فواتير التأجير', en: 'Rental Invoices', Icon: ReceiptText },
    { key: 'expenses', ar: 'المصروفات', en: 'Expenses', Icon: DollarSign },
    { key: 'profitability', ar: 'ربحية المعدة', en: 'Profitability', Icon: PieChart },
  ];

  return (
    <div className="p-4 md:p-6">
      <WorkspaceHeader
        title={equipment.name}
        subtitle={t('مركز عمل المعدة', 'Equipment Workspace', lang)}
        badge={badge}
        onBack={() => setActiveItem('equipment')}
      />
      <WorkspaceTabs tabs={tabs} active={tab} onChange={setTab} />

      {tab === 'overview' && <EquipmentOverview equipment={equipment} revenue={revenue} costs={costs} />}

      {tab === 'rentals' && (
        <RelatedList
          emptyText={t('لا توجد عقود تأجير لهذه المعدة', 'No rental contracts for this equipment', lang)}
          columns={[
            { header: { ar: 'رقم العقد', en: 'Contract No' }, cell: r => <span className="font-mono text-xs">{r.contractNo}</span> },
            { header: { ar: 'العميل', en: 'Client' }, cell: r => <span className="text-sm">{r.clientName || '—'}</span> },
            { header: { ar: 'البداية', en: 'Start' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.startDate, lang)}</span> },
            { header: { ar: 'النهاية', en: 'End' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.endDate, lang)}</span> },
            { header: { ar: 'القيمة', en: 'Amount' }, cell: r => formatCurrency(r.totalAmount, lang) },
            { header: { ar: 'الحالة', en: 'Status' }, cell: r => <span className="text-xs">{r.status}</span> },
          ]}
          rows={rentals}
        />
      )}

      {tab === 'delivery' && <DeliveryOrdersTab equipmentId={activeEquipmentId} />}
      {tab === 'hours' && <OperatingHoursTab equipmentId={activeEquipmentId} />}
      {tab === 'maintenance' && <MaintenanceTab equipmentId={activeEquipmentId} />}
      {tab === 'fuel' && <FuelTab equipmentId={activeEquipmentId} />}
      {tab === 'invoices' && <RentalInvoicesTab equipmentId={activeEquipmentId} />}
      {tab === 'profitability' && <ProfitabilityTab revenue={revenue} costs={costs} contractValue={equipment.purchaseCost || 0} />}

      {tab === 'expenses' && (
        <RelatedList
          emptyText={t('لا توجد مصروفات لهذه المعدة', 'No expenses for this equipment', lang)}
          columns={[
            { header: { ar: 'الوصف', en: 'Description' }, cell: r => <span className="text-sm">{r.description}</span> },
            { header: { ar: 'البند', en: 'Category' }, cell: r => <span className="text-xs text-muted-foreground">{r.category}</span> },
            { header: { ar: 'التاريخ', en: 'Date' }, cell: r => <span className="text-xs text-muted-foreground">{formatDate(r.date, lang)}</span> },
            { header: { ar: 'المبلغ', en: 'Amount' }, cell: r => formatCurrency(r.totalAmount || r.amount, lang) },
          ]}
          rows={expenses}
        />
      )}
    </div>
  );
}