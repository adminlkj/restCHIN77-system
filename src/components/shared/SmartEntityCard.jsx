import React from 'react';
import { Card } from '@/components/ui/card';
import { UserRound } from 'lucide-react';

const accents = {
  emerald: 'from-emerald-500 to-teal-500 bg-emerald-50 text-emerald-700 border-emerald-100',
  amber: 'from-amber-500 to-orange-500 bg-amber-50 text-amber-700 border-amber-100',
  violet: 'from-violet-500 to-fuchsia-500 bg-violet-50 text-violet-700 border-violet-100',
  slate: 'from-slate-500 to-slate-700 bg-slate-50 text-slate-700 border-slate-100',
};

export default function SmartEntityCard({ title, subtitle, code, avatarUrl, initials, accent = 'slate', meta = [], badges = [], actions, Icon = UserRound }) {
  const tone = accents[accent] || accents.slate;
  return (
    <Card className={`group overflow-hidden border ${tone.split(' ').slice(3).join(' ')} bg-card hover:shadow-lg transition-all duration-200`}>
      <div className={`h-1.5 bg-gradient-to-r ${tone.split(' ').slice(0, 2).join(' ')}`} />
      <div className="p-4 space-y-4">
        <div className="flex items-start gap-3">
          <div className="size-14 rounded-2xl overflow-hidden shrink-0 shadow-sm bg-muted">
            {avatarUrl ? <img src={avatarUrl} alt={title} className="size-full object-cover" /> : (
              <div className={`size-full bg-gradient-to-br ${tone.split(' ').slice(0, 2).join(' ')} text-white flex items-center justify-center font-bold text-sm`}>
                {initials || <Icon className="size-6" />}
              </div>
            )}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              {code && <span className="text-[11px] font-mono rounded-full bg-muted px-2 py-0.5 text-muted-foreground">{code}</span>}
              {badges.map((b, i) => <span key={i} className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${b.className}`}>{b.label}</span>)}
            </div>
            <h3 className="font-bold text-foreground mt-1 truncate">{title || '—'}</h3>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>
          {actions && <div className="flex gap-1 shrink-0">{actions}</div>}
        </div>
        <div className="grid grid-cols-2 gap-2">
          {meta.filter(m => m.value).slice(0, 4).map((m, i) => (
            <div key={i} className="rounded-lg bg-muted/35 px-3 py-2 min-w-0">
              <div className="text-[11px] text-muted-foreground">{m.label}</div>
              <div className="text-xs font-medium text-foreground truncate" dir={m.dir}>{m.value}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}