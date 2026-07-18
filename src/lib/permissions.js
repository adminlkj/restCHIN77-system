// ─────────────────────────────────────────────────────────────
// Central permissions layer for Binaa ERP
// Defines business roles, module registry, and access resolution.
// ─────────────────────────────────────────────────────────────

// All addressable modules in the system (must match Sidebar item keys)
export const MODULES = [
  // POS & Sales
  { key: 'pos', ar: 'نقطة البيع', en: 'POS', group: 'projects' },
  { key: 'tables', ar: 'الطاولات', en: 'Tables', group: 'projects' },
  { key: 'projects', ar: 'الطلبات', en: 'Orders', group: 'projects' },
  { key: 'sales', ar: 'الإيصالات', en: 'Receipts', group: 'projects' },
  { key: 'client-payments', ar: 'التحصيلات', en: 'Collections', group: 'projects' },
  // Restaurant Equipment
  { key: 'equipment', ar: 'سجل المعدات', en: 'Equipment', group: 'rental' },
  { key: 'equipment-maintenance', ar: 'الصيانة', en: 'Maintenance', group: 'rental' },
  // Procurement & Costs
  { key: 'purchase-requests', ar: 'طلبات الشراء', en: 'Purchase Requests', group: 'costs' },
  { key: 'purchase-orders', ar: 'أوامر الشراء', en: 'Purchase Orders', group: 'costs' },
  { key: 'goods-receipts', ar: 'سندات الاستلام', en: 'Goods Receipts', group: 'costs' },
  { key: 'expenses', ar: 'المصروفات', en: 'Expenses', group: 'costs' },
  { key: 'supplier-invoices', ar: 'فواتير الموردين', en: 'Supplier Invoices', group: 'costs' },
  { key: 'supplier-payments', ar: 'سداد الموردين', en: 'Supplier Payments', group: 'costs' },
  { key: 'inventory', ar: 'المخزون والمواد', en: 'Inventory', group: 'costs' },
  // HR
  { key: 'employees', ar: 'الموظفون', en: 'Employees', group: 'hr' },
  { key: 'employee-workspace', ar: 'مركز عمل الموظف', en: 'Employee Workspace', group: 'hr' },
  { key: 'payroll-runs', ar: 'مسيرات الرواتب', en: 'Payroll Runs', group: 'hr' },
  { key: 'payroll-sheets', ar: 'كشوفات الرواتب', en: 'Payroll Sheets', group: 'hr' },
  { key: 'attendance', ar: 'الحضور', en: 'Attendance', group: 'hr' },
  { key: 'advances', ar: 'السلف', en: 'Advances', group: 'hr' },
  // Accounting
  { key: 'chart-accounts', ar: 'الدليل المحاسبي', en: 'Chart of Accounts', group: 'accounting' },
  { key: 'accounting', ar: 'دفتر اليومية', en: 'Journal', group: 'accounting' },
  { key: 'general-ledger', ar: 'الأستاذ العام', en: 'General Ledger', group: 'accounting' },
  { key: 'trial-balance', ar: 'ميزان المراجعة', en: 'Trial Balance', group: 'accounting' },
  { key: 'vat', ar: 'ضريبة القيمة المضافة', en: 'VAT', group: 'accounting' },
  { key: 'cost-centers', ar: 'أقسام المطعم', en: 'Restaurant Sections', group: 'accounting' },
  { key: 'reports', ar: 'التقارير', en: 'Reports', group: 'reports' },
  { key: 'fiscal-years', ar: 'السنوات المالية', en: 'Fiscal Years', group: 'accounting' },
  { key: 'fixed-assets', ar: 'الأصول والإهلاك', en: 'Fixed Assets', group: 'accounting' },
  { key: 'audit', ar: 'المراجعة والتدقيق', en: 'Audit Suite', group: 'accounting' },
  // Master data & settings
  { key: 'clients', ar: 'الزبائن', en: 'Customers', group: 'settings' },
  { key: 'suppliers', ar: 'الموردون', en: 'Suppliers', group: 'settings' },
  { key: 'platforms', ar: 'منصات التوصيل', en: 'Delivery Platforms', group: 'settings' },
  { key: 'menu', ar: 'إدارة القائمة', en: 'Menu Management', group: 'settings' },
  { key: 'warehouses', ar: 'المخازن', en: 'Warehouses', group: 'settings' },
  { key: 'stock-movements', ar: 'الحركات المخزنية', en: 'Stock Movements', group: 'settings' },
  { key: 'users', ar: 'المستخدمون والصلاحيات', en: 'Users & Permissions', group: 'settings' },
  { key: 'settings', ar: 'إعدادات النظام', en: 'System Settings', group: 'settings' },
];

