import React from 'react';
import { FolderOpen, X, Building2, User } from 'lucide-react';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';

/**
 * ContextBar — شريط السياق العالمي
 * يظهر في AppShell عندما يكون هناك مشروع أو عميل نشط.
 * المستخدم يرى دائماً أين هو، وبإمكانه مسح السياق بنقرة واحدة.
 */
export default function ContextBar() {
  const { lang, activeProjectId, activeProjectName, activeClientId, activeClientName, clearContext, setActiveItem } = useStore();

  if (!activeProjectId && !activeClientId) return null;

  return (
    <div className="shrink-0 border-b border-emerald-200 bg-emerald-50 px-4 py-1.5 flex items-center gap-3">
      <div className="flex items-center gap-2 flex-1 min-w-0">
        <div className="size-5 rounded bg-emerald-600 flex items-center justify-center shrink-0">
          <FolderOpen className="size-3 text-white" />
        </div>
        <span className="text-xs text-emerald-700 font-medium shrink-0">
          {t('السياق النشط:', 'Active Context:', lang)}
        </span>
        {activeProjectName && (
          <button
            onClick={() => setActiveItem('projects')}
            className="flex items-center gap-1 text-xs text-emerald-800 font-semibold hover:underline truncate"
          >
            <Building2 className="size-3 shrink-0" />
            {activeProjectName}
          </button>
        )}
        {activeProjectName && activeClientName && (
          <span className="text-emerald-400 shrink-0">·</span>
        )}
        {activeClientName && (
          <button
            onClick={() => setActiveItem('clients')}
            className="flex items-center gap-1 text-xs text-emerald-700 hover:underline truncate"
          >
            <User className="size-3 shrink-0" />
            {activeClientName}
          </button>
        )}
      </div>

      {/* Quick nav */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {[
          { key: 'sales', ar: 'فواتير', en: 'Invoices' },
          { key: 'expenses', ar: 'مصروفات', en: 'Expenses' },
          { key: 'purchase-orders', ar: 'مشتريات', en: 'Purchases' },
        ].map(item => (
          <button
            key={item.key}
            onClick={() => setActiveItem(item.key)}
            className="text-[10px] px-2 py-0.5 rounded bg-emerald-100 text-emerald-700 hover:bg-emerald-200 font-medium transition-colors"
          >
            {lang === 'ar' ? item.ar : item.en}
          </button>
        ))}
      </div>

      {/* Clear */}
      <button
        onClick={clearContext}
        className="size-5 rounded flex items-center justify-center text-emerald-500 hover:text-emerald-800 hover:bg-emerald-200 transition-colors shrink-0"
        title={t('مسح السياق', 'Clear context', lang)}
      >
        <X className="size-3" />
      </button>
    </div>
  );
}