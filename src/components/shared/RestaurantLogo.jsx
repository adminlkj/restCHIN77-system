import React from 'react';
import { UtensilsCrossed } from 'lucide-react';

// شعار عام لنظام إدارة المطاعم — يُستخدم في الشريط الجانبي وصفحة الدخول.
// إن لم تُمرَّ url يُعرض أيقونة مطعم (UtensilsCrossed) داخل حاوية ملوّنة.
// مصدر واحد يُستخدم في كل مكان (الشريط الجانبي، الدخول، أي رأس يظهر فيه الشعار).
export default function RestaurantLogo({ className = 'size-10', rounded = 'rounded-xl', url, tint = 'bg-amber-600' }) {
  if (url) {
    return (
      <img
        src={url}
        alt="شعار المطعم"
        className={`${className} ${rounded} object-contain bg-white`}
      />
    );
  }
  return (
    <div
      className={`${className} ${rounded} flex items-center justify-center text-white ${tint}`}
      aria-label="شعار المطعم"
    >
      <UtensilsCrossed className="size-1/2" strokeWidth={2.2} />
    </div>
  );
}
