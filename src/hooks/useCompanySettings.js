import { useState, useEffect } from 'react';
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

// يحمّل سجل إعدادات الشركة الوحيد (أول سجل)، مدموجاً مع القيم الافتراضية.
// يعيد { settings, record, loading, reload } — record يحمل الـ id للتحديث.
export function useCompanySettings() {
  const [record, setRecord] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.CompanySettings.list('-created_date', 1);
      setRecord(rows?.[0] || null);
    } catch (err) {
      console.error('Failed to load company settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const settings = { ...DEFAULT_COMPANY_SETTINGS, ...(record || {}) };
  return { settings, record, loading, reload: load };
}