export const ALL_MODULE_KEYS = MODULES.map(m => m.key);

// ─────────────────────────────────────────────────────────────
// In-screen actions. Every module a user can see also carries a set
// of granted actions. "view" is implied by having screen access; the
// other three gate the create / edit / delete controls inside a screen.
// ─────────────────────────────────────────────────────────────
export const ACTIONS = [
  { key: 'create', ar: 'إضافة', en: 'Create' },
  { key: 'edit', ar: 'تعديل', en: 'Edit' },
  { key: 'delete', ar: 'حذف', en: 'Delete' },
];
export const ACTION_KEYS = ACTIONS.map(a => a.key);
// Read-only screens where create/edit/delete don't apply — only "view".
export const VIEW_ONLY_MODULES = new Set([
  'general-ledger', 'trial-balance', 'vat', 'reports',
]);

// البريد الإلكتروني لمالك النظام — له صلاحية مطلقة بصرف النظر عن الدور.
export const OWNER_EMAIL = 'fysl71443@gmail.com';

// حساب المطوّر الأساسي: ثابت لا يُحذف ولا يُعطّل ولا يُغيَّر دوره.
export function isProtectedOwner(user) {
  return Boolean(user?.email && user.email.toLowerCase() === OWNER_EMAIL);
}

// Business roles with default module access + labels
export const APP_ROLES = {
  OWNER: {
    ar: 'مالك النظام', en: 'System Owner',
    color: 'bg-violet-100 text-violet-700 border border-violet-200',
    modules: '*', // all — صلاحية مطلقة
  },
  RESTAURANT_MANAGER: {
    ar: 'مدير المطعم', en: 'Restaurant Manager',
    color: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    modules: ['pos', 'tables', 'projects', 'sales', 'client-payments',
      'purchase-orders', 'purchase-requests', 'goods-receipts', 'expenses',
      'reports', 'clients', 'suppliers', 'platforms', 'menu', 'inventory', 'warehouses', 'stock-movements',
      'employees', 'attendance', 'equipment', 'equipment-maintenance'],
  },
  CASHIER: {
    ar: 'كاشير', en: 'Cashier',
    color: 'bg-amber-100 text-amber-700 border border-amber-200',
    modules: ['pos', 'tables', 'sales', 'client-payments', 'clients'],
  },
  ACCOUNTANT: {
    ar: 'محاسب', en: 'Accountant',
    color: 'bg-teal-100 text-teal-700 border border-teal-200',
    modules: ['sales', 'client-payments', 'purchase-orders', 'purchase-requests', 'goods-receipts', 'expenses', 'supplier-invoices',
      'supplier-payments', 'chart-accounts', 'accounting', 'general-ledger', 'trial-balance', 'cost-centers',
      'vat', 'reports', 'fiscal-years', 'fixed-assets', 'audit', 'payroll-runs', 'payroll-sheets', 'clients', 'suppliers', 'platforms',
      'projects'],
  },
  BRANCH_MANAGER: {
    ar: 'مدير فرع', en: 'Branch Manager',
    color: 'bg-emerald-100 text-emerald-700 border border-emerald-200',
    modules: ['pos', 'tables', 'projects', 'sales', 'client-payments', 'purchase-orders',
      'purchase-requests', 'goods-receipts', 'expenses',
      'reports', 'clients', 'menu'],
  },
  PROCUREMENT: {
    ar: 'مسؤول مشتريات', en: 'Procurement',
    color: 'bg-amber-100 text-amber-700 border border-amber-200',
    modules: ['purchase-orders', 'purchase-requests', 'goods-receipts', 'supplier-invoices', 'supplier-payments', 'inventory',
      'warehouses', 'stock-movements', 'suppliers'],
  },
  HR: {
    ar: 'موارد بشرية', en: 'Human Resources',
    color: 'bg-blue-100 text-blue-700 border border-blue-200',
    modules: ['employees', 'payroll-runs', 'attendance', 'advances', 'reports'],
  },
  KITCHEN_STAFF: {
    ar: 'موظف مطبخ', en: 'Kitchen Staff',
    color: 'bg-cyan-100 text-cyan-700 border border-cyan-200',
    modules: ['pos', 'tables', 'menu', 'inventory', 'equipment-maintenance'],
  },
  VIEWER: {
    ar: 'مشاهدة فقط', en: 'Viewer',
    color: 'bg-slate-100 text-slate-600 border border-slate-200',
    modules: ['reports'],
  },
};

