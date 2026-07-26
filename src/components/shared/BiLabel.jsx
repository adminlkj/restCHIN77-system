import React from 'react';
import { useStore } from '@/lib/store';

// ═══════════════════════════════════════════════════════════════════════
// تسمية ثنائية اللغة — تعرض العربية والإنجليزية معاً دائماً، لكن الأولوية
// (السطر الأساسي الأوضح في الأعلى) تتبع لغة النظام الحالية:
//   - عند العربية: العربية بالأعلى (أوضح) والإنجليزية أصغر تحتها.
//   - عند الإنجليزية: الإنجليزية بالأعلى (أوضح) والعربية أصغر تحتها.
// align: 'start' | 'end' | 'center' — محاذاة النص (افتراضي start).
// ═══════════════════════════════════════════════════════════════════════
export default function BiLabel({ ar, en, align = 'start', bold = false, size = 10 }) {
  const { lang } = useStore();
  const textAlign = align === 'end' ? 'right' : align === 'center' ? 'center' : 'left';

  // اللغة النشطة = السطر الأساسي بالأعلى؛ الأخرى = السطر الثانوي بالأسفل.
  const isAr = lang === 'ar';
  const primary = isAr ? ar : en;
  const secondary = isAr ? en : ar;
  const primaryDir = isAr ? 'rtl' : 'ltr';
  const secondaryDir = isAr ? 'ltr' : 'rtl';

  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', lineHeight: 1.15, textAlign }}>
      {/* وزن الخط الأساسي: يأتي من إعدادات الإيصال الحراري عبر CSS variable،
          أو 700 كقيمة احتياطية. bold يجعله أغمق (800). */}
      <span dir={primaryDir} style={{
        fontSize: size,
        fontWeight: bold ? 800 : 'var(--receipt-font-weight, 700)',
      }}>{primary}</span>
      {/* السطر الثانوي: وزنه ولونه يتبعان وضع توفير الحبر من الإعدادات. */}
      <span dir={secondaryDir} style={{
        fontSize: Math.max(size - 2, 7),
        color: 'var(--receipt-secondary-color, #000)',
        fontWeight: 'var(--receipt-secondary-weight, 600)',
      }}>{secondary}</span>
    </span>
  );
}