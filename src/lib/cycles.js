// Cycle definitions: each workspace cycle is a single unified screen with top tabs.
// The sidebar shows only the cycle names; clicking one opens its screen and its
// sub-sections appear as horizontal tabs inside that screen.
//
// ملاحظة تحويل النظام: المفاتيح (key) ثابتة لا تُغيَّر لأن المحركات والمسارات
// تعتمد عليها، لكن التسميات (ar/en) والأيقونات حُدّثت لتتناسب مع المطاعم.
import {
  Building2, Truck, ShoppingCart, Users, Calculator, Settings,
  FileText, CreditCard, ReceiptText, ClipboardList,
  Wrench, CalendarDays, DollarSign, Wallet, HandCoins,
  UsersRound, Package, Warehouse, Boxes, ShieldCheck, Network, BookOpen, Shield, BarChart3, CalendarRange, Scale,
  GitPullRequestArrow, TrendingUp, PieChart, Landmark, Waves, ShieldQuestion,
  UtensilsCrossed, ChefHat, Bike, Soup, Cookie, Apple,
} from 'lucide-react';

// Keys that have a real screen wired in App.jsx. Others render a ComingSoon placeholder.
export const READY_TABS = new Set([
  'pos', 'tables', 'branches',
  'projects', 'sales', 'client-payments',
  'equipment', 'equipment-maintenance',
  'purchase-requests', 'purchase-orders', 'goods-receipts', 'supplier-invoices', 'supplier-payments',
  'expenses',
  'employees', 'payroll-runs', 'payroll-sheets', 'attendance', 'advances',
  'chart-accounts', 'accounting', 'cost-centers', 'fiscal-years', 'fixed-assets', 'audit',
  'clients', 'suppliers', 'inventory', 'warehouses', 'stock-movements', 'users', 'settings',
  'platforms', 'menu',
  // Reports cycle
  'report-income', 'report-balance', 'report-cashflow', 'report-ledger', 'report-trial', 'report-vat', 'report-projects', 'report-inventory', 'report-partners', 'report-employees',
]);