export const APP_ROLE_KEYS = Object.keys(APP_ROLES);

// Resolve the effective set of module keys for a user
export function resolveUserModules(user) {
  if (!user) return [];
  // مالك النظام (بالبريد) له صلاحية مطلقة
  if (user.email && user.email.toLowerCase() === OWNER_EMAIL) return ALL_MODULE_KEYS;
  // System admins always get everything
  if (user.role === 'admin') return ALL_MODULE_KEYS;
  // Explicit override wins
  if (Array.isArray(user.allowedModules) && user.allowedModules.length > 0) {
    return user.allowedModules;
  }
  const role = APP_ROLES[user.appRole || 'VIEWER'];
  if (!role) return [];
  return role.modules === '*' ? ALL_MODULE_KEYS : role.modules;
}

export function canAccess(user, moduleKey) {
  // مالك النظام (بالبريد) له صلاحية مطلقة
  if (user?.email && user.email.toLowerCase() === OWNER_EMAIL) return user?.isActive !== false;
  // dashboard is always accessible for active signed-in users
  if (moduleKey === 'dashboard') return user?.isActive !== false;
  const modules = resolveUserModules(user);
  // Report tabs live under the reports cycle; anyone with reports access can open them.
  if (moduleKey?.startsWith('report-')) return modules.includes('reports') || modules.includes(moduleKey);
  return modules.includes(moduleKey);
}

// ─────────────────────────────────────────────────────────────
// In-screen action resolution
// ─────────────────────────────────────────────────────────────
// Resolve the granted actions for a specific module for this user.
// - admins / OWNER: all actions everywhere
// - a per-module override on user.modulePermissions[moduleKey] wins
// - otherwise: full actions on any module the user can access (legacy behaviour)
export function resolveModuleActions(user, moduleKey) {
  if (!user || user.isActive === false) return [];
  if (!canAccess(user, moduleKey)) return [];
  if (isAdmin(user)) return ACTION_KEYS;
  const map = user.modulePermissions;
  if (map && Array.isArray(map[moduleKey])) return map[moduleKey];
  if ((user.appRole || 'VIEWER') === 'VIEWER') return [];
  // No explicit override → operational roles can act inside their accessible screens.
  return ACTION_KEYS;
}

// Check a single action ('create' | 'edit' | 'delete') on a module.
export function hasPermission(user, moduleKey, action) {
  if (!action || action === 'view') return canAccess(user, moduleKey);
  return resolveModuleActions(user, moduleKey).includes(action);
}

export function isAdmin(user) {
  // مالك النظام بالبريد يُعامل كأدمن
  if (user?.email && user.email.toLowerCase() === OWNER_EMAIL) return true;
  return user?.role === 'admin' || user?.appRole === 'OWNER';
}

export function getRoleMeta(appRole) {
  return APP_ROLES[appRole] || APP_ROLES.VIEWER;
}