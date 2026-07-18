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
      <span dir={primaryDir} style={{ fontSize: size, fontWeight: bold ? 700 : 'inherit' }}>{primary}</span>
      <span dir={secondaryDir} style={{ fontSize: Math.max(size - 2, 7), color: '#777', fontWeight: 400 }}>{secondary}</span>
    </span>
  );
}