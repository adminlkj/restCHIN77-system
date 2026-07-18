import React, { useState, useEffect, useMemo } from 'react';
import { Search, RefreshCw, ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, CheckCircle2, Flame, ShieldAlert, ClipboardCheck } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useBranches } from '@/hooks/useBranches';
import { useSuppliers } from '@/hooks/useParties';
import { useAccounts } from '@/hooks/useAccounts';
import { t, formatCurrency, genCode } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import TableToolbar from '@/components/shared/TableToolbar';
import { OperationEngine } from '@/lib/businessEngine';
import { toast } from 'sonner';

const TYPES = {
  RECEIVE:  { ar: 'استلام', en: 'Receive', color: 'bg-emerald-100 text-emerald-700', Icon: ArrowDownToLine },
  ISSUE:    { ar: 'صرف', en: 'Issue', color: 'bg-rose-100 text-rose-700', Icon: ArrowUpFromLine },
  TRANSFER: { ar: 'تحويل', en: 'Transfer', color: 'bg-blue-100 text-blue-700', Icon: ArrowLeftRight },
  DAMAGE_NORMAL:   { ar: 'تلف طبيعي', en: 'Normal Damage', color: 'bg-amber-100 text-amber-700', Icon: Flame },
  DAMAGE_ABNORMAL: { ar: 'تلف غير طبيعي', en: 'Abnormal Damage', color: 'bg-orange-100 text-orange-700', Icon: ShieldAlert },
  ADJUST_INCREASE: { ar: 'جرد بالزيادة', en: 'Count Surplus', color: 'bg-teal-100 text-teal-700', Icon: ClipboardCheck },
  ADJUST_DECREASE: { ar: 'جرد بالعجز', en: 'Count Shortage', color: 'bg-red-100 text-red-700', Icon: ClipboardCheck },
};
const SOURCES = {
  SUPPLIER: { ar: 'ذمة مورد', en: 'Supplier (credit)' },
  CASH:     { ar: 'شراء نقدي', en: 'Cash purchase' },
  OPENING:  { ar: 'رصيد افتتاحي', en: 'Opening balance' },
};

const empty = {
  type: 'RECEIVE', date: new Date().toISOString().slice(0, 10), itemId: '', quantity: '', unitCost: '',
  fromWarehouseId: '', toWarehouseId: '', projectId: '', sourceType: 'SUPPLIER', supplierId: '',
  cashAccountCode: '', responsibleId: '', reason: '', reference: '', notes: '',
};

// أنواع تستخدم مخزن المصدر (صرف/تلف/عجز/تحويل) ومخزن الوجهة (استلام/زيادة/تحويل).
const USES_FROM = ['ISSUE', 'TRANSFER', 'DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_DECREASE'];
const USES_TO = ['RECEIVE', 'TRANSFER', 'ADJUST_INCREASE'];

