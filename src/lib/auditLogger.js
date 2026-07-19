// ═══════════════════════════════════════════════════════════════════════
// Audit Logger — محرّك تسجيل العمليات الحساسة في كيان AuditLog.
//
// الفلسفة: كل عملية مالية/أمنية (بيع، إلغاء، خصم، تسجيل دخول، قفل طاولة)
// تُسجَّل بـ who/what/when/where. الفشل في التسجيل لا يُعطّل العملية الأساسية
// (نكتفي بـ console.warn) لأن سجل التدقيق إضافي، لكنه ضروري للرقابة.
//
// كل الدوال async وتُرجع Promise<void> — لا حاجة لانتظارها في المسار الرئيسي.
// ═══════════════════════════════════════════════════════════════════════

import { base44 } from '@/api/base44Client';

// أنواع العمليات الموثّقة (للاتساق في الفلترة لاحقاً).
export const AUDIT_ACTIONS = {
  // المبيعات
  SALE_CREATE: 'SALE_CREATE',
  SALE_APPROVE: 'SALE_APPROVE',
  SALE_CANCEL: 'SALE_CANCEL',
  SALE_REVERSE: 'SALE_REVERSE',
  SALE_HOLD: 'SALE_HOLD',
  SALE_RESUME: 'SALE_RESUME',
  // الخصومات
  DISCOUNT_OVERRIDE: 'DISCOUNT_OVERRIDE',
  MANUAL_DISCOUNT: 'MANUAL_DISCOUNT',
  // الطاولات
  TABLE_LOCK: 'TABLE_LOCK',
  TABLE_UNLOCK: 'TABLE_UNLOCK',
  TABLE_CONFLICT: 'TABLE_CONFLICT',
  DRAFT_SAVE: 'DRAFT_SAVE',
  DRAFT_CLEAR: 'DRAFT_CLEAR',
  // الأمان
  CANCEL_PASSWORD_OK: 'CANCEL_PASSWORD_OK',
  CANCEL_PASSWORD_FAIL: 'CANCEL_PASSWORD_FAIL',
  LOGIN: 'LOGIN',
  LOGOUT: 'LOGOUT',
  // المشتريات/المحاسبة
  PURCHASE_APPROVE: 'PURCHASE_APPROVE',
  JE_POST: 'JE_POST',
  JE_REVERSE: 'JE_REVERSE',
  // عام
  ENTITY_DELETE: 'ENTITY_DELETE',
  ENTITY_UPDATE: 'ENTITY_UPDATE',
};

// تصنيف كل عملية حسب الفئة (للتبويب في شاشة سجل التدقيق).
const CATEGORY_BY_ACTION = {
  SALE_CREATE: 'SALES', SALE_APPROVE: 'SALES', SALE_CANCEL: 'SALES',
  SALE_REVERSE: 'SALES', SALE_HOLD: 'SALES', SALE_RESUME: 'SALES',
  DISCOUNT_OVERRIDE: 'SALES', MANUAL_DISCOUNT: 'SALES',
  TABLE_LOCK: 'TABLE', TABLE_UNLOCK: 'TABLE', TABLE_CONFLICT: 'TABLE',
  DRAFT_SAVE: 'TABLE', DRAFT_CLEAR: 'TABLE',
  CANCEL_PASSWORD_OK: 'SECURITY', CANCEL_PASSWORD_FAIL: 'SECURITY',
  LOGIN: 'SECURITY', LOGOUT: 'SECURITY',
  PURCHASE_APPROVE: 'PURCHASE', JE_POST: 'ACCOUNTING', JE_REVERSE: 'ACCOUNTING',
  ENTITY_DELETE: 'OTHER', ENTITY_UPDATE: 'OTHER',
};

/**
 * تسجيل عملية حساسة في سجل التدقيق.
 *
 * @param {Object} params
 * @param {string} params.action   - أحد AUDIT_ACTIONS
 * @param {Object} params.user     - كائن المستخدم (من useAuth)
 * @param {string} [params.entityType]
 * @param {string} [params.entityId]
 * @param {string} [params.entityNo]
 * @param {string} [params.description]
 * @param {number} [params.amount]
 * @param {string} [params.severity] - INFO | WARNING | CRITICAL
 * @param {string} [params.branchId]
 * @param {string} [params.branchName]
 * @param {Object} [params.metadata] - بيانات إضافية
 */
