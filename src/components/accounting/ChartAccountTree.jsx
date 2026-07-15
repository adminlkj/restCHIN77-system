import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { t } from '@/lib/utils-binaa';
import { ChevronDown, ChevronRight, FileText, Folder, Pencil, Tag, Trash2 } from 'lucide-react';

export default function ChartAccountTree({ roots, childrenMap, searchResults, expanded, onToggle, onEdit, onDelete, typeMeta, lang }) {
  if (searchResults) {
    return (
      <Card>
        <CardContent className="p-2">
          <div className="px-3 py-2 text-xs font-semibold text-muted-foreground border-b">
            {t('نتائج البحث', 'Search Results', lang)} ({searchResults.length})
          </div>
          {searchResults.length === 0 ? (
            <Empty label={t('لا توجد نتائج مطابقة', 'No matching results', lang)} />
          ) : searchResults.map(acc => (
            <AccountRow key={acc.id} acc={acc} depth={0} hasChildren={false} expanded={false} searchMode onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} typeMeta={typeMeta} lang={lang} />
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {roots.map(root => {
        const meta = typeMeta[root.accountType] || typeMeta.ASSET;
        return (
          <Card key={root.id} className={`overflow-hidden border-t-4 ${meta.borderTop}`}>
            <div className="px-4 py-3 bg-muted/20 border-b flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className={`size-10 rounded-xl flex items-center justify-center border ${meta.color}`}>
                  <Folder className="size-5" />
                </div>
                <div className="min-w-0">
                  <p className="font-bold truncate">{root.code} — {lang === 'ar' ? root.name : (root.nameEn || root.name)}</p>
                  <p className="text-xs text-muted-foreground">{lang === 'ar' ? meta.ar : meta.en} • {t('مستوى رئيسي', 'Main level', lang)}</p>
                </div>
              </div>
              <button onClick={() => onToggle(root.code)} className="rounded-lg border bg-white px-3 py-1.5 text-xs font-medium hover:bg-muted">
                {expanded.has(root.code) ? t('طي', 'Collapse', lang) : t('توسيع', 'Expand', lang)}
              </button>
            </div>
            <CardContent className="p-2">
              <AccountBranch acc={root} depth={0} childrenMap={childrenMap} expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} typeMeta={typeMeta} lang={lang} skipSelf />
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function AccountBranch({ acc, depth, childrenMap, expanded, onToggle, onEdit, onDelete, typeMeta, lang, skipSelf = false }) {
  const kids = childrenMap[acc.code] || [];
  const isOpen = expanded.has(acc.code);
  return (
    <>
      {!skipSelf && <AccountRow acc={acc} depth={depth} hasChildren={kids.length > 0} expanded={isOpen} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} typeMeta={typeMeta} lang={lang} />}
      {(skipSelf || isOpen) && kids.map(child => (
        <AccountBranch key={child.id} acc={child} depth={skipSelf ? 0 : depth + 1} childrenMap={childrenMap} expanded={expanded} onToggle={onToggle} onEdit={onEdit} onDelete={onDelete} typeMeta={typeMeta} lang={lang} />
      ))}
    </>
  );
}

function AccountRow({ acc, depth, hasChildren, expanded, searchMode, onToggle, onEdit, onDelete, typeMeta, lang }) {
  const meta = typeMeta[acc.accountType] || typeMeta.ASSET;
  const postable = acc.isPostable !== false;
  return (
    <div className="group relative flex items-center gap-2 rounded-xl px-3 py-2.5 hover:bg-muted/50 transition-colors" style={{ paddingInlineStart: `${depth * 26 + 12}px` }}>
      {hasChildren ? (
        <button onClick={() => onToggle(acc.code)} className="size-7 rounded-lg border bg-white flex items-center justify-center text-muted-foreground hover:text-foreground shrink-0">
          {expanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
        </button>
      ) : <div className="size-7 flex items-center justify-center shrink-0"><FileText className="size-4 text-muted-foreground/60" /></div>}
      <div className={`w-24 rounded-lg px-2 py-1 text-center font-mono text-xs font-semibold border ${meta.color}`}>{acc.code}</div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 min-w-0">
          <p className={`${postable ? 'font-semibold' : 'font-bold'} truncate`}>{lang === 'ar' ? acc.name : (acc.nameEn || acc.name)}</p>
          {!postable && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600 shrink-0">{t('تجميعي', 'Group', lang)}</span>}
          {postable && <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] text-emerald-700 shrink-0">{t('نهائي', 'Leaf', lang)}</span>}
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <span>{acc.nature === 'DEBIT' ? t('طبيعته مدينة', 'Debit nature', lang) : t('طبيعته دائنة', 'Credit nature', lang)}</span>
          {searchMode && acc.parentCode && <span>{t('تابع للحساب', 'Parent', lang)}: {acc.parentCode}</span>}
          {acc.semanticRole && <span className="inline-flex items-center gap-1 font-mono text-teal-700"><Tag className="size-3" />{acc.semanticRole}</span>}
        </div>
      </div>
      <span className={`hidden md:inline-flex rounded-full border px-2.5 py-1 text-xs font-medium shrink-0 ${meta.color}`}>{lang === 'ar' ? meta.ar : meta.en}</span>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button onClick={() => onEdit(acc)} className="size-8 flex items-center justify-center rounded-lg hover:bg-white text-muted-foreground"><Pencil className="size-4" /></button>
        <button onClick={() => onDelete(acc)} className="size-8 flex items-center justify-center rounded-lg hover:bg-rose-50 text-rose-500"><Trash2 className="size-4" /></button>
      </div>
    </div>
  );
}

function Empty({ label }) {
  return <div className="py-12 text-center text-sm text-muted-foreground">{label}</div>;
}