export default function StockMovements() {
  const { lang } = useStore();
  const [movements, setMovements] = useState([]);
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  // الفروع والموردون والدليل المحاسبي من cache مشترك بدلاً من جلبها مستقلة عند كل mount.
  const { branches: projects } = useBranches();
  const { suppliers } = useSuppliers();
  const { accounts } = useAccounts();
  const [employees, setEmployees] = useState([]);
  const cashAccounts = useMemo(
    () => (accounts || []).filter(a => ['CASH', 'BANK', 'CUSTODY'].includes(a.semanticRole)),
    [accounts]
  );
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      // الفروع والموردون والدليل من cache مشترك — لا تُجلب هنا.
      const [mv, it, wh, emp] = await Promise.all([
        base44.entities.StockMovement.list('-date', 500),
        base44.entities.InventoryItem.list('code', 1000),
        base44.entities.Warehouse.filter({ isActive: true }, 'code', 500),
        base44.entities.Employee.list('name', 500),
      ]);
      setMovements(mv || []);
      // أصناف فريدة بالكود لاختيارها (الرصيد موزّع على المخازن).
      const seen = new Set();
      setItems((it || []).filter(i => { if (seen.has(i.code)) return false; seen.add(i.code); return true; }));
      setWarehouses(wh || []);
      setEmployees(emp || []);
    } catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const openNew = (type) => {
    setForm({ ...empty, type, movementNo: genCode('STK', movements.length + 1) });
    setDialogOpen(true);
  };

  const selectedItem = items.find(i => i.id === form.itemId);
  const totalCost = (Number(form.quantity) || 0) * (Number(form.unitCost) || 0);

  const filtered = movements.filter(m => {
    const match = !search || m.itemName?.toLowerCase().includes(search.toLowerCase()) || m.movementNo?.toLowerCase().includes(search.toLowerCase());
    return match && (filterType === 'ALL' || m.type === filterType);
  });

  const save = async () => {
    if (!form.itemId) return toast.error(t('اختر الصنف', 'Select item', lang));
    if (!(Number(form.quantity) > 0)) return toast.error(t('الكمية يجب أن تكون أكبر من صفر', 'Quantity must be > 0', lang));
    if (USES_TO.includes(form.type) && !form.toWarehouseId) return toast.error(t('اختر مخزن الوجهة', 'Select destination warehouse', lang));
    if (USES_FROM.includes(form.type) && !form.fromWarehouseId) return toast.error(t('اختر مخزن المصدر', 'Select source warehouse', lang));
    if (form.type === 'DAMAGE_ABNORMAL' && !form.responsibleId) return toast.error(t('اختر المسؤول المُحمّل عليه التلف', 'Select the responsible person', lang));

    setSaving(true);
    try {
      const cashAcc = cashAccounts.find(a => a.code === form.cashAccountCode);
      await OperationEngine.createStockMovement(
        {
          movementNo: form.movementNo || genCode('STK', movements.length + 1),
          date: form.date, type: form.type, itemId: form.itemId,
          quantity: Number(form.quantity), unitCost: Number(form.unitCost) || 0,
          fromWarehouseId: USES_FROM.includes(form.type) ? form.fromWarehouseId : '',
          toWarehouseId: USES_TO.includes(form.type) ? form.toWarehouseId : '',
          projectId: form.projectId,
          sourceType: form.type === 'RECEIVE' ? form.sourceType : 'NONE',
          supplierId: form.type === 'RECEIVE' && form.sourceType === 'SUPPLIER' ? form.supplierId : '',
          cashAccountCode: form.type === 'RECEIVE' && form.sourceType === 'CASH' ? form.cashAccountCode : '',
          cashAccountName: cashAcc?.name || '',
          responsibleId: form.type === 'DAMAGE_ABNORMAL' ? form.responsibleId : '',
          reason: form.reason,
          reference: form.reference, notes: form.notes,
        },
        { items, warehouses, projects, suppliers, employees }
      );
      toast.success(t('تم تسجيل الحركة وترحيلها محاسبياً', 'Movement recorded and posted', lang));
      setDialogOpen(false); load();
    } catch (e) { toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const stats = useMemo(() => ({
    receive: movements.filter(m => m.type === 'RECEIVE').reduce((s, m) => s + (m.totalCost || 0), 0),
    issue: movements.filter(m => m.type === 'ISSUE').reduce((s, m) => s + (m.totalCost || 0), 0),
    transfer: movements.filter(m => m.type === 'TRANSFER').length,
  }), [movements]);

  const exportColumns = [
    { header: { ar: 'التاريخ', en: 'Date' }, value: (r) => r.date },
    { header: { ar: 'رقم الحركة', en: 'Movement No' }, value: (r) => r.movementNo },
    { header: { ar: 'النوع', en: 'Type' }, value: (r) => { const ty = TYPES[r.type]; return ty ? (lang === 'ar' ? ty.ar : ty.en) : r.type; } },
    { header: { ar: 'الصنف', en: 'Item' }, value: (r) => r.itemName },
    { header: { ar: 'الكمية', en: 'Qty' }, value: (r) => r.quantity || 0 },
    { header: { ar: 'من', en: 'From' }, value: (r) => r.fromWarehouseName },
    { header: { ar: 'إلى', en: 'To' }, value: (r) => r.toWarehouseName },
    { header: { ar: 'القيمة', en: 'Value' }, value: (r) => r.totalCost || 0 },
  ];

  return (
    <ModuleLayout
      title={t('الحركات المخزنية', 'Stock Movements', lang)}
      subtitle={t('استلام وصرف وتحويل بين المخازن — مثبتة محاسبياً تلقائياً', 'Receive, issue & transfer — auto-posted to accounting', lang)}
      actions={
        <div className="flex gap-2 flex-wrap">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'الحركات المخزنية', en: 'Stock Movements' }} />
          <Button onClick={() => openNew('RECEIVE')} className="gap-2 bg-emerald-600 hover:bg-emerald-700"><ArrowDownToLine className="size-4" />{t('استلام', 'Receive', lang)}</Button>
          <Button onClick={() => openNew('ISSUE')} className="gap-2 bg-rose-600 hover:bg-rose-700"><ArrowUpFromLine className="size-4" />{t('صرف', 'Issue', lang)}</Button>
          <Button onClick={() => openNew('TRANSFER')} className="gap-2 bg-blue-600 hover:bg-blue-700"><ArrowLeftRight className="size-4" />{t('تحويل', 'Transfer', lang)}</Button>
          <Button onClick={() => openNew('DAMAGE_NORMAL')} variant="outline" className="gap-2 text-amber-700 border-amber-300 hover:bg-amber-50"><Flame className="size-4" />{t('تلف طبيعي', 'Normal Damage', lang)}</Button>
          <Button onClick={() => openNew('DAMAGE_ABNORMAL')} variant="outline" className="gap-2 text-orange-700 border-orange-300 hover:bg-orange-50"><ShieldAlert className="size-4" />{t('تلف غير طبيعي', 'Abnormal Damage', lang)}</Button>
          <Button onClick={() => openNew('ADJUST_INCREASE')} variant="outline" className="gap-2 text-teal-700 border-teal-300 hover:bg-teal-50"><ClipboardCheck className="size-4" />{t('جرد بالزيادة', 'Surplus', lang)}</Button>
          <Button onClick={() => openNew('ADJUST_DECREASE')} variant="outline" className="gap-2 text-red-700 border-red-300 hover:bg-red-50"><ClipboardCheck className="size-4" />{t('جرد بالعجز', 'Shortage', lang)}</Button>
        </div>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي المستلم', 'Total Received', lang)}</p><p className="text-xl font-bold mt-1 text-emerald-700">{formatCurrency(stats.receive, lang)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t('إجمالي المصروف', 'Total Issued', lang)}</p><p className="text-xl font-bold mt-1 text-rose-700">{formatCurrency(stats.issue, lang)}</p></Card>
        <Card className="p-4"><p className="text-xs text-muted-foreground">{t('عدد التحويلات', 'Transfers', lang)}</p><p className="text-xl font-bold mt-1 text-blue-700">{stats.transfer}</p></Card>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالصنف أو رقم الحركة...', 'Search item or movement no...', lang)} className="ps-9" />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الأنواع', 'All Types', lang)}</SelectItem>
            {Object.entries(TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('التاريخ', 'Date', lang)}</TableHead>
                <TableHead>{t('الحركة', 'Movement', lang)}</TableHead>
                <TableHead>{t('النوع', 'Type', lang)}</TableHead>
                <TableHead>{t('الصنف', 'Item', lang)}</TableHead>
                <TableHead className="text-center">{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead>{t('من / إلى', 'From / To', lang)}</TableHead>
                <TableHead className="text-end">{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead className="text-center">{t('القيد', 'Entry', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 8 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">{t('لا توجد حركات', 'No movements', lang)}</TableCell></TableRow>
                : filtered.map(m => {
                  const ty = TYPES[m.type] || TYPES.RECEIVE;
                  return (
                    <TableRow key={m.id} className="hover:bg-muted/30">
                      <TableCell className="text-sm whitespace-nowrap" dir="ltr">{m.date}</TableCell>
                      <TableCell className="font-mono text-xs text-muted-foreground">{m.movementNo}</TableCell>
                      <TableCell><span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${ty.color}`}><ty.Icon className="size-3" />{lang === 'ar' ? ty.ar : ty.en}</span></TableCell>
                      <TableCell className="font-medium text-sm">{m.itemName}</TableCell>
                      <TableCell className="text-center text-sm">{m.quantity} {m.unit || ''}</TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {m.fromWarehouseName && <span>{m.fromWarehouseName}</span>}
                        {m.fromWarehouseName && m.toWarehouseName && <span className="mx-1">←</span>}
                        {m.toWarehouseName && <span>{m.toWarehouseName}</span>}
                        {m.projectName && <span className="block text-emerald-600">{m.projectName}</span>}
                      </TableCell>
                      <TableCell className="text-end text-sm font-medium">{m.totalCost ? formatCurrency(m.totalCost, lang) : '—'}</TableCell>
                      <TableCell className="text-center">
                        {m.totalCost > 0 ? <CheckCircle2 className="size-4 text-emerald-500 inline" title={m.journalEntryNo} /> : <span className="text-xs text-muted-foreground">—</span>}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">{filtered.length} {t('حركة', 'movements', lang)}</p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {form.type && React.createElement(TYPES[form.type].Icon, { className: 'size-5' })}
              {t('حركة مخزنية:', 'Stock Movement:', lang)} {lang === 'ar' ? TYPES[form.type]?.ar : TYPES[form.type]?.en}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('التاريخ', 'Date', lang)}</Label><Input type="date" value={form.date} onChange={e => set('date', e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('رقم الحركة', 'Movement No.', lang)}</Label><Input value={form.movementNo || ''} readOnly className="bg-muted font-mono" /></div>

            <div className="space-y-1 col-span-2">
              <Label>{t('الصنف', 'Item', lang)} *</Label>
              <Select value={form.itemId} onValueChange={v => { const it = items.find(i => i.id === v); set('itemId', v); if (it && !form.unitCost) set('unitCost', it.unitCost || ''); }}>
                <SelectTrigger><SelectValue placeholder={t('اختر الصنف', 'Select item', lang)} /></SelectTrigger>
                <SelectContent>{items.map(i => <SelectItem key={i.id} value={i.id}>{i.code} — {i.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>

            <div className="space-y-1"><Label>{t('الكمية', 'Quantity', lang)} *</Label><Input type="number" value={form.quantity} onChange={e => set('quantity', e.target.value)} /></div>
            <div className="space-y-1"><Label>{t('تكلفة الوحدة', 'Unit Cost', lang)}</Label><Input type="number" value={form.unitCost} onChange={e => set('unitCost', e.target.value)} placeholder={selectedItem?.unitCost || '0'} /></div>

            {USES_FROM.includes(form.type) && (
              <div className="space-y-1 col-span-2">
                <Label>{t('من مخزن', 'From Warehouse', lang)} *</Label>
                <Select value={form.fromWarehouseId} onValueChange={v => set('fromWarehouseId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر المخزن', 'Select warehouse', lang)} /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}
            {USES_TO.includes(form.type) && (
              <div className="space-y-1 col-span-2">
                <Label>{t('إلى مخزن', 'To Warehouse', lang)} *</Label>
                <Select value={form.toWarehouseId} onValueChange={v => set('toWarehouseId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر المخزن', 'Select warehouse', lang)} /></SelectTrigger>
                  <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {form.type === 'DAMAGE_ABNORMAL' && (
              <div className="space-y-1 col-span-2">
                <Label>{t('المسؤول المُحمّل عليه التلف (ذمة عليه)', 'Responsible Person (charged)', lang)} *</Label>
                <Select value={form.responsibleId} onValueChange={v => set('responsibleId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الموظف', 'Select employee', lang)} /></SelectTrigger>
                  <SelectContent>{employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {['DAMAGE_NORMAL', 'DAMAGE_ABNORMAL', 'ADJUST_INCREASE', 'ADJUST_DECREASE'].includes(form.type) && (
              <div className="space-y-1 col-span-2">
                <Label>{t('السبب', 'Reason', lang)}</Label>
                <Input value={form.reason} onChange={e => set('reason', e.target.value)} placeholder={t('تلف بالمياه، كسر، فرق عدّ...', 'Water damage, breakage, count diff...', lang)} />
              </div>
            )}

            {form.type === 'ISSUE' && (
              <div className="space-y-1 col-span-2">
                <Label>{t('الطلب (يُحمّل عليه المصروف)', 'Order (charged)', lang)}</Label>
                <Select value={form.projectId} onValueChange={v => set('projectId', v)}>
                  <SelectTrigger><SelectValue placeholder={t('اختر الطلب', 'Select order', lang)} /></SelectTrigger>
                  <SelectContent>{projects.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            {form.type === 'RECEIVE' && (
              <>
                <div className="space-y-1 col-span-2">
                  <Label>{t('مصدر التمويل', 'Funding Source', lang)}</Label>
                  <Select value={form.sourceType} onValueChange={v => set('sourceType', v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{Object.entries(SOURCES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.sourceType === 'SUPPLIER' && (
                  <div className="space-y-1 col-span-2">
                    <Label>{t('المورد', 'Supplier', lang)} *</Label>
                    <Select value={form.supplierId} onValueChange={v => set('supplierId', v)}>
                      <SelectTrigger><SelectValue placeholder={t('اختر المورد', 'Select supplier', lang)} /></SelectTrigger>
                      <SelectContent>{suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
                {form.sourceType === 'CASH' && (
                  <div className="space-y-1 col-span-2">
                    <Label>{t('الحساب النقدي', 'Cash Account', lang)} *</Label>
                    <Select value={form.cashAccountCode} onValueChange={v => set('cashAccountCode', v)}>
                      <SelectTrigger><SelectValue placeholder={t('اختر الحساب', 'Select account', lang)} /></SelectTrigger>
                      <SelectContent>{cashAccounts.map(a => <SelectItem key={a.code} value={a.code}>{a.code} — {a.name}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                )}
              </>
            )}

            <div className="space-y-1 col-span-2"><Label>{t('ملاحظات', 'Notes', lang)}</Label><Input value={form.notes} onChange={e => set('notes', e.target.value)} /></div>
          </div>

          <div className="rounded-lg bg-muted/50 p-3 text-sm flex justify-between">
            <span className="text-muted-foreground">{t('إجمالي قيمة الحركة', 'Total Value', lang)}</span>
            <span className="font-bold">{formatCurrency(totalCost, lang)}</span>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-700 hover:bg-slate-800">{saving ? t('جاري الترحيل...', 'Posting...', lang) : t('تسجيل وترحيل', 'Record & Post', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}