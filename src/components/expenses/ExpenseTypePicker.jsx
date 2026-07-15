import React from 'react';
import { Building2, Truck, User, Landmark, Briefcase, Home } from 'lucide-react';
import { EXPENSE_TYPES } from '@/lib/utils-binaa';

const ICONS = { Building2, Truck, User, Landmark, Briefcase, Home };

/**
 * الخطوة الأولى في محرك المصروفات — اختيار نوع المصروف كبطاقات.
 * عند الاختيار يتغير النموذج تلقائياً حسب النوع.
 *
 * يقبل prop اختياري `types` لتقليص الخيارات المعروضة (يُستخدم لحجب
 * أنواع البناء مثل PROJECT/EQUIPMENT عن واجهة المطعم). إن لم يُمرَّر
 * يُعرض كامل EXPENSE_TYPES للحفاظ على التوافق مع أي مستدعٍ آخر.
 */
export default function ExpenseTypePicker({ lang, value, onSelect, types = EXPENSE_TYPES }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {types.map(type => {
        const Icon = ICONS[type.icon] || Home;
        const active = value === type.key;
        return (
          <button
            key={type.key}
            type="button"
            onClick={() => onSelect(type.key)}
            className={`flex flex-col items-center gap-2 rounded-xl border p-4 text-center transition-all ${
              active
                ? `${type.color} ring-2 ring-offset-1 ring-current shadow-sm`
                : 'border-border bg-card hover:bg-muted/40'
            }`}
          >
            <span className={`flex size-10 items-center justify-center rounded-lg ${active ? 'bg-white/60' : 'bg-muted'}`}>
              <Icon className="size-5" />
            </span>
            <span className="text-sm font-medium leading-tight">{lang === 'ar' ? type.ar : type.en}</span>
          </button>
        );
      })}
    </div>
  );
}