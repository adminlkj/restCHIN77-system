// ═══════════════════════════════════════════════════════════════════════
// نظام إعدادات الفروع — كل فرع له إعداداته الخاصة.
// يُخزّن في قاعدة البيانات (كيان BranchSetting) ليعمل عبر كل الأجهزة.
//
// التسلسل الهرمي للإيصال:
//   1. لوقو الفرع (من إعدادات الفرع)
//   2. اسم الشركة (موحد، من إعدادات الشركة)
//   3. بيانات الفرع (هاتف، عنوان، رقم ضريبي)
//
// لا يُعدّل هذا الملف أي محرك محاسبي.
// ═══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';

// القيم الافتراضية لإعدادات فرع جديد.
export const DEFAULT_BRANCH_SETTINGS = {
  branchId: '',          // معرّف الفرع (Project.id)
  branchName: '',        // اسم الفرع
  branchNameEn: '',      // الاسم الإنجليزي
  phone: '',             // هاتف الفرع
  phone2: '',            // هاتف إضافي
  address: '',           // العنوان التفصيلي
  city: '',              // المدينة/الحي
  logoUrl: '',           // شعار الفرع (للفاتورة A4 وعرض النظام)
  vatNumber: '',         // الرقم الضريبي للفرع (إن اختلف)
  primaryColor: '#d97706',
  accentColor: '#1f2d3d',
  managerName: '',       // اسم مدير الفرع
  posTerminalId: '',     // معرّف نقطة البيع
  isActive: true,
  // ─── إعدادات الإيصال الحراري (مستقلة عن شعار الفاتورة A4) ───
  thermalLogoEnabled: true,        // إظهار شعار الإيصال الحراري
  thermalLogoSource: 'BRANCH',     // BRANCH | CUSTOM
  thermalLogoUrl: '',              // شعار مخصص للإيصال (عند CUSTOM)
  thermalLogoWidth: 180,           // عرض الشعار بالبكسل
  thermalLogoHeight: 90,           // ارتفاع الشعار بالبكسل
  thermalLogoAlign: 'CENTER',      // CENTER | RIGHT | LEFT
  thermalLogoMarginBottom: 10,     // المسافة أسفل الشعار بالبكسل
  thermalLogoFit: 'CONTAIN',       // CONTAIN | COVER | ORIGINAL
};

// ذاكرة مؤقتة (cache) لتجنّب الطلبات المتكررة — تُحدّث عند كل جلب/حفظ.
const cache = new Map();

// جلب إعدادات فرع من قاعدة البيانات.
// يعيد Promise (async) لأنه يتصل بالخادم.
export async function getBranchSettings(branchId) {
  if (!branchId) return { ...DEFAULT_BRANCH_SETTINGS };

  // تحقق من الذاكرة المؤقتة أولاً
  if (cache.has(branchId)) {
    return { ...DEFAULT_BRANCH_SETTINGS, ...cache.get(branchId) };
  }

  try {
    const results = await base44.entities.BranchSetting.filter({ branchId });
    if (results && results.length > 0) {
      const settings = { ...DEFAULT_BRANCH_SETTINGS, ...results[0] };
      cache.set(branchId, settings);
      return settings;
    }
  } catch (e) {
    console.warn('Failed to fetch branch settings:', e);
  }

  return { ...DEFAULT_BRANCH_SETTINGS, branchId };
}

// حفظ إعدادات فرع في قاعدة البيانات.
export async function setBranchSettings(branchId, settings) {
  if (!branchId) return null;

  const payload = { ...DEFAULT_BRANCH_SETTINGS, ...settings, branchId };

  try {
    const results = await base44.entities.BranchSetting.filter({ branchId });
    if (results && results.length > 0) {
      // تحديث سجل موجود
      const updated = await base44.entities.BranchSetting.update(results[0].id, payload);
      cache.set(branchId, { ...payload, ...updated });
      return cache.get(branchId);
    } else {
      // إنشاء سجل جديد
      const created = await base44.entities.BranchSetting.create(payload);
      cache.set(branchId, { ...payload, ...created });
      return cache.get(branchId);
    }
  } catch (e) {
    console.error('Failed to save branch settings:', e);
    // fallback: cache only
    cache.set(branchId, payload);
    return payload;
  }
}

