import React from 'react';
import { Check } from 'lucide-react';
import { MODULES, ACTIONS, ACTION_KEYS, VIEW_ONLY_MODULES } from '@/lib/permissions';

const GROUP_LABELS = {
  projects: { ar: 'نقطة البيع والمبيعات', en: 'POS & Sales' },
  rental: { ar: 'معدات المطعم', en: 'Restaurant Equipment' },
  costs: { ar: 'المشتريات والمصروفات', en: 'Procurement & Costs' },
  hr: { ar: 'الموارد البشرية', en: 'HR' },
  accounting: { ar: 'المالية والمحاسبة', en: 'Finance & Accounting' },
  settings: { ar: 'الإعدادات والبيانات', en: 'Settings & Master Data' },
};

// A grid where each visible module is a row: a "view" toggle (screen access)
// plus per-action checkboxes (create / edit / delete) that only apply when the
// screen is visible.
//
// Props:
//   lang
//   disabled            — whole matrix is read-only (e.g. OWNER / not custom)
//   visibleModules      — string[] of module keys the user can see
//   moduleActions       — { [moduleKey]: string[] } granted in-screen actions
//   onToggleModule(key) — toggle screen visibility
//   onToggleAction(key, action) — toggle a single in-screen action
export default function PermissionMatrix({
  lang, disabled, visibleModules, moduleActions, onToggleModule, onToggleAction,
}) {
  const grouped = MODULES.reduce((acc, m) => {
    (acc[m.group] = acc[m.group] || []).push(m);
    return acc;
  }, {});

  const isVisible = (k) => visibleModules.includes(k);
  const hasAction = (k, a) => (moduleActions[k] || ACTION_KEYS).includes(a);

  return (
    <div className="space-y-4">
      {Object.entries(grouped).map(([group, mods]) => (
        <div key={group}>
          <div className="flex items-center gap-2 mb-2">
            <p className="text-xs font-bold text-foreground">{lang === 'ar' ? GROUP_LABELS[group]?.ar : GROUP_LABELS[group]?.en}</p>
            <div className="flex-1 h-px bg-border" />
          </div>

          {/* column headers */}
          <div className="hidden sm:grid grid-cols-[1fr_auto] gap-2 items-center px-2 mb-1">
            <span />
            <div className="grid grid-cols-4 gap-1 w-[220px] text-center">
              <span className="text-[10px] font-semibold text-muted-foreground">{lang === 'ar' ? 'عرض' : 'View'}</span>
              {ACTIONS.map(a => (
                <span key={a.key} className="text-[10px] font-semibold text-muted-foreground">{lang === 'ar' ? a.ar : a.en}</span>
              ))}
            </div>
          </div>

          <div className="space-y-1">
            {mods.map(m => {
              const visible = isVisible(m.key);
              const viewOnly = VIEW_ONLY_MODULES.has(m.key);
              return (
                <div
                  key={m.key}
                  className={`grid grid-cols-[1fr_auto] gap-2 items-center rounded-lg border px-2.5 py-1.5 transition-colors
                    ${visible ? 'bg-emerald-50/40 border-emerald-200' : 'bg-muted/30 border-transparent'}`}
                >
                  <span className={`text-xs font-medium truncate ${visible ? 'text-foreground' : 'text-muted-foreground'}`}>
                    {lang === 'ar' ? m.ar : m.en}
                  </span>

                  <div className="grid grid-cols-4 gap-1 w-[220px]">
                    {/* View toggle = screen visibility */}
                    <PermCell
                      active={visible}
                      disabled={disabled}
                      tone="view"
                      onClick={() => onToggleModule(m.key)}
                    />
                    {/* Action cells */}
                    {ACTION_KEYS.map(action => (
                      <PermCell
                        key={action}
                        active={visible && !viewOnly && hasAction(m.key, action)}
                        disabled={disabled || !visible || viewOnly}
                        tone="action"
                        onClick={() => onToggleAction(m.key, action)}
                      />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PermCell({ active, disabled, tone, onClick }) {
  const base = 'h-7 rounded-md border flex items-center justify-center transition-colors';
  const state = active
    ? (tone === 'view' ? 'bg-emerald-600 border-emerald-600 text-white' : 'bg-emerald-500/90 border-emerald-500 text-white')
    : 'bg-white border-border text-transparent';
  const interactivity = disabled ? 'cursor-not-allowed opacity-50' : 'hover:border-emerald-400';
  return (
    <button type="button" disabled={disabled} onClick={onClick} className={`${base} ${state} ${interactivity}`}>
      <Check className="size-3.5" />
    </button>
  );
}