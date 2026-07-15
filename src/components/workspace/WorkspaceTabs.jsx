import React from 'react';
import { useStore } from '@/lib/store';

// tabs: [{ key, ar, en, Icon }]
export default function WorkspaceTabs({ tabs, active, onChange }) {
  const { lang } = useStore();
  return (
    <div className="border-b border-border mb-5 -mx-4 md:-mx-6 px-4 md:px-6 overflow-x-auto">
      <div className="flex gap-1 min-w-max">
        {tabs.map(tab => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              onClick={() => onChange(tab.key)}
              className={`flex items-center gap-2 px-3.5 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap
                ${isActive
                  ? 'border-emerald-600 text-emerald-700'
                  : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
            >
              {tab.Icon && <tab.Icon className="size-4" />}
              {lang === 'ar' ? tab.ar : tab.en}
            </button>
          );
        })}
      </div>
    </div>
  );
}