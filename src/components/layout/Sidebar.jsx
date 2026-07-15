import React from 'react';
import { LayoutDashboard, Globe, X, UtensilsCrossed } from 'lucide-react';
import { useStore } from '@/lib/store';
import { canAccess } from '@/lib/permissions';
import { CYCLES, cycleForTab } from '@/lib/cycles';
import RestaurantLogo from '@/components/shared/RestaurantLogo';
import { useCompanySettings } from '@/hooks/useCompanySettings';

// Sidebar philosophy: Workspace-first. Each entry is a full cycle that opens a
// unified screen with top tabs. No nested dropdowns — cycle names only.

export default function Sidebar({ onClose, currentUser, userLoaded = true }) {
  const { lang, toggleLang, activeItem, setActiveItem } = useStore();
  const { settings } = useCompanySettings();
  // اسم المطعم من الإعدادات، أو قيمة افتراضية عامة إن لم يُدخل.
  const brandName = (lang === 'ar'
    ? (settings.companyName || 'نظام المطاعم')
    : (settings.companyNameEn || 'Restaurant POS'));

  // A cycle is visible if the user can access at least one of its tabs.
  const visibleCycles = CYCLES
    .map(c => ({
      ...c,
      accessible: !userLoaded || c.tabs.some(t => canAccess(currentUser, t.key)),
    }))
    .filter(c => c.accessible);

  // The active cycle is the one owning the current activeItem (a cycle key or a tab key).
  const activeCycleKey =
    CYCLES.find(c => c.key === activeItem)?.key ||
    cycleForTab(activeItem)?.key ||
    null;

  const handleCycle = (cycleKey) => {
    setActiveItem(cycleKey);
    onClose?.();
  };

  return (
    <div className="flex flex-col h-full bg-white border-e border-border w-72 overflow-y-auto">

      {/* Brand Header */}
      <div className="flex items-center gap-3 px-4 py-5 border-b border-border">
        <RestaurantLogo className="size-10" url={settings.logoUrl} />
        <div>
          <div className="font-bold text-lg text-foreground leading-tight">{brandName}</div>
          <div className="text-xs text-muted-foreground">{lang === 'ar' ? 'نظام إدارة المطاعم' : 'Restaurant Management'}</div>
        </div>
        {onClose && (
          <button onClick={onClose} className="ms-auto size-8 flex items-center justify-center rounded-lg hover:bg-muted text-muted-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      {/* Dashboard */}
      <div className="px-3 pt-3 space-y-1">
        <button
          onClick={() => { setActiveItem('dashboard'); onClose?.(); }}
          className={`flex items-center w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors gap-2.5
            ${activeItem === 'dashboard' ? 'bg-primary text-primary-foreground' : 'text-foreground hover:bg-muted'}`}
        >
          <LayoutDashboard className="size-4 shrink-0" />
          <span className="flex-1 text-start">{lang === 'ar' ? 'لوحة المبيعات' : 'Sales Dashboard'}</span>
        </button>

        {/* نقطة البيع — الدخول إلى فروع المطعم */}
        <button
          onClick={() => { setActiveItem('branches'); onClose?.(); }}
          className={`flex items-center w-full rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors gap-2.5
            ${['branches', 'tables', 'pos'].includes(activeItem) ? 'bg-amber-500 text-white' : 'text-foreground hover:bg-muted'}`}
        >
          <UtensilsCrossed className="size-4 shrink-0" />
          <span className="flex-1 text-start">{lang === 'ar' ? 'نقطة البيع' : 'Point of Sale'}</span>
        </button>
      </div>

      {/* Cycles — names only */}
      <nav className="flex-1 px-3 py-3 space-y-1">
        {visibleCycles.map(cycle => {
          const isActive = cycle.key === activeCycleKey;
          const color = cycle.color;
          return (
            <button
              key={cycle.key}
              onClick={() => handleCycle(cycle.key)}
              className={`flex items-center w-full rounded-lg px-3 py-3 text-sm font-semibold transition-all gap-3
                ${isActive
                  ? `${color.light} ${color.text} border-s-2 ${color.border}`
                  : 'text-foreground hover:bg-muted border-s-2 border-transparent'
                }`}
            >
              <cycle.Icon className={`size-5 shrink-0 ${isActive ? color.text : 'text-muted-foreground'}`} />
              <span className="flex-1 text-start">{lang === 'ar' ? cycle.label.ar : cycle.label.en}</span>
            </button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="px-3 py-3 border-t border-border">
        <button
          onClick={toggleLang}
          className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:bg-muted transition-colors"
        >
          <Globe className="size-4" />
          {lang === 'ar' ? 'English' : 'العربية'}
        </button>
      </div>
    </div>
  );
}