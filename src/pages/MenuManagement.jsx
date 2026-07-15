import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Plus, Pencil, Trash2, Upload, Download, FileSpreadsheet, UtensilsCrossed,
  FolderPlus, Search, RefreshCw, ArrowUp, ArrowDown, AlertCircle,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t, formatCurrency, nextCodeFromList } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// MenuManagement — إدارة قائمة الطعام (الأقسام + الوجبات)
//   - تبويب 1: الأقسام (CRUD + إعادة ترتيب)
//   - تبويب 2: الوجبات (CRUD + بحث + فلترة + استيراد CSV + تصدير CSV)
// ═══════════════════════════════════════════════════════════════════════

const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

const EMPTY_CATEGORY = {
  code: '', name: '', nameEn: '', sortOrder: 1, isActive: true,
};

const EMPTY_ITEM = {
  code: '', name: '', nameEn: '', categoryId: '', unit: 'قطعة',
  costPrice: '', salePrice: '', quantity: '', reorderLevel: '', isActive: true, notes: '',
};

// رؤوس CSV المعتمدة للاستيراد/التصدير
const CSV_HEADERS = ['code', 'name', 'nameEn', 'categoryId', 'costPrice', 'salePrice', 'unit'];

// تحويل CSV نصي إلى مصفوفة كائنات (يدعم الفواصل فقط — بسيط وسريع)
// تحليل CSV يدعم: الفواصل (,) والفواصل المنقوطة (؛)، النصوص بين علامات اقتباس،
// وBOM في بداية الملف (Excel يضيفه أحياناً).
const parseCSV = (text) => {
  // إزالة BOM إن وُجد
  const clean = text.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = clean.split('\n').filter(l => l.trim().length > 0);
  if (!lines.length) return [];

  // اكتشاف الفاصل: إن احتوى السطر الأول على ؛ أكثر من ، فالفاصل هو ؛
  const firstLine = lines[0];
  const semicolonCount = (firstLine.match(/;/g) || []).length;
  const commaCount = (firstLine.match(/,/g) || []).length;
  const delimiter = semicolonCount > commaCount ? ';' : ',';

  // تحليل سطر يدعم النصوص بين علامات اقتباس
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

// توليد سلسلة CSV من قائمة أصناف
const itemsToCSV = (rows) => {
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const header = CSV_HEADERS.map(esc).join(',');
  const body = rows.map((r) => CSV_HEADERS.map((h) => {
    if (h === 'categoryId') return esc(r.categoryId || r.category || '');
    if (h === 'costPrice') return esc(r.costPrice ?? r.unitCost ?? '');
    if (h === 'salePrice') return esc(r.salePrice ?? r.unitCost ?? '');
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

export default function MenuManagement() {
  const { lang } = useStore();

  // ─── بيانات مشتركة ──────────────────────────────────────────────────
  const [tab, setTab] = useState('categories');
  const [categories, setCategories] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  // ─── تبويب الأقسام ──────────────────────────────────────────────────
  const [catDialogOpen, setCatDialogOpen] = useState(false);
  const [catEditing, setCatEditing] = useState(null);
  const [catForm, setCatForm] = useState(EMPTY_CATEGORY);
  const [catSaving, setCatSaving] = useState(false);
  const [catDelete, setCatDelete] = useState(null); // category to delete

  // ─── تبويب الوجبات ──────────────────────────────────────────────────
  const [itemSearch, setItemSearch] = useState('');
  const [itemFilterCat, setItemFilterCat] = useState('ALL');
  const [itemDialogOpen, setItemDialogOpen] = useState(false);
  const [itemEditing, setItemEditing] = useState(null);
  const [itemForm, setItemForm] = useState(EMPTY_ITEM);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemDelete, setItemDelete] = useState(null);

  // ─── استيراد CSV ────────────────────────────────────────────────────
  const fileInputRef = useRef(null);
  const itemsRef = useRef([]);
  const [importPreview, setImportPreview] = useState(null); // array of parsed rows
  const [importing, setImporting] = useState(false);

  // ─── تحميل البيانات ─────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const [cats, its] = await Promise.all([
        base44.entities.MenuCategory.list('sortOrder', 500),
        base44.entities.InventoryItem.list('code', 1000),
      ]);
      setCategories((cats || []).slice().sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0)));
      setItems(its || []);
      itemsRef.current = its || [];
    } catch (err) {
      toast.error(errorMessage(err, t('فشل تحميل البيانات', 'Failed to load', lang)));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // خريطة الأقسام: id → category (للوصول السريع)
  const catById = useMemo(() => {
    const m = new Map();
    categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [categories]);

  // عدد الأصناف لكل قسم
  const countByCat = useMemo(() => {
    const m = new Map();
    items.forEach((it) => {
      const k = it.categoryId || '__none__';
      m.set(k, (m.get(k) || 0) + 1);
    });
    return m;
  }, [items]);

  // ─── فلترة الأصناف ──────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    const q = itemSearch.trim().toLowerCase();
    return items.filter((it) => {
      const matchCat = itemFilterCat === 'ALL' || it.categoryId === itemFilterCat;
      const matchSearch = !q ||
        String(it.name || '').toLowerCase().includes(q) ||
        String(it.nameEn || '').toLowerCase().includes(q) ||
        String(it.code || '').toLowerCase().includes(q);
      return matchCat && matchSearch;
    });
  }, [items, itemSearch, itemFilterCat]);

  // إجمالي هامش الربح
  const totalProfit = useMemo(
    () => filteredItems.reduce((s, it) => {
      const cost = parseFloat(it.costPrice) || 0;
      const sale = parseFloat(it.salePrice ?? it.unitCost) || 0;
      return s + Math.max(0, sale - cost);
    }, 0),
    [filteredItems]
  );

  // ═══════════════════════════════════════════════════════════════════════
  // إجراءات الأقسام (CRUD + Reorder)
  // ═══════════════════════════════════════════════════════════════════════
  const openNewCategory = () => {
    setCatEditing(null);
    setCatForm({
      ...EMPTY_CATEGORY,
      code: nextCodeFromList(categories, 'CAT'),
      sortOrder: (categories.reduce((m, c) => Math.max(m, c.sortOrder || 0), 0) || 0) + 1,
      isActive: true,
    });
    setCatDialogOpen(true);
  };

  const openEditCategory = (cat) => {
    setCatEditing(cat);
    setCatForm({ ...EMPTY_CATEGORY, ...cat });
    setCatDialogOpen(true);
  };

  const saveCategory = async () => {
    if (!catForm.name || !catForm.name.trim()) {
      toast.error(t('اسم القسم مطلوب', 'Category name is required', lang));
      return;
    }
    setCatSaving(true);
    try {
      const data = {
        code: catForm.code,
        name: catForm.name.trim(),
        nameEn: (catForm.nameEn || '').trim(),
        sortOrder: Number(catForm.sortOrder) || 0,
        isActive: !!catForm.isActive,
      };
      if (catEditing) {
        await base44.entities.MenuCategory.update(catEditing.id, data);
        toast.success(t('تم تحديث القسم', 'Category updated', lang));
      } else {
        await base44.entities.MenuCategory.create(data);
        toast.success(t('تم إضافة القسم', 'Category added', lang));
      }
      setCatDialogOpen(false);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang)));
    } finally {
      setCatSaving(false);
    }
  };

  const removeCategory = async () => {
    if (!catDelete) return;
    // تحقق من عدم وجود أصناف تابعة
    const linked = items.filter((it) => it.categoryId === catDelete.id);
    if (linked.length > 0) {
      toast.error(t(
        `لا يمكن الحذف — يوجد ${linked.length} وجبة مرتبطة بهذا القسم`,
        `Cannot delete — ${linked.length} item(s) are linked to this category`,
        lang
      ));
      return;
    }
    try {
      await base44.entities.MenuCategory.delete(catDelete.id);
      toast.success(t('تم حذف القسم', 'Category deleted', lang));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang)));
    }
  };

  // إعادة الترتيب: تبديل sortOrder بين القسم والقسم المجاور
  const moveCategory = async (idx, direction) => {
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= categories.length) return;
    const a = categories[idx];
    const b = categories[targetIdx];
    const aOrder = a.sortOrder || 0;
    const bOrder = b.sortOrder || 0;
    try {
      await Promise.all([
        base44.entities.MenuCategory.update(a.id, { sortOrder: bOrder }),
        base44.entities.MenuCategory.update(b.id, { sortOrder: aOrder }),
      ]);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل إعادة الترتيب', 'Reorder failed', lang)));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // إجراءات الوجبات (CRUD)
  // ═══════════════════════════════════════════════════════════════════════
  const openNewItem = () => {
    if (!categories.length) {
      toast.error(t('أضف قسماً أولاً قبل إضافة وجبة', 'Add a category first before adding items', lang));
      return;
    }
    setItemEditing(null);
    setItemForm({
      ...EMPTY_ITEM,
      code: nextCodeFromList(items, 'M'),
      categoryId: categories[0]?.id || '',
      unit: 'قطعة',
      isActive: true,
    });
    setItemDialogOpen(true);
  };

  const openEditItem = (it) => {
    setItemEditing(it);
    setItemForm({ ...EMPTY_ITEM, ...it });
    setItemDialogOpen(true);
  };

  const saveItem = async () => {
    if (!itemForm.name || !itemForm.name.trim()) {
      toast.error(t('اسم الوجبة مطلوب', 'Item name is required', lang));
      return;
    }
    if (!itemForm.categoryId) {
      toast.error(t('القسم مطلوب', 'Category is required', lang));
      return;
    }
    const sale = parseFloat(itemForm.salePrice);
    if (isNaN(sale) || sale <= 0) {
      toast.error(t('سعر البيع مطلوب ويجب أن يكون أكبر من صفر', 'Sale price is required and must be > 0', lang));
      return;
    }
    setItemSaving(true);
    try {
      const cat = catById.get(itemForm.categoryId);
      const cost = parseFloat(itemForm.costPrice) || 0;
      const data = {
        code: itemForm.code,
        name: itemForm.name.trim(),
        nameEn: (itemForm.nameEn || '').trim(),
        categoryId: itemForm.categoryId,
        categoryName: cat?.name || '',
        unit: itemForm.unit || 'قطعة',
        costPrice: cost,
        salePrice: sale,
        // unitCost للتوافق مع الإصدارات السابقة (POS.jsx يقرأ salePrice || unitCost)
        unitCost: sale,
        quantity: Number(itemForm.quantity) || 0,
        reorderLevel: Number(itemForm.reorderLevel) || 0,
        isActive: !!itemForm.isActive,
        notes: itemForm.notes || '',
      };
      if (itemEditing) {
        await base44.entities.InventoryItem.update(itemEditing.id, data);
        toast.success(t('تم تحديث الوجبة', 'Item updated', lang));
        setItemDialogOpen(false);
      } else {
        await base44.entities.InventoryItem.create(data);
        toast.success(t('تمت إضافة الوجبة', 'Item added', lang));
        // عند الإضافة: لا نغلق النافذة، نُعيد ضبط النموذج لإضافة وجبة جديدة
        // مع الحفاظ على القسم المختار لتسهيل الإضافة المتعددة.
        const savedCat = itemForm.categoryId;
        const savedCatName = cat?.name || '';
        await load();
        setItemForm({
          ...EMPTY_ITEM,
          code: nextCodeFromList(itemsRef.current || [], 'M', 'code'),
          categoryId: savedCat,
          categoryName: savedCatName,
          unit: 'قطعة',
          isActive: true,
        });
      }
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحفظ', 'Save failed', lang)));
    } finally {
      setItemSaving(false);
    }
  };

  // حفظ وإغلاق النافذة (للإضافة المتعددة: المستخدم يضغط "حفظ" للإضافة المتتابعة، ثم "تم" للإغلاق)
  const saveAndClose = async () => {
    await saveItem();
    setItemDialogOpen(false);
  };

  const removeItem = async () => {
    if (!itemDelete) return;
    try {
      await base44.entities.InventoryItem.delete(itemDelete.id);
      toast.success(t('تم حذف الوجبة', 'Item deleted', lang));
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الحذف', 'Delete failed', lang)));
    }
  };

  // ═══════════════════════════════════════════════════════════════════════
  // استيراد CSV (مع معاينة) + تصدير + نموذج
  // ═══════════════════════════════════════════════════════════════════════
  const triggerFilePicker = () => {
    if (!categories.length) {
      toast.error(t('أضف قسماً أولاً قبل الاستيراد', 'Add a category first before importing', lang));
      return;
    }
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
        // تطبيع الحقول: تحويل categoryId النصي إلى id مطابق (إن أمكن)
        const normalized = rows.map((r) => {
          const rawCat = r.categoryId || r.category || r.categoryName || '';
          // اقبل الـ id مباشرة أو اسم القسم بالعربي/الإنجليزي
          const matchedCat = catById.get(rawCat) ||
            categories.find((c) => c.name === rawCat || c.nameEn === rawCat || c.code === rawCat);
          return {
            ...r,
            categoryId: matchedCat?.id || rawCat,
            costPrice: parseFloat(r.costPrice) || 0,
            salePrice: parseFloat(r.salePrice) || parseFloat(r.costPrice) || 0,
          };
        });
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
        const cat = catById.get(r.categoryId);
        const sale = parseFloat(r.salePrice) || 0;
        const cost = parseFloat(r.costPrice) || 0;
        return {
          code: r.code || `IMP-${String(idx + 1).padStart(4, '0')}`,
          name: r.name || '',
          nameEn: r.nameEn || '',
          categoryId: cat?.id || r.categoryId || '',
          categoryName: cat?.name || '',
          unit: r.unit || 'قطعة',
          costPrice: cost,
          salePrice: sale,
          unitCost: sale,
          quantity: 0,
          reorderLevel: 0,
          isActive: true,
          notes: '',
        };
      }).filter((p) => p.name && p.categoryId);

      // bulkCreate على دفعات صغيرة لتفادي أي حدود
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
          `تم استيراد ${okCount} وجبة${failCount ? ` — فشل ${failCount}` : ''}`,
          `Imported ${okCount} item(s)${failCount ? ` — ${failCount} failed` : ''}`,
          lang
        ));
      } else {
        toast.error(t('لم يتم استيراد أي وجبة', 'No items imported', lang));
      }
      setImportPreview(null);
      await load();
    } catch (err) {
      toast.error(errorMessage(err, t('فشل الاستيراد', 'Import failed', lang)));
    } finally {
      setImporting(false);
    }
  };

  const exportItemsCSV = () => {
    if (!filteredItems.length) {
      toast.error(t('لا توجد وجبات للتصدير', 'No items to export', lang));
      return;
    }
    downloadTextFile('menu-items.csv', itemsToCSV(filteredItems));
    toast.success(t('تم تصدير القائمة', 'Menu exported', lang));
  };

  const downloadTemplate = () => {
    const sample = [
      { code: 'M-1001', name: 'برجر دجاج', nameEn: 'Chicken Burger', categoryId: categories[0]?.id || 'cat-mains', costPrice: 18, salePrice: 30, unit: 'قطعة' },
      { code: 'M-1002', name: 'عصير برتقال', nameEn: 'Orange Juice', categoryId: categories[2]?.id || 'cat-beverages', costPrice: 7, salePrice: 15, unit: 'كوب' },
    ];
    downloadTextFile('menu-template.csv', itemsToCSV(sample));
    toast.success(t('تم تنزيل النموذج', 'Template downloaded', lang));
  };

  // ═══════════════════════════════════════════════════════════════════════
  // العرض
  // ═══════════════════════════════════════════════════════════════════════
  return (
    <ModuleLayout
      title={t('إدارة القائمة', 'Menu Management', lang)}
      subtitle={t('إدارة أقسام القائمة والوجبات مع استيراد وتصدير CSV', 'Manage menu categories and items with CSV import/export', lang)}
      actions={
        <Button variant="outline" size="sm" onClick={load} className="gap-1.5">
          <RefreshCw className="size-4" />
          {t('تحديث', 'Refresh', lang)}
        </Button>
      }
    >
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="categories" className="gap-1.5">
            <FolderPlus className="size-3.5" />
            {t('الأقسام', 'Categories', lang)}
            <Badge variant="secondary" className="ms-1">{categories.length}</Badge>
          </TabsTrigger>
          <TabsTrigger value="items" className="gap-1.5">
            <UtensilsCrossed className="size-3.5" />
            {t('الوجبات', 'Menu Items', lang)}
            <Badge variant="secondary" className="ms-1">{items.length}</Badge>
          </TabsTrigger>
        </TabsList>

        {/* ════════════ تبويب الأقسام ════════════ */}
        <TabsContent value="categories">
          <div className="flex items-center justify-between gap-2 mb-3">
            <p className="text-sm text-muted-foreground">
              {t('أنشئ أقسام القائمة (أطباق رئيسية، مشروبات، مقبلات…)', 'Create menu categories (mains, drinks, appetizers…)', lang)}
            </p>
            <Button onClick={openNewCategory} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
              <Plus className="size-4" />
              {t('إضافة قسم', 'Add Category', lang)}
            </Button>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="h-32 animate-pulse bg-muted/40" />
              ))}
            </div>
          ) : categories.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <FolderPlus className="size-10 mx-auto mb-2 opacity-40" />
                <p className="text-sm">
                  {t('لا توجد أقسام بعد — ابدأ بإضافة قسم', 'No categories yet — start by adding one', lang)}
                </p>
                <Button onClick={openNewCategory} className="mt-3 gap-1.5 bg-amber-600 hover:bg-amber-700">
                  <Plus className="size-4" />
                  {t('إضافة قسم', 'Add Category', lang)}
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {categories.map((cat, idx) => {
                const count = countByCat.get(cat.id) || 0;
                return (
                  <Card
                    key={cat.id}
                    className="overflow-hidden border-t-4 border-t-amber-500 hover:shadow-md transition-shadow"
                  >
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <div className="size-9 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
                            <FolderPlus className="size-5" />
                          </div>
                          <div className="leading-tight">
                            <div className="font-bold text-foreground text-sm">{cat.name}</div>
                            {cat.nameEn && (
                              <div dir="ltr" className="text-[11px] text-muted-foreground text-start">{cat.nameEn}</div>
                            )}
                          </div>
                        </div>
                        <Badge variant={cat.isActive ? 'default' : 'secondary'} className={
                          cat.isActive
                            ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                            : 'bg-slate-100 text-slate-500 border border-slate-200'
                        }>
                          {cat.isActive ? t('نشط', 'Active', lang) : t('معطّل', 'Inactive', lang)}
                        </Badge>
                      </div>

                      <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
                        <span className="font-mono">{cat.code}</span>
                        <span>{t('ترتيب', 'Order', lang)}: <strong className="text-foreground">{cat.sortOrder ?? 0}</strong></span>
                      </div>

                      <div className="mt-3 flex items-center justify-between">
                        <Badge variant="outline" className="bg-amber-50 text-amber-800 border-amber-200">
                          <UtensilsCrossed className="size-3 me-1" />
                          {count} {t('وجبة', 'items', lang)}
                        </Badge>
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost" size="icon"
                            className="size-7"
                            disabled={idx === 0}
                            onClick={() => moveCategory(idx, 'up')}
                            title={t('تحريك لأعلى', 'Move up', lang)}
                          >
                            <ArrowUp className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="size-7"
                            disabled={idx === categories.length - 1}
                            onClick={() => moveCategory(idx, 'down')}
                            title={t('تحريك لأسفل', 'Move down', lang)}
                          >
                            <ArrowDown className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="size-7"
                            onClick={() => openEditCategory(cat)}
                            title={t('تعديل', 'Edit', lang)}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                          <Button
                            variant="ghost" size="icon"
                            className="size-7 text-destructive hover:text-destructive"
                            onClick={() => setCatDelete(cat)}
                            title={t('حذف', 'Delete', lang)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ════════════ تبويب الوجبات ════════════ */}
        <TabsContent value="items">
          {/* شريط الأدوات: بحث + فلترة قسم + إجراءات */}
          <div className="flex flex-col md:flex-row gap-2 mb-3">
            <div className="relative flex-1">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                value={itemSearch}
                onChange={(e) => setItemSearch(e.target.value)}
                placeholder={t('ابحث بالاسم أو الرمز...', 'Search by name or code...', lang)}
                className="ps-9"
              />
            </div>
            <Select value={itemFilterCat} onValueChange={setItemFilterCat}>
              <SelectTrigger className="w-full md:w-56">
                <SelectValue placeholder={t('كل الأقسام', 'All Categories', lang)} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">{t('كل الأقسام', 'All Categories', lang)}</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.nameEn ? ` — ${c.nameEn}` : ''}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={downloadTemplate} className="gap-1.5">
                <FileSpreadsheet className="size-4" />
                {t('نموذج CSV', 'CSV Template', lang)}
              </Button>
              <Button variant="outline" size="sm" onClick={triggerFilePicker} className="gap-1.5">
                <Upload className="size-4" />
                {t('استيراد من ملف', 'Import from File', lang)}
              </Button>
              <Button variant="outline" size="sm" onClick={exportItemsCSV} className="gap-1.5">
                <Download className="size-4" />
                {t('تصدير', 'Export', lang)}
              </Button>
              <Button onClick={openNewItem} className="gap-1.5 bg-amber-600 hover:bg-amber-700">
                <Plus className="size-4" />
                {t('إضافة وجبة', 'Add Item', lang)}
              </Button>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv,.xlsx,.xls,application/json"
              onChange={handleFileImport}
              className="hidden"
            />
          </div>

          {/* بطاقات ملخصة */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
            <Card><CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{t('إجمالي الوجبات', 'Total Items', lang)}</div>
              <div className="text-lg font-bold text-foreground">{filteredItems.length}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{t('الأقسام', 'Categories', lang)}</div>
              <div className="text-lg font-bold text-foreground">{categories.length}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{t('الوجبات النشطة', 'Active Items', lang)}</div>
              <div className="text-lg font-bold text-emerald-700">{filteredItems.filter((i) => i.isActive).length}</div>
            </CardContent></Card>
            <Card><CardContent className="p-3">
              <div className="text-[11px] text-muted-foreground">{t('إجمالي هامش الربح', 'Total Profit Margin', lang)}</div>
              <div className="text-lg font-bold text-emerald-700">{formatCurrency(totalProfit, lang)}</div>
            </CardContent></Card>
          </div>

          {/* جدول الوجبات */}
          <Card>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-24">{t('الرمز', 'Code', lang)}</TableHead>
                    <TableHead>{t('الوجبة', 'Item', lang)}</TableHead>
                    <TableHead>{t('القسم', 'Category', lang)}</TableHead>
                    <TableHead className="text-end">{t('سعر الشراء', 'Cost', lang)}</TableHead>
                    <TableHead className="text-end">{t('سعر البيع', 'Sale', lang)}</TableHead>
                    <TableHead className="text-end">{t('هامش الربح', 'Margin', lang)}</TableHead>
                    <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                    <TableHead className="text-center">{t('إجراءات', 'Actions', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 8 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : filteredItems.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-10 text-muted-foreground">
                        <UtensilsCrossed className="size-10 mx-auto mb-2 opacity-40" />
                        {t('لا توجد وجبات مطابقة', 'No matching items', lang)}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredItems.map((it) => {
                      const cat = catById.get(it.categoryId);
                      const cost = parseFloat(it.costPrice) || 0;
                      const sale = parseFloat(it.salePrice ?? it.unitCost) || 0;
                      const margin = sale - cost;
                      return (
                        <TableRow key={it.id} className="hover:bg-muted/30">
                          <TableCell className="font-mono text-xs text-muted-foreground">{it.code}</TableCell>
                          <TableCell>
                            <div className="font-medium text-foreground">{it.name}</div>
                            {it.nameEn && (
                              <div dir="ltr" className="text-[11px] text-muted-foreground text-start">{it.nameEn}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            {cat ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2 py-0.5 text-xs">
                                {cat.name}
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground">—</span>
                            )}
                          </TableCell>
                          <TableCell className="text-end text-sm">{formatCurrency(cost, lang)}</TableCell>
                          <TableCell className="text-end text-sm font-semibold text-emerald-700">{formatCurrency(sale, lang)}</TableCell>
                          <TableCell className="text-end text-sm">
                            <span className={margin >= 0 ? 'text-emerald-700' : 'text-rose-700'}>
                              {formatCurrency(margin, lang)}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <Badge variant="secondary" className={
                              it.isActive
                                ? 'bg-emerald-100 text-emerald-700 border border-emerald-200'
                                : 'bg-slate-100 text-slate-500 border border-slate-200'
                            }>
                              {it.isActive ? t('نشط', 'Active', lang) : t('معطّل', 'Inactive', lang)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-center gap-1">
                              <Button variant="ghost" size="icon" className="size-7" onClick={() => openEditItem(it)}>
                                <Pencil className="size-3.5" />
                              </Button>
                              <Button
                                variant="ghost" size="icon"
                                className="size-7 text-destructive hover:text-destructive"
                                onClick={() => setItemDelete(it)}
                              >
                                <Trash2 className="size-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ════════════ حوار إضافة/تعديل قسم ════════════ */}
      <Dialog open={catDialogOpen} onOpenChange={setCatDialogOpen}>
        <DialogContent className="max-w-md" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {catEditing ? t('تعديل القسم', 'Edit Category', lang) : t('إضافة قسم', 'Add Category', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('الرمز', 'Code', lang)}</Label>
              <Input value={catForm.code} readOnly className="bg-muted font-mono" />
            </div>
            <div className="space-y-1">
              <Label>{t('ترتيب العرض', 'Sort Order', lang)}</Label>
              <Input
                type="number" min="0"
                value={catForm.sortOrder}
                onChange={(e) => setCatForm((f) => ({ ...f, sortOrder: e.target.value }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label>
              <Input
                value={catForm.name}
                onChange={(e) => setCatForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('مثال: أطباق رئيسية', 'e.g. Main Dishes', lang)}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label>
              <Input
                value={catForm.nameEn}
                onChange={(e) => setCatForm((f) => ({ ...f, nameEn: e.target.value }))}
                dir="ltr"
                placeholder="e.g. Main Dishes"
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border p-2.5">
              <Label className="text-sm">{t('قسم نشط', 'Active', lang)}</Label>
              <Switch
                checked={!!catForm.isActive}
                onCheckedChange={(v) => setCatForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCatDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={saveCategory} disabled={catSaving} className="bg-amber-600 hover:bg-amber-700">
              {catSaving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════ حوار إضافة/تعديل وجبة ════════════ */}
      <Dialog open={itemDialogOpen} onOpenChange={setItemDialogOpen}>
        <DialogContent className="max-w-2xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle>
              {itemEditing ? t('تعديل الوجبة', 'Edit Item', lang) : t('إضافة وجبة', 'Add Item', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3 py-2">
            <div className="space-y-1">
              <Label>{t('الرمز', 'Code', lang)}</Label>
              <Input value={itemForm.code} readOnly className="bg-muted font-mono" />
            </div>
            <div className="space-y-1">
              <Label>{t('القسم', 'Category', lang)} *</Label>
              <Select
                value={itemForm.categoryId}
                onValueChange={(v) => setItemForm((f) => ({ ...f, categoryId: v }))}
              >
                <SelectTrigger><SelectValue placeholder={t('اختر القسم', 'Select category', lang)} /></SelectTrigger>
                <SelectContent>
                  {categories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}{c.nameEn ? ` — ${c.nameEn}` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الاسم (عربي)', 'Name (Arabic)', lang)} *</Label>
              <Input
                value={itemForm.name}
                onChange={(e) => setItemForm((f) => ({ ...f, name: e.target.value }))}
                placeholder={t('مثال: برجر لحم', 'e.g. Beef Burger', lang)}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('الاسم (إنجليزي)', 'Name (English)', lang)}</Label>
              <Input
                value={itemForm.nameEn}
                onChange={(e) => setItemForm((f) => ({ ...f, nameEn: e.target.value }))}
                dir="ltr"
                placeholder="e.g. Beef Burger"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('سعر الشراء', 'Cost Price', lang)}</Label>
              <Input
                type="number" min="0" step="0.01"
                value={itemForm.costPrice}
                onChange={(e) => setItemForm((f) => ({ ...f, costPrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('سعر البيع', 'Sale Price', lang)} *</Label>
              <Input
                type="number" min="0" step="0.01"
                value={itemForm.salePrice}
                onChange={(e) => setItemForm((f) => ({ ...f, salePrice: e.target.value }))}
                placeholder="0.00"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('الوحدة', 'Unit', lang)}</Label>
              <Input
                value={itemForm.unit}
                onChange={(e) => setItemForm((f) => ({ ...f, unit: e.target.value }))}
                placeholder={t('قطعة، كوب، طبق…', 'pcs, cup, plate…', lang)}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('الكمية الحالية', 'Current Qty', lang)}</Label>
              <Input
                type="number" min="0"
                value={itemForm.quantity}
                onChange={(e) => setItemForm((f) => ({ ...f, quantity: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>{t('حد إعادة الطلب', 'Reorder Level', lang)}</Label>
              <Input
                type="number" min="0"
                value={itemForm.reorderLevel}
                onChange={(e) => setItemForm((f) => ({ ...f, reorderLevel: e.target.value }))}
              />
            </div>
            <div className="col-span-2 flex items-center justify-between rounded-md border p-2.5">
              <Label className="text-sm">{t('وجبة نشطة', 'Active', lang)}</Label>
              <Switch
                checked={!!itemForm.isActive}
                onCheckedChange={(v) => setItemForm((f) => ({ ...f, isActive: v }))}
              />
            </div>
            <div className="space-y-1 col-span-2">
              <Label>{t('ملاحظات', 'Notes', lang)}</Label>
              <Input
                value={itemForm.notes}
                onChange={(e) => setItemForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder={t('مكونات، وصف…', 'Ingredients, description…', lang)}
              />
            </div>
            {/* معاينة هامش الربح */}
            <div className="col-span-2 text-xs text-muted-foreground bg-slate-50 border rounded-md p-2">
              {t('هامش الربح المتوقع', 'Expected profit margin', lang)}:{' '}
              <strong className="text-emerald-700">
                {formatCurrency(
                  Math.max(0, (parseFloat(itemForm.salePrice) || 0) - (parseFloat(itemForm.costPrice) || 0)),
                  lang
                )}
              </strong>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setItemDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            {itemEditing ? (
              <Button onClick={saveItem} disabled={itemSaving} className="bg-amber-600 hover:bg-amber-700">
                {itemSaving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
              </Button>
            ) : (
              <>
                <Button onClick={saveItem} disabled={itemSaving} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
                  {itemSaving ? <RefreshCw className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
                  {itemSaving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ وإضافة جديد', 'Save & Add New', lang)}
                </Button>
                <Button onClick={saveAndClose} disabled={itemSaving} variant="outline">
                  {t('حفظ وإغلاق', 'Save & Close', lang)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ════════════ حوار معاينة الاستيراد ════════════ */}
      <Dialog open={!!importPreview} onOpenChange={(o) => { if (!importing) setImportPreview(o ? importPreview : null); }}>
        <DialogContent className="max-w-3xl" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Upload className="size-5 text-amber-600" />
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
                    <TableHead>categoryId</TableHead>
                    <TableHead className="text-end">costPrice</TableHead>
                    <TableHead className="text-end">salePrice</TableHead>
                    <TableHead>unit</TableHead>
                    <TableHead className="text-center">{t('الحالة', 'Status', lang)}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {importPreview?.map((r, idx) => {
                    const matchedCat = catById.get(r.categoryId);
                    const valid = !!(r.name && (matchedCat || r.categoryId));
                    return (
                      <TableRow key={idx} className={valid ? '' : 'bg-rose-50'}>
                        <TableCell className="text-xs text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="font-mono text-xs">{r.code || '—'}</TableCell>
                        <TableCell className="text-sm">{r.name || <span className="text-rose-600">—</span>}</TableCell>
                        <TableCell className="text-xs text-muted-foreground" dir="ltr">{r.nameEn || ''}</TableCell>
                        <TableCell className="text-xs">
                          {matchedCat ? (
                            <span className="text-emerald-700">{matchedCat.name}</span>
                          ) : (
                            <span className="text-rose-600">{r.categoryId || t('غير معروف', 'unknown', lang)}</span>
                          )}
                        </TableCell>
                        <TableCell className="text-end text-xs">{r.costPrice || 0}</TableCell>
                        <TableCell className="text-end text-xs font-semibold">{r.salePrice || 0}</TableCell>
                        <TableCell className="text-xs">{r.unit || '—'}</TableCell>
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
                  'الصفوف التي لا تحتوي على اسم أو قسم صالح سيتم تخطّيها تلقائياً.',
                  'Rows missing a valid name or category will be skipped automatically.',
                  lang
                )}
              </span>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportPreview(null)} disabled={importing}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={confirmImport} disabled={importing} className="bg-amber-600 hover:bg-amber-700 gap-1.5">
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

      {/* ════════════ تأكيد الحذف ════════════ */}
      <ConfirmDialog
        open={!!catDelete}
        onOpenChange={(o) => !o && setCatDelete(null)}
        title={t('حذف القسم', 'Delete Category', lang)}
        description={
          catDelete
            ? t(
                `سيتم حذف القسم "${catDelete.name}" نهائياً.`,
                `Category "${catDelete.name}" will be permanently deleted.`,
                lang
              )
            : ''
        }
        onConfirm={removeCategory}
        confirmLabel={t('حذف', 'Delete', lang)}
      />
      <ConfirmDialog
        open={!!itemDelete}
        onOpenChange={(o) => !o && setItemDelete(null)}
        title={t('حذف الوجبة', 'Delete Item', lang)}
        description={
          itemDelete
            ? t(
                `سيتم حذف الوجبة "${itemDelete.name}" نهائياً.`,
                `Item "${itemDelete.name}" will be permanently deleted.`,
                lang
              )
            : ''
        }
        onConfirm={removeItem}
        confirmLabel={t('حذف', 'Delete', lang)}
      />
    </ModuleLayout>
  );
}
