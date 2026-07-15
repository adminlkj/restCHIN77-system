import React from 'react';
import { Building2, Truck, User, Landmark, Briefcase, Home } from 'lucide-react';
import { EXPENSE_TYPES } from '@/lib/utils-binaa';

const ICONS = { Building2, Truck, User, Landmark, Briefcase, Home };

/**
 * الخطوة الأولى في محرك المصروفات — اختيار نوع المصروف كبطاقات.
 * عند الاختيار يتغير النموذج تلقائياً حسب النوع.
 */
export default function ExpenseTypePicker({ lang, value, onSelect }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {EXPENSE_TYPES.map(type => {
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