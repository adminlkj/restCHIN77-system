// ═══════════════════════════════════════════════════════════════════════
// نظام إعدادات الفروع — كل فرع له إعداداته الخاصة (لوقو، اسم، هاتف، موقع).
// يُخزّن الجزء الخاص بالإعدادات في localStorage مفتّح بـ branchId،
// بينما البيانات الأساسية (code, name, location) تبقى في كيان Project.
//
// لا يُعدّل هذا الملف أي محرك محاسبي — هو طبقة عرض فقط.
// ═══════════════════════════════════════════════════════════════════════

const STORAGE_KEY = 'restaurant-branch-settings';

// القيم الافتراضية لإعدادات فرع جديد.
const DEFAULT_BRANCH_SETTINGS = {
  branchName: '',        // اسم الفرع (يُفضّل أخذه من Project.name)
  branchNameEn: '',      // الاسم الإنجليزي
  phone: '',             // هاتف الفرع
  phone2: '',            // هاتف إضافي
  address: '',           // العنوان التفصيلي
  city: '',              // المدينة/الحي
  logoUrl: '',           // شعار الفرع
  vatNumber: '',         // الرقم الضريبي للفرع (إن اختلف)
  primaryColor: '#d97706', // اللون الأساسي للإيصالات
  accentColor: '#1f2d3d',  // اللون الثانوي
  managerName: '',       // اسم مدير الفرع
  posTerminalId: '',     // معرّف نقطة البيع المرتبطة (يُنشأ تلقائياً)
  isActive: true,        // هل الفرع مفتوح؟
};

// قراءة كل إعدادات الفروع من localStorage.
function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

// حفظ كل إعدادات الفروع.
function writeAll(map) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch { /* ignore */ }
}

// جلب إعدادات فرع واحد بالمعرّف. يُدمج مع الافتراضيات.
export function getBranchSettings(branchId) {
  if (!branchId) return { ...DEFAULT_BRANCH_SETTINGS };
  const all = readAll();
  return { ...DEFAULT_BRANCH_SETTINGS, ...(all[branchId] || {}) };
}

// حفظ إعدادات فرع واحد.
export function setBranchSettings(branchId, settings) {
  if (!branchId) return;
  const all = readAll();
  all[branchId] = { ...DEFAULT_BRANCH_SETTINGS, ...(all[branchId] || {}), ...settings };
  writeAll(all);
  return all[branchId];
}

// دمج إعدادات الفرع مع إعدادات الشركة الأم (الإعدادات العامة).
// الأولوية: إعدادات الفرع > إعدادات الشركة > الافتراضي.
// هذا ما يُمرّر إلى قالب الإيصال الحراري.
export function resolveReceiptSettings(branchId, companySettings = {}) {
  const branch = getBranchSettings(branchId);
  return {
    ...companySettings,
    companyName: branch.branchName || companySettings.companyName || '',
    companyNameEn: branch.branchNameEn || companySettings.companyNameEn || '',
    phone: branch.phone || companySettings.phone || '',
    address: branch.address || companySettings.address || '',
    city: branch.city || companySettings.city || '',
    logoUrl: branch.logoUrl || companySettings.logoUrl || '',
    vatNumber: branch.vatNumber || companySettings.vatNumber || '',
    primaryColor: branch.primaryColor || companySettings.primaryColor || '#d97706',
    accentColor: branch.accentColor || companySettings.accentColor || '#1f2d3d',
    // حقل إضافي يُستخدم في الإيصال لتمييز الفرع
    branchName: branch.branchName,
  };
}

// إنشاء نقطة بيع تلقائياً للفرع عند إنشائه.
// يُرجع معرّف نقطة البيع (POS Terminal ID).
export function autoCreatePOS(branchId, branchName) {
  if (!branchId) return null;
  const posId = `POS-${branchId.slice(-6).toUpperCase()}`;
  setBranchSettings(branchId, { posTerminalId: posId });
  return posId;
}

// حذف إعدادات فرع (عند حذف الفرع نفسه).
export function deleteBranchSettings(branchId) {
  if (!branchId) return;
  const all = readAll();
  delete all[branchId];
  writeAll(all);
}

// قائمة كل معرّفات الفروع التي لها إعدادات محفوظة.
export function listBranchIds() {
  return Object.keys(readAll());
}
