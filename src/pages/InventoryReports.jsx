import React, { useEffect, useMemo, useState } from 'react';
import { Search, RefreshCw, AlertTriangle, Warehouse } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, formatDate } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

export default function InventoryReports() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [movements, setMovements] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [it, mv, wh] = await Promise.all([
        base44.entities.InventoryItem.list('code', 2000),
        base44.entities.StockMovement.list('-date', 2000),
        base44.entities.Warehouse.list('code', 1000),
      ]);
      setItems(it || []);
      setMovements(mv || []);
      setWarehouses(wh || []);
    } catch (err) {
      toast.error(err?.message || t('فشل تحميل البيانات', 'Failed to load data', lang));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const rows = useMemo(() => items.map(item => {
    // كل سجل صنف يخصّ مخزناً واحداً (نفس الكود موزّع على عدة مخازن = عدة سجلات).
    // لذا يجب تقييد الحركات بمخزن هذا السجل تحديداً: الوارد لمخزن الوجهة،
    // والصادر من مخزن المصدر — وإلا تُحتسب حركات كل المخازن لكل سجل (ازدواج).
    const codeMatch = (m) => m.itemId === item.id || (item.code && m.itemCode === item.code);
    const incoming = movements
      .filter(m => codeMatch(m) && ['RECEIVE', 'ADJUST_INCREASE'].includes(m.type) && (!item.warehouseId || m.toWarehouseId === item.warehouseId))
      .reduce((s, m) => s + (Number(m.quantity) || 0), 0);
    const outgoing = movements
      .filter(m => codeMatch(m) && ['ISSUE', 'DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_DECREASE'].includes(m.type) && (!item.warehouseId || m.fromWarehouseId === item.warehouseId))
      .reduce((s, m) => s + (Number(m.quantity) || 0), 0);
    const itemMoves = movements.filter(m => codeMatch(m) && (!item.warehouseId || m.toWarehouseId === item.warehouseId || m.fromWarehouseId === item.warehouseId));
    const lastMove = itemMoves.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))[0];
    const qty = Number(item.quantity) || 0;
    return { ...item, incoming, outgoing, value: qty * (Number(item.unitCost) || 0), lastMoveDate: lastMove?.date };
  }), [items, movements]);

  const filtered = rows.filter(r => !search || `${r.code} ${r.name} ${r.warehouseName}`.toLowerCase().includes(search.toLowerCase()));
  const totalValue = filtered.reduce((s, r) => s + r.value, 0);
  const lowStock = filtered.filter(r => Number(r.reorderLevel) > 0 && Number(r.quantity) <= Number(r.reorderLevel));
  const activeWarehouses = warehouses.filter(w => w.isActive !== false).length;
  const columns = [
    { header: { ar: 'الكود', en: 'Code' }, value: r => r.code },
    { header: { ar: 'الصنف', en: 'Item' }, value: r => r.name },
    { header: { ar: 'المخزن', en: 'Warehouse' }, value: r => r.warehouseName },
    { header: { ar: 'الرصيد', en: 'Balance' }, value: r => r.quantity || 0 },
    { header: { ar: 'الوارد', en: 'Incoming' }, value: r => r.incoming },
    { header: { ar: 'الصادر', en: 'Outgoing' }, value: r => r.outgoing },
    { header: { ar: 'القيمة', en: 'Value' }, value: r => r.value },
  ];

  return (
    <ModuleLayout title={t('تقارير المخازن', 'Inventory Reports', lang)} subtitle={t('أرصدة وقيم وحركة الأصناف حسب بيانات المخزون', 'Stock balances, valuation and movement summary', lang)} actions={<TableToolbar columns={columns} rows={filtered} title={{ ar: 'تقارير المخازن', en: 'Inventory Reports' }} />}>
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
        <Stat label={t('قيمة المخزون', 'Inventory Value', lang)} value={formatCurrency(totalValue, lang)} />
        <Stat label={t('عدد الأصناف', 'Items', lang)} value={filtered.length} />
        <Stat label={t('أصناف تحت حد الطلب', 'Below Reorder', lang)} value={lowStock.length} danger />
        <Stat label={t('المخازن النشطة', 'Active Warehouses', lang)} value={activeWarehouses} />
      </div>
      <div className="flex gap-3">
        <div className="relative flex-1"><Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" /><Input className="ps-9" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالصنف أو المخزن...', 'Search item or warehouse...', lang)} /></div>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>
      <Card><CardContent className="p-0 overflow-x-auto"><Table><TableHeader><TableRow><TableHead>{t('الصنف', 'Item', lang)}</TableHead><TableHead>{t('المخزن', 'Warehouse', lang)}</TableHead><TableHead className="text-center">{t('الرصيد', 'Balance', lang)}</TableHead><TableHead className="text-center">{t('الوارد', 'Incoming', lang)}</TableHead><TableHead className="text-center">{t('الصادر', 'Outgoing', lang)}</TableHead><TableHead className="text-end">{t('القيمة', 'Value', lang)}</TableHead><TableHead>{t('آخر حركة', 'Last Move', lang)}</TableHead></TableRow></TableHeader><TableBody>
        {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 7 }).map((__, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>) : filtered.length === 0 ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">{t('لا توجد بيانات مخزون', 'No inventory data', lang)}</TableCell></TableRow> : filtered.map(r => <TableRow key={r.id}><TableCell><div className="font-medium">{r.name}</div><div className="text-xs text-muted-foreground font-mono">{r.code}</div></TableCell><TableCell><span className="inline-flex items-center gap-1 text-sm"><Warehouse className="size-3.5 text-muted-foreground" />{r.warehouseName || '—'}</span></TableCell><TableCell className="text-center font-semibold">{r.quantity || 0} {r.unit || ''}{Number(r.reorderLevel) > 0 && Number(r.quantity) <= Number(r.reorderLevel) && <AlertTriangle className="inline ms-1 size-4 text-rose-500" />}</TableCell><TableCell className="text-center text-emerald-700">{r.incoming}</TableCell><TableCell className="text-center text-rose-700">{r.outgoing}</TableCell><TableCell className="text-end font-medium">{formatCurrency(r.value, lang)}</TableCell><TableCell className="text-sm text-muted-foreground">{formatDate(r.lastMoveDate, lang)}</TableCell></TableRow>)}
      </TableBody></Table></CardContent></Card>
    </ModuleLayout>
  );
}

function Stat({ label, value, danger }) {
  return <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className={`text-xl font-bold mt-1 ${danger ? 'text-rose-700' : 'text-slate-800'}`}>{value}</p></CardContent></Card>;
}