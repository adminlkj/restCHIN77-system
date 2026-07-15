import React, { useState, useEffect } from 'react';
import { RefreshCw, Search, Inbox } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';

/**
 * قائمة تجميعية للقراءة عبر كل مقاولي الباطن.
 * props: entityName, title{ar,en}, subtitle{ar,en}, refField (رقم المرجع), columns([{header{ar,en}, cell(row, subs)}]).
 * النقر على الصف يفتح مركز عمل المقاول.
 */
export default function SubAggregateList({ entityName, title, subtitle, columns, exportColumns, searchField = 'id' }) {
  const { lang, setSubcontractorContext, setActiveItem } = useStore();
  const [rows, setRows] = useState([]);
  const [subs, setSubs] = useState({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [data, subList] = await Promise.all([
        base44.entities[entityName].list('-date', 500),
        base44.entities.Subcontractor.list('-created_date', 500),
      ]);
      setRows(data);
      setSubs(Object.fromEntries(subList.map(s => [s.id, s])));
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [entityName]);

  const filtered = rows.filter(r => {
    const name = subs[r.subcontractorId]?.name || '';
    return !search || String(r[searchField] || '').toLowerCase().includes(search.toLowerCase()) || name.toLowerCase().includes(search.toLowerCase());
  });

  const openSub = (id) => { const s = subs[id]; if (s) { setSubcontractorContext(s.id, s.name); setActiveItem('subcontractor-workspace'); } };

  const exportCols = (exportColumns || []).map((c) => ({
    header: c.header,
    value: (r) => c.value(r, subs),
  }));

  return (
    <ModuleLayout
      title={t(title.ar, title.en, lang)}
      subtitle={t(subtitle.ar, subtitle.en, lang)}
      actions={
        <div className="flex items-center gap-2">
          {exportCols.length > 0 && <TableToolbar columns={exportCols} rows={filtered} title={title} />}
          <Button variant="outline" onClick={load} className="gap-2"><RefreshCw className="size-4" />{t('تحديث', 'Refresh', lang)}</Button>
        </div>
      }
    >
      <div className="relative">
        <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث...', 'Search...', lang)} className="ps-9" />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('المقاول', 'Subcontractor', lang)}</TableHead>
                {columns.map((c, i) => <TableHead key={i} className={c.align === 'end' ? 'text-end' : ''}>{t(c.header.ar, c.header.en, lang)}</TableHead>)}
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-10 text-muted-foreground">{t('جاري التحميل...', 'Loading...', lang)}</TableCell></TableRow>
              ) : filtered.length === 0 ? (
                <TableRow><TableCell colSpan={columns.length + 1} className="text-center py-12 text-muted-foreground"><Inbox className="size-10 mx-auto mb-2 text-muted-foreground/40" />{t('لا توجد سجلات', 'No records', lang)}</TableCell></TableRow>
              ) : filtered.map(r => (
                <TableRow key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => openSub(r.subcontractorId)}>
                  <TableCell className="font-medium">{subs[r.subcontractorId]?.name || '—'}</TableCell>
                  {columns.map((c, i) => <TableCell key={i} className={c.align === 'end' ? 'text-end' : ''}>{c.cell(r)}</TableCell>)}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </ModuleLayout>
  );
}