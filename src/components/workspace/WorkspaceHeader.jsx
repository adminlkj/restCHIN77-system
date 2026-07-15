import React from 'react';
import { ArrowRight, ArrowLeft } from 'lucide-react';
import { useStore } from '@/lib/store';

export default function WorkspaceHeader({ title, subtitle, badge, onBack, actions }) {
  const { lang } = useStore();
  const BackIcon = lang === 'ar' ? ArrowRight : ArrowLeft;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
      {onBack && (
        <button
          onClick={onBack}
          className="size-9 shrink-0 flex items-center justify-center rounded-lg border border-border hover:bg-muted text-muted-foreground transition-colors"
          title={lang === 'ar' ? 'رجوع' : 'Back'}
        >
          <BackIcon className="size-4" />
        </button>
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <h1 className="text-xl font-bold text-foreground truncate">{title}</h1>
          {badge}
        </div>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}