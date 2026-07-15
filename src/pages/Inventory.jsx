import React, { useState, useEffect, useRef } from 'react';
import {
  Plus, Search, Pencil, Trash2, RefreshCw, AlertTriangle,
  Upload, Download, FileSpreadsheet, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import TableToolbar from '@/components/shared/TableToolbar';
import { toast } from 'sonner';

const CATEGORIES = {
  MATERIAL:    { ar: 'مواد', en: 'Material', color: 'bg-blue-100 text-blue-700' },
  CONSUMABLE:  { ar: 'مستهلكات', en: 'Consumable', color: 'bg-cyan-100 text-cyan-700' },
  SPARE_PART:  { ar: 'قطع غيار', en: 'Spare Part', color: 'bg-amber-100 text-amber-700' },
  TOOL:        { ar: 'أدوات', en: 'Tool', color: 'bg-violet-100 text-violet-700' },
  FIXED_ASSET: { ar: 'أصل ثابت', en: 'Fixed Asset', color: 'bg-emerald-100 text-emerald-700' },
};
const empty = { code: '', name: '', nameEn: '', category: 'MATERIAL', unit: '', quantity: '', reorderLevel: '', unitCost: '', warehouseId: '', location: '', isActive: true, notes: '' };

// رؤوس أعمدة ملف CSV للاستيراد/التصدير والقالب
const CSV_HEADERS = ['code', 'name', 'nameEn', 'categoryName', 'unit', 'costPrice', 'salePrice', 'quantity', 'reorderLevel'];

// تحليل CSV نصي إلى مصفوفة كائنات (يدعم الفواصل والفواصل المنقوطة، النصوص بين علامات اقتباس، وBOM)
const parseCSV = (text) => {
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  const parseLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
        else { inQuotes = !inQuotes; }
      } else if (ch === delimiter && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  const headers = parseLine(lines[0]);
  return lines.slice(1).map((line) => {
    const values = parseLine(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h] = values[i] ?? ''; });
    return obj;
  });
};

// توليد سلسلة CSV من قائمة أصناف المخزون
const itemsToCSV = (rows) => {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = CSV_HEADERS.map(esc).join(',');
  const body = rows.map((r) => CSV_HEADERS.map((h) => {
    if (h === 'costPrice') return esc(r.costPrice ?? r.unitCost ?? '');
    if (h === 'salePrice') return esc(r.salePrice ?? r.unitCost ?? '');
    if (h === 'categoryName') return esc(r.categoryName || r.warehouseName || '');
    return esc(r[h]);
  }).join(',')).join('\n');
  return `${header}\n${body}`;
};

