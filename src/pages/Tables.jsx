import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus, RefreshCw, Users, MoreVertical, Pencil, Trash2, Play,
  Sparkles, Clock, ArrowLeft, ArrowRight, LayoutGrid, Store,
  Layers, FileEdit,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import {
  TABLE_STATUS, getBranchTables, getBranchTableStats,
  addTable, updateTable, deleteTable,
  freeTable, reserveTable, setTableAvailable, clearTableDraft,
  lockTableDB, loadBranchTablesFromDB,
} from '@/lib/tables';
import { useAuth } from '@/lib/AuthContext';
import { getBranchSettings, setBranchSettings } from '@/lib/branchSettings';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// شاشة الطاولات — شبكة بصرية لطاولات الفرع النشط.
// كل طاولة لها حالة ملونة (متاحة، مشغولة، محجوزة، تنظيف، مسودة).
// يدعم: إعادة استئناف المسودة، أعمدة قابلة للضبط، إضافة متعددة.
// ═══════════════════════════════════════════════════════════════════════

const FILTERS = [
  { key: 'ALL',        ar: 'الكل',       en: 'All' },
  { key: 'AVAILABLE',  ar: 'متاحة',      en: 'Available' },
  { key: 'OCCUPIED',   ar: 'مشغولة',     en: 'Occupied' },
  { key: 'DRAFT',      ar: 'مسودة',      en: 'Draft' },
  { key: 'RESERVED',   ar: 'محجوزة',     en: 'Reserved' },
  { key: 'CLEANING',   ar: 'تنظيف',      en: 'Cleaning' },
];

// خريطة عدد الطاولات في كل صف ↔ كلاسات Tailwind.
const GRID_BY_PER_ROW = {
  3: 'grid-cols-2 sm:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-6',
  8: 'grid-cols-2 sm:grid-cols-4 lg:grid-cols-8',
};

const PER_ROW_OPTIONS = [3, 4, 5, 6, 8];

