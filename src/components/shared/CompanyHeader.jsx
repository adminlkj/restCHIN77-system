import React from 'react';
import { Phone, Mail, Globe, MapPin, Receipt, Landmark } from 'lucide-react';
import { t } from '@/lib/utils-binaa';

/**
 * CompanyHeader — هيدر افتراضي للمستندات يُبنى من بيانات الشركة فقط.
 *
 * القواعد (متفق عليها مع المستخدم):
 *   1. إن رفع المستخدم headerImageUrl → يُستخدم فقط، ولا يُعرض هذا الهيدر الافتراضي.
 *   2. إن لم يُرفع headerImageUrl → يُعرض هذا الهيدر، بشرط وجود companyName.
 *   3. إن لم يُدخل companyName → لا يُعرض أي هيدر إطلاقاً (يُرجع null).
 *   4. كل عنصر فرعي (phone/email/vat/cr…) يظهر فقط إن أُدخل.
 *   5. لا توجد قيم افتراضية مولّدة — كل البيانات من settings.
 *
 * ملاحظات التنسيق:
 *   - اتجاه التدفق (RTL/LTR) يُحدّد بحسب لغة النظام (lang).
 *   - النصوص العربية تُعرض بـ dir="rtl" والإنجليزية/الأرقام بـ dir="ltr".
 *   - يُفصل بين العناصر بفاصل بصري (•) صريح بدلاً من اعتماد gap فقط.
 *
 * الاستخدام:
 *   <CompanyHeader settings={settings} lang={lang} docTitle="فاتورة ضريبية" docNo="INV-001" />
 */
export default function CompanyHeader({ settings = {}, lang = 'ar', docTitle, docNo, docSubtitle, primary: primaryOverride }) {
  const rtl = lang === 'ar';
  const primary = primaryOverride || settings.primaryColor || '#059669';
  const accent = settings.accentColor || primary;
  const dir = rtl ? 'rtl' : 'ltr';

  // القاعدة 3: لا هيدر إن لم يُدخل اسم الشركة
  const companyName = rtl
    ? settings.companyName || settings.companyNameEn || ''
    : settings.companyNameEn || settings.companyName || '';

  if (!companyName) return null;

  // بناء عناصر الاتصال — يظهر كل عنصر فقط إن وُجد
  // نحدد لكل عنصر dir مستقل: نصوص عربية → rtl، أرقام/بريد/روابط → ltr
  const contactBits = [];

  if (settings.phone) {
    contactBits.push({ icon: Phone, value: settings.phone, dir: 'ltr', label: t('هاتف', 'Tel', lang) });
  }
  if (settings.email) {
    contactBits.push({ icon: Mail, value: settings.email, dir: 'ltr', label: t('بريد', 'Email', lang) });
  }
  if (settings.website) {
    contactBits.push({ icon: Globe, value: settings.website, dir: 'ltr', label: t('موقع', 'Web', lang) });
  }
  // العنوان: المدينة + العنوان (مختصر) — نص عربي في الغالب
  const addressParts = [settings.city, settings.address].filter(Boolean);
  if (addressParts.length > 0) {
    contactBits.push({ icon: MapPin, value: addressParts.join('، '), dir: 'rtl', label: t('العنوان', 'Address', lang) });
  }
  if (settings.vatNumber) {
    contactBits.push({ icon: Receipt, value: settings.vatNumber, dir: 'ltr', label: t('الرقم الضريبي', 'VAT', lang) });
  }
  if (settings.crNumber) {
    contactBits.push({ icon: Landmark, value: settings.crNumber, dir: 'ltr', label: t('السجل التجاري', 'CR', lang) });
  }

  // تنسيق عرض العنصر: "label: value" — الترتيب يتبع اتجاه اللغة
  // في RTL: التسمية ثم النقطتين ثم القيمة (يمين ليسار)
  // في LTR: نفس الشيء لكن من يسار ليمين
  const renderBit = (bit) => {
    const Icon = bit.icon;
    const labelText = bit.label;
    const valueText = bit.value;
    return (
      <span
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          whiteSpace: 'nowrap',
        }}
      >
        <Icon size={11} style={{ color: accent, flexShrink: 0 }} />
        {/* التسمية بلغة النظام */}
        <span dir={dir} style={{ color: '#64748b' }}>{labelText}:</span>
        {/* القيمة باتجاهها الطبيعي (أرقام/بريد = ltr، عربي = rtl) */}
        <span dir={bit.dir} style={{ fontWeight: 600 }}>{valueText}</span>
      </span>
    );
  };

  return (
    <div
      dir={dir}
      style={{
        borderBottom: `3px solid ${primary}`,
        paddingBottom: 14,
        marginBottom: 16,
        direction: dir,
        textAlign: rtl ? 'right' : 'left',
      }}
    >
      {/* صف علوي: اللوغو + اسم الشركة (يمين في RTL) | عنوان المستند (يسار في RTL) */}
      <div
        dir={dir}
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: 16,
          direction: dir,
        }}
      >
        {/* اللوغو + الاسم */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {settings.logoUrl && (
            <img
              src={settings.logoUrl}
              alt="logo"
              style={{ height: 60, width: 60, objectFit: 'contain', flexShrink: 0 }}
            />
          )}
          <div>
            <div
              dir={rtl ? 'rtl' : 'ltr'}
              style={{ fontWeight: 800, fontSize: 19, color: primary, lineHeight: 1.2 }}
            >
              {companyName}
            </div>
            {rtl && settings.companyNameEn && (
              <div dir="ltr" style={{ fontSize: 11, color: '#64748b', marginTop: 2, fontWeight: 600, letterSpacing: 0.5 }}>
                {settings.companyNameEn}
              </div>
            )}
            {!rtl && settings.companyName && settings.companyNameEn !== settings.companyName && (
              <div dir="rtl" style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {settings.companyName}
              </div>
            )}
          </div>
        </div>

        {/* عنوان المستند ورقمه */}
        {(docTitle || docNo) && (
          <div style={{ textAlign: rtl ? 'left' : 'right', maxWidth: '46%' }}>
            {docTitle && (
              <div
                dir={dir}
                style={{ fontWeight: 800, fontSize: 20, color: primary, lineHeight: 1.2 }}
              >
                {docTitle}
              </div>
            )}
            {docNo && (
              <div dir="ltr" style={{ fontSize: 13, color: '#374151', fontFamily: 'monospace', marginTop: 2 }}>
                {docNo}
              </div>
            )}
            {docSubtitle && (
              <div dir={dir} style={{ fontSize: 11, color: '#64748b', marginTop: 2 }}>
                {docSubtitle}
              </div>
            )}
          </div>
        )}
      </div>

      {/* صف بيانات الاتصال — يظهر فقط إن وُجد عنصر واحد على الأقل */}
      {contactBits.length > 0 && (
        <div
          dir={dir}
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            // في RTL: row-gap يفصل الصفوف، column-gap يفصل الأعمدة
            // الفاصل البصري "•" يُضاف داخل كل عنصر ليضمن الترتيب الصحيح
            rowGap: 6,
            columnGap: 10,
            marginTop: 10,
            fontSize: 10.5,
            color: '#475569',
            lineHeight: 1.5,
            direction: dir,
          }}
        >
          {contactBits.map((bit, i) => (
            <React.Fragment key={i}>
              {i > 0 && (
                <span style={{ color: '#cbd5e1', fontWeight: 700 }}>•</span>
              )}
              {renderBit(bit)}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