const downloadTextFile = (filename, text, mime = 'text/csv;charset=utf-8;') => {
  const blob = new Blob(['\uFEFF' + text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

export default function Inventory() {
  const { lang } = useStore();
  const [items, setItems] = useState([]);
  const [warehouses, setWarehouses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  // ─── استيراد CSV/Excel ─────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const [importPreview, setImportPreview] = useState(null); // مصفوفة الصفوف المحلّلة
  const [importing, setImporting] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [it, wh] = await Promise.all([
        base44.entities.InventoryItem.list('code', 500),
        base44.entities.Warehouse.filter({ isActive: true }, 'code', 500),
      ]);
      setItems(it || []);
      setWarehouses(wh || []);
    }
    catch { toast.error(t('فشل تحميل البيانات', 'Failed to load', lang)); }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const filtered = items.filter(i => {
    const match = !search || i.name?.toLowerCase().includes(search.toLowerCase()) || i.code?.toLowerCase().includes(search.toLowerCase());
    return match && (filterCat === 'ALL' || i.category === filterCat);
  });

  const openNew = () => { setEditing(null); setForm({ ...empty, code: nextCodeFromList(items, 'ITM', 'code') }); setDialogOpen(true); };
  const openEdit = (item) => { setEditing(item); setForm({ ...empty, ...item }); setDialogOpen(true); };
  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.code || !form.name) return toast.error(t('الرمز والاسم مطلوبان', 'Code and name required', lang));
    setSaving(true);
    try {
      const wh = warehouses.find(w => w.id === form.warehouseId);
      const data = {
        code: form.code, name: form.name, nameEn: form.nameEn, category: form.category, unit: form.unit,
        quantity: Number(form.quantity) || 0, reorderLevel: Number(form.reorderLevel) || 0,
        unitCost: Number(form.unitCost) || 0, warehouseId: form.warehouseId, warehouseName: wh?.name || '',
        location: form.location, isActive: form.isActive, notes: form.notes,
      };
      if (editing) { await base44.entities.InventoryItem.update(editing.id, data); toast.success(t('تم التحديث', 'Updated', lang)); }
      else { await base44.entities.InventoryItem.create(data); toast.success(t('تمت الإضافة', 'Added', lang)); }
      setDialogOpen(false); load();
    } catch { toast.error(t('فشل الحفظ', 'Save failed', lang)); }
    setSaving(false);
  };

  const remove = async () => {
    try {
      const checks = await Promise.all([
        base44.entities.StockMovement.filter({ itemId: deleteId }),
      ]);
      if (checks.some(list => list.length > 0)) {
        toast.error(t('لا يمكن حذف صنف له حركات مخزون', 'Cannot delete an item with stock movements', lang));
        return;
      }
      await base44.entities.InventoryItem.delete(deleteId); toast.success(t('تم الحذف', 'Deleted', lang)); load();
    } catch { toast.error(t('فشل الحذف', 'Delete failed', lang)); }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // استيراد CSV/Excel (مع معاينة) + تصدير + نموذج
  // ═══════════════════════════════════════════════════════════════════════
  const triggerFilePicker = () => {
    fileInputRef.current?.click();
  };

  const handleFileImport = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isExcel = file.name.match(/\.xlsx?$/i);
    const reader = new FileReader();

    reader.onload = (event) => {
      try {
        let rows = [];
        if (isExcel) {
          // قراءة ملف Excel (.xlsx / .xls)
          const data = new Uint8Array(event.target.result);
          const workbook = XLSX.read(data, { type: 'array' });
          const sheet = workbook.Sheets[workbook.SheetNames[0]];
          rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        } else {
          // قراءة ملف CSV
          rows = parseCSV(String(event.target.result || ''));
        }

        if (!rows.length) {
          toast.error(t('الملف فارغ أو غير صالح', 'File is empty or invalid', lang));
          return;
        }
        // تطبيع الحقول الرقمية
        const normalized = rows.map((r) => ({
          ...r,
          costPrice: parseFloat(r.costPrice) || 0,
          salePrice: parseFloat(r.salePrice) || parseFloat(r.costPrice) || 0,
          quantity: parseFloat(r.quantity) || 0,
          reorderLevel: parseFloat(r.reorderLevel) || 0,
        }));
        setImportPreview(normalized);
      } catch (err) {
        console.warn('Import parse failed:', err);
        toast.error(t('فشل قراءة الملف', 'Failed to read file', lang));
      }
    };
    reader.onerror = () => toast.error(t('فشل قراءة الملف', 'Failed to read file', lang));
    // Excel يُقرأ كـ ArrayBuffer، CSV كـ Text
    if (isExcel) {
      reader.readAsArrayBuffer(file);
    } else {
      reader.readAsText(file, 'UTF-8');
    }
    e.target.value = '';
  };

  const confirmImport = async () => {
    if (!importPreview || !importPreview.length) return;
    setImporting(true);
    let okCount = 0;
    let failCount = 0;
    try {
      const payload = importPreview.map((r, idx) => {
        const cost = parseFloat(r.costPrice) || 0;
        const sale = parseFloat(r.salePrice) || cost || 0;
        return {
          code: r.code || `INV-${String(idx + 1).padStart(4, '0')}`,
          name: r.name || '',
          nameEn: r.nameEn || '',
          categoryName: r.categoryName || '',
          unit: r.unit || 'قطعة',
          costPrice: cost,
          salePrice: sale,
          unitCost: parseFloat(r.unitCost ?? cost) || 0,
          quantity: parseFloat(r.quantity) || 0,
          reorderLevel: parseFloat(r.reorderLevel) || 0,
          isActive: true,
          notes: '',
          warehouseId: r.warehouseId || '',
        };
      }).filter((p) => p.name);

      // bulkCreate على دفعات صغيرة (50) لتفادي أي حدود
      const CHUNK = 50;
      for (let i = 0; i < payload.length; i += CHUNK) {
        const slice = payload.slice(i, i + CHUNK);
        try {
          await base44.entities.InventoryItem.bulkCreate(slice);
          okCount += slice.length;
        } catch (err) {
          console.warn('bulkCreate slice failed:', err);
          failCount += slice.length;
        }
      }
      if (okCount > 0) {
        toast.success(t(
          `تم استيراد ${okCount} صنف${failCount ? ` — فشل ${failCount}` : ''}`,
          `Imported ${okCount} item(s)${failCount ? ` — ${failCount} failed` : ''}`,
          lang
        ));
      } else {
        toast.error(t('لم يتم استيراد أي صنف', 'No items imported', lang));
      }
      setImportPreview(null);
      await load();
    } catch (err) {
      console.warn('Import failed:', err);
      toast.error(t('فشل الاستيراد', 'Import failed', lang));
    } finally {
      setImporting(false);
    }
  };

  const exportItemsCSV = () => {
    if (!filtered.length) {
      toast.error(t('لا توجد أصناف للتصدير', 'No items to export', lang));
      return;
    }
    downloadTextFile('inventory-items.csv', itemsToCSV(filtered));
    toast.success(t('تم تصدير القائمة', 'Inventory exported', lang));
  };

  const downloadTemplate = () => {
    const sample = [
      { code: 'INV-1001', name: 'دقيق فاخر', nameEn: 'Premium Flour', categoryName: 'مواد', unit: 'كجم', costPrice: 3.5, salePrice: 4, quantity: 120, reorderLevel: 20 },
      { code: 'INV-1002', name: 'زيت ذرة', nameEn: 'Corn Oil', categoryName: 'مواد', unit: 'لتر', costPrice: 8, salePrice: 9, quantity: 40, reorderLevel: 10 },
    ];
    downloadTextFile('inventory-template.csv', itemsToCSV(sample));
    toast.success(t('تم تنزيل النموذج', 'Template downloaded', lang));
  };

  const totalValue = filtered.reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0);
  const lowStock = filtered.filter(i => i.reorderLevel > 0 && i.quantity <= i.reorderLevel).length;

  const exportColumns = [
    { header: { ar: 'الرمز', en: 'Code' }, value: (r) => r.code },
    { header: { ar: 'الصنف', en: 'Item' }, value: (r) => r.name },
    { header: { ar: 'الفئة', en: 'Category' }, value: (r) => { const c = CATEGORIES[r.category]; return c ? (lang === 'ar' ? c.ar : c.en) : r.category; } },
    { header: { ar: 'المخزن', en: 'Warehouse' }, value: (r) => r.warehouseName },
    { header: { ar: 'الكمية', en: 'Qty' }, value: (r) => r.quantity || 0 },
    { header: { ar: 'الوحدة', en: 'Unit' }, value: (r) => r.unit },
    { header: { ar: 'تكلفة الوحدة', en: 'Unit Cost' }, value: (r) => r.unitCost || 0 },
    { header: { ar: 'القيمة', en: 'Value' }, value: (r) => (r.quantity || 0) * (r.unitCost || 0) },
  ];

  return (
    <ModuleLayout
      title={t('المخزون والأصول', 'Inventory & Assets', lang)}
      subtitle={t('إدارة أصناف المخزون والأصول الثابتة', 'Manage stock items and fixed assets', lang)}
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <TableToolbar columns={exportColumns} rows={filtered} title={{ ar: 'المخزون', en: 'Inventory' }} />
          <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
            <FileSpreadsheet className="size-4" />
            {t('نموذج CSV', 'CSV Template', lang)}
          </Button>
          <Button variant="outline" size="sm" onClick={triggerFilePicker} className="gap-1.5">
            <Upload className="size-4" />
            {t('استيراد', 'Import', lang)}
          </Button>
          <Button variant="outline" size="sm" onClick={exportItemsCSV} className="gap-1.5" disabled={!filtered.length}>
            <Download className="size-4" />
            {t('تصدير', 'Export', lang)}
          </Button>
          <Button onClick={openNew} className="gap-2 bg-slate-700 hover:bg-slate-800"><Plus className="size-4" />{t('صنف جديد', 'New Item', lang)}</Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={handleFileImport}
            className="hidden"
          />
        </div>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('بحث بالرمز أو الاسم...', 'Search code or name...', lang)} className="ps-9" />
        </div>
        <Select value={filterCat} onValueChange={setFilterCat}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الفئات', 'All Categories', lang)}</SelectItem>
            {Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}><RefreshCw className="size-4" /></Button>
      </div>

      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('الرمز', 'Code', lang)}</TableHead>
                <TableHead>{t('الصنف', 'Item', lang)}</TableHead>
                <TableHead>{t('الفئة', 'Category', lang)}</TableHead>
                <TableHead>{t('المخزن', 'Warehouse', lang)}</TableHead>
                <TableHead>{t('الكمية', 'Qty', lang)}</TableHead>
                <TableHead>{t('الوحدة', 'Unit', lang)}</TableHead>
                <TableHead className="text-end">{t('تكلفة الوحدة', 'Unit Cost', lang)}</TableHead>
                <TableHead className="text-end">{t('القيمة', 'Value', lang)}</TableHead>
                <TableHead>{t('الإجراءات', 'Actions', lang)}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? Array.from({ length: 4 }).map((_, i) => <TableRow key={i}>{Array.from({ length: 9 }).map((_, j) => <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>)}</TableRow>)
                : filtered.length === 0 ? <TableRow><TableCell colSpan={9} className="text-center py-10 text-muted-foreground">{t('لا توجد أصناف', 'No items', lang)}</TableCell></TableRow>
                : filtered.map(item => {
                  const cat = CATEGORIES[item.category] || CATEGORIES.MATERIAL;
                  const low = item.reorderLevel > 0 && item.quantity <= item.reorderLevel;
                  return (
                    <TableRow key={item.id} className="hover:bg-muted/30">
                      <TableCell className="font-mono text-xs text-muted-foreground">{item.code}</TableCell>
                      <TableCell className="font-medium">{lang === 'ar' ? item.name : (item.nameEn || item.name)}</TableCell>
                      <TableCell><span className={`rounded-full px-2 py-0.5 text-xs font-medium ${cat.color}`}>{lang === 'ar' ? cat.ar : cat.en}</span></TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.warehouseName || '—'}</TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center gap-1 font-medium ${low ? 'text-rose-600' : ''}`}>
                          {item.quantity ?? 0}{low && <AlertTriangle className="size-3.5" />}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">{item.unit || '—'}</TableCell>
                      <TableCell className="text-end text-sm">{formatCurrency(item.unitCost, lang)}</TableCell>
                      <TableCell className="text-end text-sm font-medium">{formatCurrency((item.quantity || 0) * (item.unitCost || 0), lang)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(item)}><Pencil className="size-3.5" /></Button>
                          <Button variant="ghost" size="icon" className="size-8 text-destructive" onClick={() => askDelete(item.id)}><Trash2 className="size-3.5" /></Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </div>
      </Card>
      <p className="text-sm text-muted-foreground">
        {filtered.length} {t('صنف', 'items', lang)} | {t('قيمة المخزون', 'Stock Value', lang)}: <strong className="text-slate-700">{formatCurrency(totalValue, lang)}</strong>
        {lowStock > 0 && <span className="text-rose-600"> | {lowStock} {t('تحت حد الطلب', 'below reorder', lang)}</span>}
      </p>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader><DialogTitle>{editing ? t('تعديل الصنف', 'Edit Item', lang) : t('صنف جديد', 'New Item', lang)}</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1"><Label>{t('الرمز', 'Code', lang)} *</Label><Input value={form.code} readOnly className="bg-muted font-mono" /></div>
            <div className="space-y-1">
              <Label>{t('الفئة', 'Category', lang)}</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{Object.entries(CATEGORIES).map(([k, v]) => <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1"><Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label><Input value={form.nameEn} onChange={e => setForm(f => ({ ...f, nameEn: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الكمية', 'Quantity', lang)}</Label><Input type="number" value={form.quantity} onChange={e => setForm(f => ({ ...f, quantity: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('الوحدة', 'Unit', lang)}</Label><Input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder={t('قطعة، كجم...', 'pcs, kg...', lang)} /></div>
            <div className="space-y-1"><Label>{t('حد إعادة الطلب', 'Reorder Level', lang)}</Label><Input type="number" value={form.reorderLevel} onChange={e => setForm(f => ({ ...f, reorderLevel: e.target.value }))} /></div>
            <div className="space-y-1"><Label>{t('تكلفة الوحدة', 'Unit Cost', lang)}</Label><Input type="number" value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} /></div>
            <div className="space-y-1 col-span-2">
              <Label>{t('المخزن', 'Warehouse', lang)}</Label>
              <Select value={form.warehouseId} onValueChange={v => setForm(f => ({ ...f, warehouseId: v }))}>
                <SelectTrigger><SelectValue placeholder={t('اختر المخزن', 'Select warehouse', lang)} /></SelectTrigger>
                <SelectContent>{warehouses.map(w => <SelectItem key={w.id} value={w.id}>{w.name}{w.projectName ? ` — ${w.projectName}` : ''}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2"><Label>{t('الموقع داخل المخزن', 'Location in Warehouse', lang)}</Label><Input value={form.location} onChange={e => setForm(f => ({ ...f, location: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
            <Button onClick={save} disabled={saving} className="bg-slate-700 hover:bg-slate-800">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog open={confirmOpen} onOpenChange={setConfirmOpen}
        title={t('حذف الصنف', 'Delete Item', lang)}
        description={t('سيتم حذف الصنف نهائياً.', 'This item will be permanently deleted.', lang)}
        onConfirm={remove} confirmLabel={t('حذف', 'Delete', lang)} />

      {/* ════════════ حوار معاينة الاستيراد ════════════ */}
      <Dialog open={!!importPreview} onOpenChange={(o) => { if (!importing) setImportPreview(o ? importPreview : null); }}>
        <DialogContent className="max-w-3xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-slate-700" />
              {t('معاينة الاستيراد', 'Import Preview', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-y-auto">
            <p className="text-sm text-muted-foreground">
              {importPreview?.length || 0} {t('صف سيتم استيرادها. راجعها قبل التأكيد.', 'rows will be imported. Review before confirming.', lang)}
            </p>
            <div className="rounded-md border overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>#</TableHead>
                    <TableHead>code</TableHead>
                    <TableHead>name</TableHead>
                    <TableHead>nameEn</TableHead>
                    <TableHead>categoryName</TableHead>
                    <TableHead>unit</TableHead>
                    <TableHead className="text-end">costPrice</TableHead>
                    <TableHead className="text-end">salePrice</TableHead>
                    <TableHead className="text-end">qty</TableHead>
                    <TableHead className="text-end">reorder</TableHead>
                    <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview?.map((r, idx) => {
                    const valid = !!r.name;
                    return (
                      <TableRow key={idx} className={valid ? '' : 'bg-rose-50'}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{r.code || '—'}</TableCell>
                        <TableCell className="text-sm">{r.name || <span className="text-rose-600">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{r.nameEn || ''}</TableCell>
                        <TableCell className="text-xs">{r.categoryName || '—'}</TableCell>
                        <TableCell className="text-xs">{r.unit || '—'}</TableCell>
                        <TableCell className="text-end text-xs">{r.costPrice || 0}</TableCell>
                        <TableCell className="text-end text-xs font-semibold">{r.salePrice || 0}</TableCell>
                        <TableCell className="text-end text-xs">{r.quantity || 0}</TableCell>
                        <TableCell className="text-end text-xs">{r.reorderLevel || 0}</TableCell>
                        <TableCell className="text-center">
                          {valid ? (
                            <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border border-emerald-200">
                              {t('صالح', 'OK', lang)}
                            </Badge>
                          ) : (
                            <Badge variant="secondary" className="bg-rose-100 text-rose-700 border border-rose-200">
                              {t('متخطّى', 'Skipped', lang)}
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            <div className="flex items-start gap-2 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md p-2">
              <AlertCircle className="size-4 shrink-0 mt-0.5" />
              <span>
                {t(
                  'الصفوف التي لا تحتوي على اسم سيتم تخطّيها تلقائياً. سيتم إنشاء رمز تلقائي للصفوف بدون رمز.',
                  'Rows missing a name will be skipped automatically. An auto code is generated for rows without one.',
                  lang
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={confirmImport} disabled={importing} className="bg-slate-700 hover:bg-slate-800 gap-1.5">
              {importing ? (
                <>
                  <RefreshCw className="size-4 animate-spin" />
                  {t('جاري الاستيراد...', 'Importing...', lang)}
                </>
              ) : (
                <>
                  <Upload className="size-4" />
                  {t('تأكيد الاستيراد', 'Confirm Import', lang)}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </ModuleLayout>
  );
}