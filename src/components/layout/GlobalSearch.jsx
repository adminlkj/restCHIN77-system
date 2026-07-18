import React, { useState, useEffect, useRef } from 'react';
import { Search, Loader2, Building2, Truck, Users, FileText, Package } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';

// Each source describes an entity, how to match, what to show, and where to go on click.
const SOURCES = [
  {
    key: 'Project', entity: 'Project', Icon: Building2, color: 'text-emerald-600',
    typeAr: 'فرع', typeEn: 'Branch',
    label: r => r.name, sub: r => r.code,
    match: (r, q) => `${r.name} ${r.code}`.toLowerCase().includes(q),
    go: (r, store) => { store.setProjectContext(r.id, r.name); store.setActiveItem('tables'); },
  },
  {
    key: 'Equipment', entity: 'Equipment', Icon: Truck, color: 'text-cyan-600',
    typeAr: 'معدة', typeEn: 'Equipment',
    label: r => r.name, sub: r => r.code,
    match: (r, q) => `${r.name} ${r.code} ${r.serialNumber || ''}`.toLowerCase().includes(q),
    go: (r, store) => store.setActiveItem('equipment'),
  },
  {
    key: 'Employee', entity: 'Employee', Icon: Users, color: 'text-violet-600',
    typeAr: 'موظف', typeEn: 'Employee',
    label: r => r.name, sub: r => r.code,
    match: (r, q) => `${r.name} ${r.code} ${r.position || ''}`.toLowerCase().includes(q),
    go: (r, store) => { store.setEmployeeContext(r.id, r.name); store.setActiveItem('employee-workspace'); },
  },
  {
    key: 'Client', entity: 'Client', Icon: Users, color: 'text-blue-600',
    typeAr: 'عميل', typeEn: 'Client',
    label: r => r.name, sub: r => r.code,
    match: (r, q) => `${r.name} ${r.code} ${r.phone || ''}`.toLowerCase().includes(q),
    go: (r, store) => store.setActiveItem('clients'),
  },
  {
    key: 'Supplier', entity: 'Supplier', Icon: Package, color: 'text-orange-600',
    typeAr: 'مورد', typeEn: 'Supplier',
    label: r => r.name, sub: r => r.code,
    match: (r, q) => `${r.name} ${r.code}`.toLowerCase().includes(q),
    go: (r, store) => store.setActiveItem('suppliers'),
  },
  {
    key: 'SalesInvoice', entity: 'SalesInvoice', Icon: FileText, color: 'text-teal-600',
    typeAr: 'فاتورة', typeEn: 'Invoice',
    label: r => r.invoiceNo, sub: r => r.clientName,
    match: (r, q) => `${r.invoiceNo} ${r.clientName || ''}`.toLowerCase().includes(q),
    go: (r, store) => store.setActiveItem('sales'),
  },
];

// ═══════════════════════════════════════════════════════════════════════
// ذاكرة مؤقتة على مستوى الوحدة — مشتركة بين كل نسخ GlobalSearch.
// سابقاً كان الـ cache في useState (يُفقد عند unmount)، فكان المستخدم
// يُعيد تحميل 6 × 300 = 1800 سجل عند كل فتح للبحث. الآن يبقى الـ cache
// ثابتاً عبر التنقّل بين الشاشات، ولا يُعاد الجلب إلا عند انتهاء الصلاحية.
// ═══════════════════════════════════════════════════════════════════════
let _moduleCache = null;
let _moduleCacheAt = 0;
let _moduleFetchPromise = null;
const SEARCH_CACHE_TTL = 5 * 60 * 1000; // 5 دقائق

export default function GlobalSearch() {
  const store = useStore();
  const { lang } = store;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [cache, setCache] = useState(null);
  const boxRef = useRef(null);

  // Close on outside click
  useEffect(() => {
    const onClick = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, []);

  // Lazy-load all searchable records once, on first focus.
  // الـ cache على مستوى الوحدة ليبقى عبر التنقّل (لا يُعاد الجلب إلا بعد 5 دقائق).
  const ensureData = async () => {
    const now = Date.now();
    if (_moduleCache && (now - _moduleCacheAt) < SEARCH_CACHE_TTL) {
      setCache(_moduleCache);
      return;
    }
    if (_moduleFetchPromise) {
      setCache(await _moduleFetchPromise);
      return;
    }
    setLoading(true);
    _moduleFetchPromise = (async () => {
      try {
        const results = await Promise.all(SOURCES.map(s => base44.entities[s.entity].list('-created_date', 300).catch(() => [])));
        const map = {};
        SOURCES.forEach((s, i) => { map[s.key] = results[i]; });
        _moduleCache = map;
        _moduleCacheAt = Date.now();
        return map;
      } finally {
        _moduleFetchPromise = null;
        setLoading(false);
      }
    })();
    setCache(await _moduleFetchPromise);
  };

  const q = query.trim().toLowerCase();
  const groups = q && cache ? SOURCES.map(s => ({
    source: s,
    rows: (cache[s.key] || []).filter(r => s.match(r, q)).slice(0, 5),
  })).filter(g => g.rows.length > 0) : [];
  const hasResults = groups.length > 0;

  const pick = (source, row) => {
    source.go(row, store);
    setOpen(false); setQuery('');
  };

  return (
    <div className="relative flex-1 max-w-md" ref={boxRef}>
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <input
          value={query}
          onFocus={() => { setOpen(true); ensureData(); }}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          placeholder={t('بحث شامل في النظام...', 'Search everything...', lang)}
          className="w-full h-9 rounded-lg border border-input bg-muted/40 ps-9 pe-3 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500"
        />
        {loading && <Loader2 className="absolute end-3 top-1/2 -translate-y-1/2 size-4 animate-spin text-muted-foreground" />}
      </div>

      {open && q && (
        <div className="absolute top-full mt-2 w-full bg-white border border-border rounded-xl shadow-lg z-50 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</div>
          ) : !hasResults ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t('لا توجد نتائج', 'No results', lang)}</div>
          ) : (
            groups.map(({ source, rows }) => (
              <div key={source.key} className="py-1">
                <div className="px-3 py-1 text-xs font-semibold text-muted-foreground">{lang === 'ar' ? source.typeAr : source.typeEn}</div>
                {rows.map(row => {
                  const Icon = source.Icon;
                  return (
                    <button key={row.id} onClick={() => pick(source, row)}
                      className="w-full flex items-center gap-3 px-3 py-2 hover:bg-muted/60 text-start transition-colors">
                      <Icon className={`size-4 shrink-0 ${source.color}`} />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{source.label(row) || '—'}</div>
                        {source.sub(row) && <div className="text-xs text-muted-foreground truncate">{source.sub(row)}</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}