export async function logAudit({
  action, user, entityType = '', entityId = '', entityNo = '',
  description = '', amount = 0, severity = 'INFO',
  branchId = '', branchName = '', metadata = {},
}) {
  if (!action) return;
  try {
    const payload = {
      action,
      category: CATEGORY_BY_ACTION[action] || 'OTHER',
      entityType,
      entityId,
      entityNo,
      description: description || action,
      userId: user?.id || 'unknown',
      userName: user?.full_name || '',
      userEmail: user?.email || '',
      userRole: user?.role || user?.appRole || '',
      branchId,
      branchName,
      amount: Number(amount) || 0,
      severity,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      metadata,
    };
    await base44.entities.AuditLog.create(payload);
  } catch (e) {
    // الفشل في تسجيل التدقيق لا يُعطّل العملية الأساسية — نُسجّل تحذيراً فقط.
    console.warn('AuditLog write failed:', e);
  }
}

// واجهات مختصرة للحالات الشائعة.
export const audit = {
  sale: (user, invoice, branch, action = AUDIT_ACTIONS.SALE_CREATE, severity = 'INFO', metadata = {}) =>
    logAudit({
      action, user,
      entityType: 'SalesInvoice', entityId: invoice?.id || '', entityNo: invoice?.invoiceNo || '',
      description: `فاتورة مبيعات ${invoice?.invoiceNo || ''}`,
      amount: Number(invoice?.totalAmount) || 0,
      severity,
      branchId: branch?.id || invoice?.projectId || '',
      branchName: branch?.name || invoice?.projectName || '',
      metadata,
    }),

  cancel: (user, invoice, branch, success, metadata = {}) =>
    logAudit({
      action: success ? AUDIT_ACTIONS.CANCEL_PASSWORD_OK : AUDIT_ACTIONS.CANCEL_PASSWORD_FAIL,
      user,
      entityType: 'SalesInvoice', entityId: invoice?.id || '', entityNo: invoice?.invoiceNo || '',
      description: success ? `إلغاء فاتورة ${invoice?.invoiceNo || ''}` : `محاولة إلغاء فاشلة لفاتورة ${invoice?.invoiceNo || ''}`,
      amount: Number(invoice?.totalAmount) || 0,
      severity: success ? 'WARNING' : 'CRITICAL',
      branchId: branch?.id || '', branchName: branch?.name || '',
      metadata,
    }),

  discount: (user, invoice, branch, discountType, value, amount) =>
    logAudit({
      action: AUDIT_ACTIONS.MANUAL_DISCOUNT,
      user,
      entityType: 'SalesInvoice', entityId: invoice?.id || '', entityNo: invoice?.invoiceNo || '',
      description: `خصم يدوي (${discountType}=${value}) على فاتورة ${invoice?.invoiceNo || ''}`,
      amount: Number(amount) || 0,
      severity: 'WARNING',
      branchId: branch?.id || '', branchName: branch?.name || '',
      metadata: { discountType, value, amount },
    }),

  tableLock: (user, branch, table, conflict = null) =>
    logAudit({
      action: conflict ? AUDIT_ACTIONS.TABLE_CONFLICT : AUDIT_ACTIONS.TABLE_LOCK,
      user,
      entityType: 'Table', entityId: table?.id || table?.tableId || '', entityNo: table?.name || '',
      description: conflict
        ? `محاولة فتح طاولة مأخوذة من ${conflict}`
        : `فتح طاولة ${table?.name || ''}`,
      severity: conflict ? 'WARNING' : 'INFO',
      branchId: branch?.id || '', branchName: branch?.name || '',
      metadata: { conflict },
    }),

  login: (user, success) =>
    logAudit({
      action: AUDIT_ACTIONS.LOGIN,
      user: user || { id: 'unknown' },
      description: success ? `تسجيل دخول ناجح: ${user?.email || ''}` : 'محاولة دخول فاشلة',
      severity: success ? 'INFO' : 'WARNING',
      metadata: { success },
    }),
};