export const CYCLES = [
  {
    key: 'projects-cycle',
    label: { ar: 'الطلبات والمبيعات', en: 'Orders & Sales' },
    Icon: UtensilsCrossed,
    color: { text: 'text-emerald-600', border: 'border-emerald-500', light: 'bg-emerald-50', bg: 'bg-emerald-600' },
    // دورة المبيعات الرئيسية تعرض فقط: الطلبات، الإيصالات، التحصيلات.
    // باقي الأقسام تبقى حصراً داخل مركز عمل كل طلب لتفادي التكرار.
    tabs: [
      { key: 'projects',        ar: 'الطلبات',            en: 'Orders',          Icon: UtensilsCrossed },
      { key: 'sales',           ar: 'الإيصالات',          en: 'Receipts',        Icon: ReceiptText },
      { key: 'client-payments', ar: 'التحصيلات',          en: 'Collections',     Icon: CreditCard },
    ],
  },
  {
    key: 'rental-cycle',
    label: { ar: 'معدات المطعم', en: 'Restaurant Equipment' },
    Icon: Truck,
    color: { text: 'text-cyan-600', border: 'border-cyan-500', light: 'bg-cyan-50', bg: 'bg-cyan-600' },
    tabs: [
      { key: 'equipment',             ar: 'سجل المعدات',   en: 'Equipment Registry', Icon: Truck },
      { key: 'equipment-maintenance', ar: 'الصيانة',      en: 'Maintenance',        Icon: Wrench },
    ],
  },
  {
    key: 'procurement-cycle',
    label: { ar: 'المشتريات', en: 'Procurement' },
    Icon: ShoppingCart,
    color: { text: 'text-amber-600', border: 'border-amber-500', light: 'bg-amber-50', bg: 'bg-amber-600' },
    tabs: [
      { key: 'purchase-requests', ar: 'طلبات الشراء',    en: 'Purchase Requests', Icon: ClipboardList },
      { key: 'purchase-orders',   ar: 'أوامر الشراء',    en: 'Purchase Orders',   Icon: ShoppingCart },
      { key: 'goods-receipts',    ar: 'الاستلام',        en: 'Goods Receipts',    Icon: Package },
      { key: 'supplier-invoices', ar: 'فواتير الموردين', en: 'Supplier Invoices', Icon: ReceiptText },
      { key: 'supplier-payments', ar: 'سداد الموردين',   en: 'Supplier Payments', Icon: Wallet },
    ],
  },
  {
    key: 'costs-cycle',
    label: { ar: 'المصروفات التشغيلية', en: 'Operating Costs' },
    Icon: DollarSign,
    color: { text: 'text-rose-600', border: 'border-rose-500', light: 'bg-rose-50', bg: 'bg-rose-600' },
    tabs: [
      { key: 'expenses', ar: 'المصروفات التشغيلية', en: 'Operating Expenses', Icon: DollarSign },
    ],
  },
  {
    key: 'hr-cycle',
    label: { ar: 'الموارد البشرية', en: 'Human Resources' },
    Icon: Users,
    color: { text: 'text-violet-600', border: 'border-violet-500', light: 'bg-violet-50', bg: 'bg-violet-600' },
    tabs: [
      { key: 'employees',      ar: 'ملفات الموظفين',    en: 'Employee Files', Icon: UsersRound },
      { key: 'payroll-runs',   ar: 'مسيرات الرواتب',    en: 'Payroll Runs',   Icon: Wallet },
      { key: 'payroll-sheets', ar: 'كشوفات الرواتب',    en: 'Payroll Sheets', Icon: ReceiptText },
      { key: 'attendance',     ar: 'الحضور والإجازات',  en: 'Attendance',     Icon: CalendarDays },
      { key: 'advances',       ar: 'السلف والاستقطاعات', en: 'Advances',      Icon: HandCoins },
    ],
  },
  {
    key: 'accounting-cycle',
    label: { ar: 'المالية والمحاسبة', en: 'Finance & Accounting' },
    Icon: Calculator,
    color: { text: 'text-teal-600', border: 'border-teal-500', light: 'bg-teal-50', bg: 'bg-teal-600' },
    tabs: [
      { key: 'chart-accounts', ar: 'الدليل المحاسبي',   en: 'Chart of Accounts', Icon: Network },
      { key: 'accounting',     ar: 'دفتر اليومية',      en: 'Journal Entries',   Icon: BookOpen },
      { key: 'cost-centers',   ar: 'أقسام المطعم',      en: 'Restaurant Sections', Icon: PieChart },
      { key: 'fiscal-years',   ar: 'السنوات المالية',    en: 'Fiscal Years',      Icon: CalendarRange },
      { key: 'fixed-assets',   ar: 'الأصول والإهلاك',    en: 'Fixed Assets',      Icon: Landmark },
      { key: 'audit',          ar: 'المراجعة والتدقيق',  en: 'Audit Suite',       Icon: ShieldCheck },
    ],
  },
  {
    key: 'reports-cycle',
    label: { ar: 'التقارير', en: 'Reports' },
    Icon: BarChart3,
    color: { text: 'text-indigo-600', border: 'border-indigo-500', light: 'bg-indigo-50', bg: 'bg-indigo-600' },
    tabs: [
      { key: 'report-income',    ar: 'قائمة الدخل',              en: 'Income Statement', Icon: TrendingUp },
      { key: 'report-balance',   ar: 'المركز المالي',            en: 'Balance Sheet',    Icon: Landmark },
      { key: 'report-cashflow',  ar: 'التدفقات النقدية',         en: 'Cash Flow',        Icon: Waves },
      { key: 'report-ledger',    ar: 'كشوفات الحساب',            en: 'Account Statements', Icon: BookOpen },
      { key: 'report-trial',     ar: 'ميزان المراجعة',           en: 'Trial Balance',    Icon: Scale },
      { key: 'report-vat',       ar: 'ضريبة القيمة المضافة',     en: 'VAT Report',       Icon: Shield },
      { key: 'report-projects',  ar: 'تقارير المبيعات والفروع',  en: 'Sales & Branch Reports', Icon: PieChart },
      { key: 'report-inventory', ar: 'تقارير المخازن',           en: 'Inventory Reports', Icon: Warehouse },
      { key: 'report-partners',  ar: 'متابعة الزبائن والموردين', en: 'Customers & Suppliers Follow-up', Icon: UsersRound },
      { key: 'report-employees', ar: 'تقارير الموظفين',          en: 'Employee Reports', Icon: Users },
    ],
  },
  {
    key: 'partners-cycle',
    label: { ar: 'الزبائن والموردون', en: 'Customers & Suppliers' },
    Icon: UsersRound,
    color: { text: 'text-rose-600', border: 'border-rose-500', light: 'bg-rose-50', bg: 'bg-rose-600' },
    tabs: [
      { key: 'clients',   ar: 'الزبائن',         en: 'Customers',  Icon: UsersRound },
      { key: 'suppliers', ar: 'الموردون',        en: 'Suppliers',  Icon: Package },
      { key: 'platforms', ar: 'منصات التوصيل',   en: 'Delivery Platforms', Icon: Bike },
    ],
  },
  {
    key: 'users-cycle',
    label: { ar: 'المستخدمون والصلاحيات', en: 'Users & Permissions' },
    Icon: ShieldCheck,
    color: { text: 'text-fuchsia-600', border: 'border-fuchsia-500', light: 'bg-fuchsia-50', bg: 'bg-fuchsia-600' },
    tabs: [
      { key: 'users', ar: 'المستخدمون والصلاحيات', en: 'Users & Permissions', Icon: ShieldCheck },
    ],
  },
  {
    key: 'inventory-cycle',
    label: { ar: 'المخازن والمكوّنات', en: 'Inventory & Ingredients' },
    Icon: Boxes,
    color: { text: 'text-lime-600', border: 'border-lime-500', light: 'bg-lime-50', bg: 'bg-lime-600' },
    tabs: [
      { key: 'warehouses',      ar: 'المخازن',          en: 'Warehouses',      Icon: Warehouse },
      { key: 'stock-movements', ar: 'الحركات المخزنية', en: 'Stock Movements', Icon: GitPullRequestArrow },
      { key: 'inventory',       ar: 'المخزون والمواد',  en: 'Inventory',       Icon: Package },
      { key: 'menu',            ar: 'إدارة القائمة',    en: 'Menu Management', Icon: UtensilsCrossed },
    ],
  },
  {
    key: 'settings-cycle',
    label: { ar: 'الإعدادات والبيانات', en: 'Settings & Master Data' },
    Icon: Settings,
    color: { text: 'text-slate-600', border: 'border-slate-500', light: 'bg-slate-50', bg: 'bg-slate-600' },
    tabs: [
      { key: 'settings',        ar: 'إعدادات النظام',   en: 'System Settings', Icon: Settings },
    ],
  },
];

export const CYCLE_BY_KEY = Object.fromEntries(CYCLES.map(c => [c.key, c]));

// Map any tab key back to the cycle that contains it.
export function cycleForTab(tabKey) {
  for (const c of CYCLES) {
    if (c.tabs.some(t => t.key === tabKey)) return c;
  }
  return null;
}