// دمج إعدادات الفرع مع إعدادات الشركة الأم.
// الأولوية: إعدادات الفرع > إعدادات الشركة > الافتراضي.
// يعيد Promise لأنه يجلب إعدادات الفرع من قاعدة البيانات.
//
// ملاحظة مهمة: شعار الإيصال الحراري مستقل عن شعار الفاتورة A4.
//   - logoUrl: شعار الفرع العام (يُستخدم في الفاتورة A4 وعرض النظام)
//   - thermalLogo* : إعدادات الإيصال الحراري فقط (لا تؤثر على الفاتورة A4)
export async function resolveReceiptSettings(branchId, companySettings = {}) {
  const branch = await getBranchSettings(branchId);
  return {
    ...companySettings,
    // اسم الشركة يبقى موحداً من إعدادات الشركة (لا يُ override باسم الفرع)
    companyName: companySettings.companyName || '',
    companyNameEn: companySettings.companyNameEn || '',
    // بيانات الفرع تظهر أسفل اسم الشركة
    branchName: branch.branchName || '',
    branchNameEn: branch.branchNameEn || '',
    phone: branch.phone || companySettings.phone || '',
    phone2: branch.phone2 || '',
    address: branch.address || companySettings.address || '',
    city: branch.city || companySettings.city || '',
    // شعار الفرع العام (للفاتورة A4 وعرض النظام) — مستقل عن الإيصال الحراري
    logoUrl: branch.logoUrl || companySettings.logoUrl || '',
    vatNumber: branch.vatNumber || companySettings.vatNumber || '',
    primaryColor: branch.primaryColor || companySettings.primaryColor || '#d97706',
    accentColor: branch.accentColor || companySettings.accentColor || '#1f2d3d',
    // ─── إعدادات الإيصال الحراري (مستقلة تماماً عن شعار الفاتورة A4) ───
    thermalLogoEnabled: branch.thermalLogoEnabled !== undefined ? branch.thermalLogoEnabled : true,
    thermalLogoSource: branch.thermalLogoSource || 'BRANCH',
    thermalLogoUrl: branch.thermalLogoUrl || '',
    thermalLogoWidth: Number(branch.thermalLogoWidth) || 180,
    thermalLogoHeight: Number(branch.thermalLogoHeight) || 90,
    thermalLogoAlign: branch.thermalLogoAlign || 'CENTER',
    thermalLogoMarginBottom: Number(branch.thermalLogoMarginBottom) || 10,
    thermalLogoFit: branch.thermalLogoFit || 'CONTAIN',
  };
}

// إنشاء نقطة بيع تلقائياً للفرع عند إنشائه.
export async function autoCreatePOS(branchId, branchName) {
  if (!branchId) return null;
  const posId = `POS-${branchId.slice(-6).toUpperCase()}`;
  await setBranchSettings(branchId, { posTerminalId: posId, branchName });
  return posId;
}

// حذف إعدادات فرع (عند حذف الفرع نفسه).
export async function deleteBranchSettings(branchId) {
  if (!branchId) return;
  cache.delete(branchId);
  try {
    const results = await base44.entities.BranchSetting.filter({ branchId });
    if (results && results.length > 0) {
      await base44.entities.BranchSetting.delete(results[0].id);
    }
  } catch (e) {
    console.warn('Failed to delete branch settings:', e);
  }
}

// قائمة كل إعدادات الفروع.
export async function listBranchSettings() {
  try {
    return await base44.entities.BranchSetting.list('-created_date', 500);
  } catch {
    return [];
  }
}
