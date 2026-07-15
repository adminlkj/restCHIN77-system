import React from 'react';
import { t } from '@/lib/utils-binaa';
import CompanyHeader from '@/components/shared/CompanyHeader';

// ترويسة/تذييل موحّدة لكل المستندات الرسمية (سندات، استلام، رواتب، كشف حساب...).
//
// قواعد الترويسة (متفق عليها):
//   1. إن رفع المستخدم headerImageUrl → تُستخدم صورة الهيدر فقط (لا هيدر افتراضي).
//   2. إن لم يُرفع headerImageUrl → يُعرض CompanyHeader المبني من بيانات الشركة.
//   3. إن لم تُدخل بيانات الشركة (لا companyName) → لا تُعرض أي ترويسة.
//   4. لا توجد قيم افتراضية مولّدة (لا لوغو افتراضي، لا monogram) — كل البيانات من الإعدادات.

// شريط ترويسة الشركة الكامل — يُستخدم أعلى كل مستند.
export function DocumentHeader({ settings = {}, lang = 'ar', title, docNo, subtitle }) {
  // القاعدة 1: صورة الهيدر المرفوعة لها الأولوية — تُستخدم فقط
  if (settings.headerImageUrl) {
    return (
      <img
        src={settings.headerImageUrl}
        alt=""
        style={{ display: 'block', width: '100%', objectFit: 'cover', marginBottom: 12 }}
      />
    );
  }

  // القاعدة 2 + 3: الهيدر الافتراضي يُبنى من بيانات الشركة، أو يُرجع null إن لم تُدخل
  return (
    <CompanyHeader
      settings={settings}
      lang={lang}
      docTitle={title}
      docNo={docNo}
      docSubtitle={subtitle}
    />
  );
}

// تذييل الشركة الكامل — يُوضع أسفل كل مستند.
export function DocumentFooter({ settings = {}, lang = 'ar' }) {
  const primary = settings.primaryColor || '#059669';
  const rtl = lang === 'ar';
  const companyName = rtl
    ? settings.companyName || settings.companyNameEn || ''
    : settings.companyNameEn || settings.companyName || '';
  const bits = [
    settings.phone,
    settings.email,
    settings.vatNumber && `${t('الرقم الضريبي', 'VAT', lang)}: ${settings.vatNumber}`,
  ].filter(Boolean);

  if (!settings.footerImageUrl && bits.length === 0 && !companyName) return null;

  return (
    <div style={{ marginTop: 32 }}>
      {settings.footerImageUrl && (
        <img src={settings.footerImageUrl} alt="" style={{ display: 'block', width: '100%', objectFit: 'cover', marginBottom: 8 }} />
      )}
      <div style={{ borderTop: `2px solid ${primary}`, paddingTop: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#64748b' }}>
        <span>{companyName}</span>
        <span>{bits.join('  •  ')}</span>
      </div>
    </div>
  );
}