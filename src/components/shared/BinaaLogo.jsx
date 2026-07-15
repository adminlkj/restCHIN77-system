import React from 'react';

// الشعار الرسمي المعتمد لنظام بِنَاء — مصدر واحد يُستخدم في كل مكان
// (الشريط الجانبي، صفحة الدخول، أي رأس يظهر فيه شعار النظام).
export const BINAA_LOGO_URL =
  'https://media.base44.com/images/public/6a44ed8818188b4da27cc800/83daa84db_Gemini_Generated_Image_rwzsp3rwzsp3rwzs.png';

export default function BinaaLogo({ className = 'size-10', rounded = 'rounded-xl' }) {
  return (
    <img
      src={BINAA_LOGO_URL}
      alt="شعار نظام بِنَاء"
      className={`${className} ${rounded} object-contain bg-white`}
    />
  );
}