export default function Tables() {
  const { lang, activeProjectId, activeProjectName, setActiveItem } = useStore();
  const { user: currentUser } = useAuth();
  const OpenArrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  const [tables, setTables] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editId, setEditId] = useState(null);
  const [form, setForm] = useState({ name: '', seats: 4 });
  const [bulkForm, setBulkForm] = useState({ count: 5, prefix: 'طاولة', seats: 4 });
  const [saving, setSaving] = useState(false);
  // عدد الطاولات في كل صف — يُقرأ من branchSettings ويعاد للواجهة فوراً عند التغيير.
  const [tablesPerRow, setTablesPerRow] = useState(6);
  // نخزّن كائن إعدادات الفرع الكامل لعرض branchName (اسم الفرع المخصّص) بشكل صحيح.
  // ملاحظة سابقة: كان يُستدعى getBranchSettings (async) بشكل تزامني في الـ render،
  // فيكون branchSettings عبارة عن Promise و branchName دائماً undefined.
  const [branchSettings, setBranchSettingsState] = useState({});

  // ─── تحميل الطاولات ─────────────────────────────────────────────────
  const load = useCallback(() => {
    if (!activeProjectId) { setTables([]); setLoading(false); return; }
    setLoading(true);
    try {
      setTables(getBranchTables(activeProjectId));
    } catch (e) {
      console.warn('Tables load failed:', e);
      setTables([]);
    } finally {
      setLoading(false);
    }
  }, [activeProjectId]);

  useEffect(() => { load(); }, [load]);

  // قراءة إعداد عدد الطاولات في كل صف من إعدادات الفرع.
  // ملاحظة: getBranchSettings دالة async — يجب await داخل useEffect.
  // نُخزّن كائن الإعدادات كاملاً لاستخدام branchName في عرض الترويسة.
  useEffect(() => {
    if (!activeProjectId) { setTablesPerRow(6); setBranchSettingsState({}); return; }
    let active = true;
    (async () => {
      try {
        const s = await getBranchSettings(activeProjectId);
        if (!active) return;
        setBranchSettingsState(s || {});
        const v = Number(s?.tablesPerRow);
        setTablesPerRow(PER_ROW_OPTIONS.includes(v) ? v : 6);
      } catch {
        if (active) { setTablesPerRow(6); setBranchSettingsState({}); }
      }
    })();
    return () => { active = false; };
  }, [activeProjectId]);

  // إعادة التحميل عند العودة للنافذة (auto-refresh on focus)
  useEffect(() => {
    const handler = () => load();
    window.addEventListener('focus', handler);
    return () => window.removeEventListener('focus', handler);
  }, [load]);

  const stats = useMemo(() => getBranchTableStats(activeProjectId), [tables, activeProjectId]);

  const filtered = useMemo(() => {
    if (filter === 'ALL') return tables;
    return tables.filter(t => t.status === filter);
  }, [tables, filter]);

  const gridClass = GRID_BY_PER_ROW[tablesPerRow] || GRID_BY_PER_ROW[6];

  // ─── إجراءات ─────────────────────────────────────────────────────────
  const openNew = () => {
    setEditId(null);
    setForm({
      name: `${t('طاولة', 'Table', lang)} ${(tables.length || 0) + 1}`,
      seats: 4,
    });
    setDialogOpen(true);
  };

  const openBulk = () => {
    setBulkForm({ count: 5, prefix: t('طاولة', 'Table', lang), seats: 4 });
    setBulkOpen(true);
  };

  const openEdit = (table) => {
    setEditId(table.id);
    setForm({ name: table.name, seats: table.seats || 4 });
    setDialogOpen(true);
  };

  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  // الطاولة المرشّحة للحذف (لعرض اسمها وحالتها في نافذة التأكيد).
  const tableToDelete = useMemo(
    () => tables.find(t => t.id === deleteId) || null,
    [tables, deleteId]
  );

  const save = () => {
    if (!form.name || !form.name.trim()) {
      toast.error(t('الرجاء إدخال اسم الطاولة', 'Please enter a table name', lang));
      return;
    }
    setSaving(true);
    try {
      const seats = parseInt(form.seats) || 1;
      if (editId) {
        updateTable(editId, { name: form.name.trim(), seats });
        toast.success(t('تم تحديث الطاولة', 'Table updated', lang));
      } else {
        addTable(activeProjectId, { name: form.name.trim(), seats });
        toast.success(t('تمت إضافة الطاولة', 'Table added', lang));
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang));
    } finally {
      setSaving(false);
    }
  };

  // إضافة متعددة — تنشئ N طاولات بالبادئة المعطاة.
  const saveBulk = () => {
    const count = parseInt(bulkForm.count) || 0;
    if (count <= 0 || count > 200) {
      toast.error(t('عدد الطاولات يجب أن يكون بين 1 و 200', 'Count must be 1–200', lang));
      return;
    }
    const prefix = (bulkForm.prefix || t('طاولة', 'Table', lang)).trim();
    if (!prefix) {
      toast.error(t('الرجاء إدخال بادئة الاسم', 'Please enter a name prefix', lang));
      return;
    }
    const seats = parseInt(bulkForm.seats) || 1;
    setSaving(true);
    try {
      const start = (tables.length || 0) + 1;
      let created = 0;
      for (let i = 0; i < count; i++) {
        addTable(activeProjectId, { name: `${prefix} ${start + i}`, seats });
        created++;
      }
      toast.success(t(`تمت إضافة ${created} طاولات`, `Added ${created} tables`, lang));
      setBulkOpen(false);
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang));
    } finally {
      setSaving(false);
    }
  };

  const remove = () => {
    try {
      deleteTable(deleteId);
      toast.success(t('تم حذف الطاولة', 'Table deleted', lang));
      load();
    } catch (e) {
      toast.error(e?.message || t('فشل الحفظ', 'Delete failed', lang));
    }
  };

  // حفظ عدد الطاولات في كل صف في إعدادات الفرع.
  const changePerRow = (value) => {
    const v = Number(value);
    if (!PER_ROW_OPTIONS.includes(v)) return;
    setTablesPerRow(v);
    try {
      setBranchSettings(activeProjectId, { tablesPerRow: v });
      toast.success(t('تم تحديث عدد الطاولات في كل صف', 'Tables per row updated', lang));
    } catch (e) {
      toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang));
    }
  };

  // فتح POS للطاولة: AVAILABLE أو OCCUPIED أو DRAFT.
  // لا نشغل الطاولة عند مجرد الدخول — تبقى AVAILABLE حتى تُضاف أول صنف
  // (حينها يحوّلها الحفظ التلقائي في POS إلى DRAFT). هذا يمنع "حجز" الطاولة
  // بمجرد فتحها ويسمح بتعديلها/حذفها ما لم يوجد طلب فعلي.
  //
  // مهم: نأخذ قفل متفائل على الخادم قبل الفتح — إن كانت الطاولة مفتوحة على جهاز آخر
  // (قفل نشط)، نُنبّه المستخدم ونمنع الفتح لتفادي تضارب جهازين على نفس الطاولة.
  const openPOS = async (table) => {
    // تحقق من القفل عبر الخادم قبل الفتح.
    if (activeProjectId && table?.id) {
      try {
        const lockResult = await lockTableDB(activeProjectId, table.id, currentUser);
        if (!lockResult.ok) {
          toast.error(t(
            `هذه الطاولة مفتوحة حالياً على جهاز آخر (${lockResult.conflictBy || ''})`,
            `This table is currently opened on another device (${lockResult.conflictBy || ''})`,
            lang
          ));
          return;
        }
      } catch {
        // فشل التحقق من القفل لا يمنع الفتح (نسمح بالعمل دون اتصال) لكن نُنبّه.
        console.warn('lockTableDB check failed — proceeding without lock');
      }
    }
    try {
      localStorage.setItem('pos-active-table', JSON.stringify({
        tableId: table.id,
        tableName: table.name,
        branchId: activeProjectId,
        invoiceId: table.currentInvoiceId || null,
      }));
    } catch { /* ignore */ }
    // لا occupyTable هنا — POS سيقرأ المسودة/الإيصال الحالي إن وُجد.
    setActiveItem('pos');
  };

  // قائمة إجراءات الطاولة (محجوزة/تنظيف)
  const handleAction = (table, action) => {
    try {
      switch (action) {
        case 'free':
          // مسودة → امسح المسودة وأعد الطاولة متاحة مباشرة. غير ذلك → تنظيف.
          if (table.status === 'DRAFT') {
            clearTableDraft(table.id);
            toast.success(t('تم تحرير الطاولة ومسح المسودة', 'Table freed and draft cleared', lang));
          } else {
            freeTable(table.id, true);
            toast.success(t('تم تحرير الطاولة (قيد التنظيف)', 'Table freed (cleaning)', lang));
          }
          break;
        case 'cleaning-done':
          setTableAvailable(table.id);
          toast.success(t('الطاولة جاهزة (متاحة)', 'Table ready (available)', lang));
          break;
        case 'reserve':
          reserveTable(table.id);
          toast.success(t('تم حجز الطاولة', 'Table reserved', lang));
          break;
        case 'delete':
          askDelete(table.id);
          return;
        default:
          break;
      }
      load();
    } catch (e) {
      toast.error(e?.message || t('فشلت العملية', 'Action failed', lang));
    }
  };

  // تنسيق وقت آخر تحديث للمسودة.
  const formatDraftTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return '';
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      return `${hh}:${mm}`;
    } catch { return ''; }
  };

  // ─── لا يوجد فرع محدد ─────────────────────────────────────────────
  if (!activeProjectId) {
    return (
      <ModuleLayout
        title={t('الطاولات', 'Tables', lang)}
        subtitle={t('اختر فرعاً لعرض طاولاته', 'Select a branch to view its tables', lang)}
      >
        <Card className="p-12 text-center">
          <Store className="size-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium mb-4">
            {t('الرجاء اختيار فرع أولاً', 'Please select a branch first', lang)}
          </p>
          <Button onClick={() => setActiveItem('branches')} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Store className="size-4" />
            {t('اختيار فرع', 'Select Branch', lang)}
          </Button>
        </Card>
      </ModuleLayout>
    );
  }

  // branchSettings يُحمَّل الآن بشكل async عبر useEffect أعلاه (وليس استدعاءً تزامنياً).
  const branchLabel = activeProjectName || branchSettings.branchName || t('الفرع', 'Branch', lang);

  // ─── عرض ───────────────────────────────────────────────────────────
  return (
    <ModuleLayout
      title={t('الطاولات', 'Tables', lang)}
      subtitle={`${branchLabel} — ${t('إدارة طاولات الفرع', 'Manage branch tables', lang)}`}
      actions={
        <div className="flex items-center gap-2">
          <Button onClick={openBulk} variant="outline" className="gap-2">
            <Layers className="size-4" /> {t('إضافة متعددة', 'Bulk Add', lang)}
          </Button>
          <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
            <Plus className="size-4" /> {t('طاولة جديدة', 'New Table', lang)}
          </Button>
        </div>
      }
    >
      {/* شريط الإحصائيات + الفلترة + عدد الأعمدة */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">
            {t('الإجمالي', 'Total', lang)}:
            <span className="font-bold text-foreground ms-1">{stats.total}</span>
          </span>
          {[
            { k: 'AVAILABLE', n: stats.available, label: t('متاحة', 'Available', lang) },
            { k: 'OCCUPIED',  n: stats.occupied,  label: t('مشغولة', 'Occupied', lang) },
            { k: 'DRAFT',     n: stats.draft,     label: t('مسودة', 'Draft', lang) },
            { k: 'RESERVED',  n: stats.reserved,  label: t('محجوزة', 'Reserved', lang) },
            { k: 'CLEANING',  n: stats.cleaning,  label: t('تنظيف', 'Cleaning', lang) },
          ].map(s => (
            <span
              key={s.k}
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium ${TABLE_STATUS[s.k].color}`}
            >
              {s.label}: <span className="font-bold">{s.n}</span>
            </span>
          ))}
        </div>
        <div className="sm:ms-auto flex items-center gap-2">
          <Select value={filter} onValueChange={setFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              {FILTERS.map(f => (
                <SelectItem key={f.key} value={f.key}>
                  {lang === 'ar' ? f.ar : f.en}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(tablesPerRow)} onValueChange={changePerRow}>
            <SelectTrigger className="w-40 gap-1" title={t('طاولات لكل صف', 'Tables per row', lang)}>
              <LayoutGrid className="size-3.5 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PER_ROW_OPTIONS.map(n => (
                <SelectItem key={n} value={String(n)}>{n} {t('لكل صف', '/ row', lang)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={load}>
            <RefreshCw className="size-4" />
          </Button>
        </div>
      </div>

      {/* شبكة الطاولات */}
      {loading ? (
        <div className={`grid ${gridClass} gap-3`}>
          {Array.from({ length: 12 }).map((_, i) => (
            <Card key={i} className="p-4 h-32 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <LayoutGrid className="size-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium">
            {t('لا توجد طاولات', 'No tables found', lang)}
          </p>
          <p className="text-xs text-muted-foreground mt-1 mb-4">
            {t('أضف طاولات جديدة لهذا الفرع للبدء.', 'Add new tables to this branch to get started.', lang)}
          </p>
          <div className="flex items-center justify-center gap-2">
            <Button onClick={openBulk} variant="outline" className="gap-2">
              <Layers className="size-4" /> {t('إضافة متعددة', 'Bulk Add', lang)}
            </Button>
            <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Plus className="size-4" /> {t('طاولة جديدة', 'New Table', lang)}
            </Button>
          </div>
        </Card>
      ) : (
        <div className={`grid ${gridClass} gap-3`}>
          {filtered.map(table => {
            const status = TABLE_STATUS[table.status] || TABLE_STATUS.AVAILABLE;
            const isOccupied = table.status === 'OCCUPIED';
            const isDraft = table.status === 'DRAFT';
            const isReserved = table.status === 'RESERVED';
            const isCleaning = table.status === 'CLEANING';
            const canOpenPOS = table.status === 'AVAILABLE' || isOccupied || isDraft;
            const draftItemsCount = isDraft && table.draft?.cart ? table.draft.cart.length : 0;
            const draftTime = isDraft && table.draft?.updatedAt ? formatDraftTime(table.draft.updatedAt) : '';
            return (
              <Card
                key={table.id}
                className={`p-0 overflow-hidden border-2 transition-all hover:shadow-md ${canOpenPOS ? 'cursor-pointer hover:border-emerald-400' : ''}`}
                onClick={() => canOpenPOS && openPOS(table)}
              >
                {/* رأس الطاولة — حالة ملونة */}
                <div className={`px-2 py-1.5 text-center text-[11px] font-bold border-b ${status.color}`}>
                  {lang === 'ar' ? status.ar : status.en}
                </div>
                {/* جسم الطاولة */}
                <div className="p-3 text-center space-y-1">
                  <div className="text-base font-bold text-foreground truncate">{table.name}</div>
                  <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
                    <Users className="size-3" />
                    <span>{table.seats} {t('مقعد', 'seats', lang)}</span>
                  </div>
                  {isOccupied && table.currentInvoiceId && (
                    <div className="text-[10px] font-mono text-rose-600 truncate" dir="ltr">
                      #{String(table.currentInvoiceId).slice(-8)}
                    </div>
                  )}
                  {isDraft && (
                    <div className="space-y-0.5 pt-0.5">
                      <div className="inline-flex items-center gap-1 rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200">
                        <FileEdit className="size-2.5" />
                        {t('مسودة', 'Draft', lang)}
                        <span className="ms-0.5">· {draftItemsCount} {t('صنف', 'items', lang)}</span>
                      </div>
                      {draftTime && (
                        <div className="text-[9px] text-muted-foreground/80" dir="ltr">
                          {t('آخر تحديث', 'Updated', lang)}: {draftTime}
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {/* تذييل الطاولة — قائمة إجراءات */}
                <div className="border-t bg-muted/20 px-2 py-1 flex items-center justify-between">
                  {canOpenPOS ? (
                    <Button
                      size="sm"
                      className="h-6 text-[11px] gap-1 bg-emerald-600 hover:bg-emerald-700 w-full"
                      onClick={(e) => { e.stopPropagation(); openPOS(table); }}
                    >
                      {isDraft
                        ? t('متابعة المسودة', 'Resume Draft', lang)
                        : isOccupied
                          ? t('متابعة', 'Resume', lang)
                          : t('فتح', 'Open', lang)}
                      <OpenArrow className="size-3" />
                    </Button>
                  ) : (
                    <span className="text-[10px] text-muted-foreground flex-1 text-center">
                      {isReserved ? t('محجوزة', 'Reserved', lang) : t('قيد التنظيف', 'Cleaning', lang)}
                    </span>
                  )}
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost" size="icon"
                        className="size-7 shrink-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <MoreVertical className="size-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-44">
                      <DropdownMenuItem onClick={() => openEdit(table)} className="gap-2 text-xs">
                        <Pencil className="size-3.5" /> {t('تعديل', 'Edit', lang)}
                      </DropdownMenuItem>
                      {(isReserved || isOccupied || isDraft) && (
                        <DropdownMenuItem onClick={() => handleAction(table, 'free')} className="gap-2 text-xs">
                          <Play className="size-3.5" /> {t('تحرير الطاولة', 'Free Table', lang)}
                        </DropdownMenuItem>
                      )}
                      {isCleaning && (
                        <DropdownMenuItem onClick={() => handleAction(table, 'cleaning-done')} className="gap-2 text-xs">
                          <Sparkles className="size-3.5" /> {t('تنظيف جاهز', 'Cleaning Done', lang)}
                        </DropdownMenuItem>
                      )}
                      {(table.status === 'AVAILABLE' || isOccupied) && (
                        <DropdownMenuItem onClick={() => handleAction(table, 'reserve')} className="gap-2 text-xs">
                          <Clock className="size-3.5" /> {t('حجز', 'Reserve', lang)}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onClick={() => handleAction(table, 'delete')}
                        className="gap-2 text-xs text-destructive focus:text-destructive"
                      >
                        <Trash2 className="size-3.5" /> {t('حذف', 'Delete', lang)}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── نافذة إضافة/تعديل طاولة ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editId ? t('تعديل الطاولة', 'Edit Table', lang) : t('طاولة جديدة', 'New Table', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('اسم الطاولة', 'Table Name', lang)} *</Label>
              <Input
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder={t('مثال: طاولة 1', 'e.g. Table 1', lang)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('عدد المقاعد', 'Number of Seats', lang)}</Label>
              <Input
                type="number" min="1" max="30"
                value={form.seats}
                onChange={e => setForm(f => ({ ...f, seats: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={save} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── نافذة الإضافة المتعددة ───────────────────────────────────── */}
      <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="size-4" />
              {t('إضافة طاولات متعددة', 'Bulk Add Tables', lang)}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label>{t('عدد الطاولات', 'Number of Tables', lang)}</Label>
              <Input
                type="number" min="1" max="200"
                value={bulkForm.count}
                onChange={e => setBulkForm(f => ({ ...f, count: e.target.value }))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>{t('بادئة الاسم', 'Name Prefix', lang)}</Label>
              <Input
                value={bulkForm.prefix}
                onChange={e => setBulkForm(f => ({ ...f, prefix: e.target.value }))}
                placeholder={t('مثال: طاولة', 'e.g. Table', lang)}
              />
              <p className="text-[11px] text-muted-foreground">
                {t('سيتم إنشاء أسماء مثل:', 'Will create names like:', lang)}{' '}
                <span className="font-mono">{(bulkForm.prefix || 'طاولة').trim()} 1، {(bulkForm.prefix || 'طاولة').trim()} 2 …</span>
              </p>
            </div>
            <div className="space-y-1.5">
              <Label>{t('عدد المقاعد لكل طاولة', 'Seats per Table', lang)}</Label>
              <Input
                type="number" min="1" max="30"
                value={bulkForm.seats}
                onChange={e => setBulkForm(f => ({ ...f, seats: e.target.value }))}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button onClick={saveBulk} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('إضافة', 'Add', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('حذف الطاولة', 'Delete Table', lang)}
        description={
          tableToDelete
            ? (tableToDelete.status === 'OCCUPIED' || tableToDelete.status === 'DRAFT')
              ? t(
                  `الطاولة "${tableToDelete.name}" عليها طلب مفتوح — سيُحذف الطلب مع الطاولة نهائياً. هل أنت متأكد؟`,
                  `Table "${tableToDelete.name}" has an open order — the order will be deleted along with the table. Are you sure?`,
                  lang
                )
              : t(
                  `سيتم حذف الطاولة "${tableToDelete.name}" نهائياً. هل أنت متأكد؟`,
                  `Table "${tableToDelete.name}" will be permanently deleted. Are you sure?`,
                  lang
                )
            : t(
                'سيتم حذف الطاولة نهائياً. هل أنت متأكد؟',
                'This table will be permanently deleted. Are you sure?',
                lang
              )
        }
        onConfirm={remove}
        confirmLabel={t('حذف', 'Delete', lang)}
      />
    </ModuleLayout>
  );
}