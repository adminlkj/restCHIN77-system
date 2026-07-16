import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

// القيم الافتراضية لإعدادات الشركة قبل حفظ أي إعدادات فعلية.
// companyName فارغ عمداً — يجب على المستخدم إدخال بيانات شركته في الإعدادات.
export const DEFAULT_COMPANY_SETTINGS = {
  companyName: '',
  companyNameEn: '',
  vatNumber: '',
  crNumber: '',
  address: '',
  city: '',
  phone: '',
  email: '',
  website: '',
  logoUrl: '',
  headerImageUrl: '',
  footerImageUrl: '',
  template: 'MODERN',
  primaryColor: '#c8891f',
  accentColor: '#1f2d3d',
  bankName: '',
  bankAccountName: '',
  bankAccountNumber: '',
  bankBranch: '',
  iban: '',
  swiftCode: '',
  terms: '',
  receiptFooterMessage: '',
  showQr: true,
};

// ═══════════════════════════════════════════════════════════════════════
// ذاكرة مؤقتة (cache) على مستوى الوحدة — مشتركة بين كل مستهلكي الـ hook.
// هذا يمنع تكرار CompanySettings.list عند كل mount (كان يحدث في كل شاشة).
// السجل نادر التغيير، فلا حاجة لإعادة جلبه إلا عند: التحديث، الحذف، أو تسجيل الخروج.
// ═══════════════════════════════════════════════════════════════════════
let _cachedRecord = null;        // سجل CompanySettings الفعلي (يحوي id للتحديث)
let _cachedSettings = null;      // الـ settings المدموجة مع الافتراضي
let _fetchPromise = null;        // Promise قيد التنفيذ (dedup للطلبات المتزامنة)
let _lastFetchAt = 0;            // توقيت آخر جلب (لتفادي إعادة الجلب السريع)
const CACHE_TTL = 5 * 60 * 1000; // 5 دقائق — إعدادات الشركة لا تتغير غالباً

async function _fetchCompanySettings(force = false) {
  // إذا كان هناك طلب قيد التنفيذ، نعيد نفس Promise (dedup)
  if (_fetchPromise) return _fetchPromise;

  // إذا كان الكاش صالحاً وغير منتهي الصلاحية، نُعيده مباشرة
  const now = Date.now();
  if (!force && _cachedRecord !== null && (now - _lastFetchAt) < CACHE_TTL) {
    return { record: _cachedRecord, settings: _cachedSettings };
  }

  // إجراء الجلب الفعلي
  _fetchPromise = (async () => {
    try {
      const rows = await base44.entities.CompanySettings.list('-created_date', 1);
      const rec = rows?.[0] || null;
      const s = { ...DEFAULT_COMPANY_SETTINGS, ...(rec || {}) };
      _cachedRecord = rec;
      _cachedSettings = s;
      _lastFetchAt = Date.now();
      return { record: rec, settings: s };
    } catch (err) {
      console.error('Failed to load company settings:', err);
      // عند الفشل، نُعيد الكاش القديم إن وُجد (graceful degradation)
      if (_cachedRecord !== null) return { record: _cachedRecord, settings: _cachedSettings };
      return { record: null, settings: { ...DEFAULT_COMPANY_SETTINGS } };
    } finally {
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

// تُستدعى بعد تحديث/إنشاء إعدادات الشركة لتحديث الكاش فوراً.
export function invalidateCompanySettingsCache() {
  _cachedRecord = null;
  _cachedSettings = null;
  _lastFetchAt = 0;
}

// يحمّل سجل إعدادات الشركة الوحيد (أول سجل)، مدموجاً مع القيم الافتراضية.
// يعيد { settings, record, loading, reload } — record يحمل الـ id للتحديث.
//
// بعد إضافة الكاش: كل مستهلكي useCompanySettings() يشاركون نفس الكائن،
// فلا تُرسل طلبات CompanySettings.list متكررة عند كل mount.
export function useCompanySettings() {
  const [record, setRecord] = useState(_cachedRecord);
  const [loading, setLoading] = useState(_cachedRecord === null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { record: rec } = await _fetchCompanySettings(true);
      setRecord(rec);
    } catch {
      // silent — الكاش يحمينا
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // إن كان الكاش جاهزاً، نستخدمه مباشرة بدون طلب شبكة
    if (_cachedRecord !== null) {
      setRecord(_cachedRecord);
      setLoading(false);
      return;
    }
    // وإلا نُجلب من الخادم (مع dedup للطلبات المتزامنة)
    (async () => {
      const { record: rec } = await _fetchCompanySettings(false);
      if (active) { setRecord(rec); setLoading(false); }
    })();
    return () => { active = false; };
  }, []);

  const settings = { ...DEFAULT_COMPANY_SETTINGS, ...(record || {}) };
  return { settings, record, loading, reload: load };
}
