import React, { useState, useEffect, useMemo } from 'react';
import {
  Plus, Search, Pencil, Trash2, RefreshCw, Store, Phone, MapPin,
  CreditCard, LayoutGrid, ArrowLeft, ArrowRight, Settings as SettingsIcon,
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import {
  t, PROJECT_STATUS, nextCodeFromList,
} from '@/lib/utils-binaa';
import ModuleLayout from '@/components/shared/ModuleLayout';
import ConfirmDialog from '@/components/shared/ConfirmDialog';
import {
  getBranchSettings, setBranchSettings, autoCreatePOS, deleteBranchSettings,
} from '@/lib/branchSettings';
import { createDefaultTables, deleteBranchTables, getBranchTableStats } from '@/lib/tables';
import { toast } from 'sonner';

// ═══════════════════════════════════════════════════════════════════════
// إدارة الفروع — كل فرع هو Project (كيان base44) مع إعداداته الخاصة
// (شعار، هاتف، عنوان، نقطة بيع، طاولات) في localStorage.
// ═══════════════════════════════════════════════════════════════════════

const emptyForm = {
  code: '', name: '', nameAr: '', location: '', description: '',
  status: 'ACTIVE', projectType: 'CONSTRUCTION', contractValue: 0,
  startDate: '', endDate: '',
};

// إعدادات فرع إضافية تُحرّر في نفس نافذة التعديل
const emptySettings = {
  branchName: '', branchNameEn: '', phone: '', phone2: '', address: '',
  city: '', logoUrl: '', vatNumber: '', managerName: '',
  primaryColor: '#d97706', accentColor: '#1f2d3d',
};

export default function Branches() {
  const { lang, setProjectContext, setActiveItem } = useStore();
  const OpenArrow = lang === 'ar' ? ArrowLeft : ArrowRight;

  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteId, setDeleteId] = useState(null);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [branchSettingsForm, setBranchSettingsForm] = useState(emptySettings);
  const [saving, setSaving] = useState(false);

  // ─── تحميل الفروع ──────────────────────────────────────────────────
  const load = async () => {
    setLoading(true);
    try {
      const rows = await base44.entities.Project.list('-created_date', 200);
      setItems(Array.isArray(rows) ? rows : []);
    } catch (e) {
      console.warn('Branch list load failed:', e);
      setItems([]);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  // فلترة بحسب البحث والحالة
  const filtered = useMemo(() => {
    return items.filter(i => {
      const q = search.toLowerCase();
      const matchSearch = !q ||
        String(i.name || '').toLowerCase().includes(q) ||
        String(i.code || '').toLowerCase().includes(q) ||
        String(i.location || '').toLowerCase().includes(q);
      return matchSearch && (filterStatus === 'ALL' || i.status === filterStatus);
    });
  }, [items, search, filterStatus]);

  // ─── إجراءات CRUD ──────────────────────────────────────────────────
  const openNew = () => {
    setEditing(null);
    setForm({ ...emptyForm, code: nextCodeFromList(items, 'BR'), status: 'ACTIVE' });
    setBranchSettingsForm({ ...emptySettings });
    setDialogOpen(true);
  };

  const openEdit = (item) => {
    setEditing(item);
    setForm({
      ...emptyForm, ...item,
      contractValue: item.contractValue || 0,
    });
    setBranchSettingsForm({ ...emptySettings, ...getBranchSettings(item.id) });
    setDialogOpen(true);
  };

  const askDelete = (id) => { setDeleteId(id); setConfirmOpen(true); };

  const save = async () => {
    if (!form.name || !form.name.trim()) {
      toast.error(t('الرجاء إدخال اسم الفرع', 'Please enter a branch name', lang));
      return;
    }
    setSaving(true);
    try {
      const payload = {
        ...form,
        code: form.code || nextCodeFromList(items, 'BR'),
        contractValue: parseFloat(form.contractValue) || 0,
        projectType: form.projectType || 'CONSTRUCTION',
        status: form.status || 'ACTIVE',
      };

      if (editing) {
        // تحديث الفرع + إعداداته
        await base44.entities.Project.update(editing.id, payload);
        setBranchSettings(editing.id, {
          ...branchSettingsForm,
          branchName: branchSettingsForm.branchName || payload.name,
        });
        toast.success(t('تم تحديث الفرع', 'Branch updated', lang));
      } else {
        // إنشاء فرع جديد + نقطة بيع تلقائية + طاولات افتراضية + إعدادات
        const created = await base44.entities.Project.create(payload);
        const branchId = created?.id;
        if (branchId) {
          const posId = autoCreatePOS(branchId, payload.name);
          createDefaultTables(branchId, 10);
          setBranchSettings(branchId, {
            ...branchSettingsForm,
            branchName: payload.name,
            address: payload.location || branchSettingsForm.address,
            isActive: true,
            posTerminalId: posId,
          });
        }
        toast.success(t('تم إنشاء الفرع مع نقطة البيع و10 طاولات افتراضية', 'Branch created with POS terminal and 10 default tables', lang));
      }
      setDialogOpen(false);
      load();
    } catch (e) {
      console.error('Branch save failed:', e);
      toast.error(e?.message || t('فشل الحفظ', 'Save failed', lang));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    try {
      await base44.entities.Project.delete(deleteId);
      // تنظيف محلي: حذف الإعدادات والطاولات المرتبطة بالفرع
      deleteBranchSettings(deleteId);
      deleteBranchTables(deleteId);
      toast.success(t('تم حذف الفرع وجميع بياناته', 'Branch and its data deleted', lang));
      load();
    } catch (e) {
      console.error('Branch delete failed:', e);
      toast.error(e?.message || t('فشل الحذف', 'Delete failed', lang));
    }
  };

  // فحص الطاولات + فتح الطاولات للفرع
  const openTables = (item) => {
    setProjectContext(item.id, item.name);
    setActiveItem('tables');
  };

  // ─── عرض ───────────────────────────────────────────────────────────
  return (
    <ModuleLayout
      title={t('إدارة الفروع', 'Branch Management', lang)}
      subtitle={t('إدارة فروع المطعم ونقاط البيع والطاولات', 'Manage restaurant branches, POS terminals and tables', lang)}
      actions={
        <Button onClick={openNew} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
          <Plus className="size-4" /> {t('فرع جديد', 'New Branch', lang)}
        </Button>
      }
    >
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('بحث عن فرع...', 'Search branches...', lang)}
            className="ps-9"
          />
        </div>
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">{t('كل الحالات', 'All Status', lang)}</SelectItem>
            {Object.entries(PROJECT_STATUS).map(([k, v]) => (
              <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="icon" onClick={load}>
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {/* شبكة الفروع */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i} className="p-5 h-44 animate-pulse bg-muted/40" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-12 text-center">
          <Store className="size-12 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground font-medium">
            {t('لا توجد فروع بعد', 'No branches yet', lang)}
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            {t('اضغط "فرع جديد" لإنشاء أول فرع — سيتم إنشاء نقطة بيع و10 طاولات افتراضية تلقائياً.',
               'Click "New Branch" to create your first branch — a POS terminal and 10 default tables will be created automatically.',
               lang)}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map(item => {
            const st = PROJECT_STATUS[item.status] || PROJECT_STATUS.PLANNING;
            const settings = getBranchSettings(item.id);
            const stats = getBranchTableStats(item.id);
            return (
              <Card
                key={item.id}
                className="p-0 overflow-hidden hover:shadow-md transition-shadow cursor-pointer group"
                onClick={() => openTables(item)}
              >
                {/* رأس البطاقة */}
                <div
                  className="p-4 border-b"
                  style={{ borderTop: `4px solid ${settings.primaryColor || '#d97706'}` }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      {settings.logoUrl ? (
                        <img
                          src={settings.logoUrl}
                          alt=""
                          className="size-10 rounded-lg object-cover shrink-0"
                          onError={(e) => { e.target.style.display = 'none'; }}
                        />
                      ) : (
                        <div
                          className="size-10 rounded-lg flex items-center justify-center shrink-0 text-white"
                          style={{ background: settings.primaryColor || '#d97706' }}
                        >
                          <Store className="size-5" />
                        </div>
                      )}
                      <div className="min-w-0">
                        <h3 className="font-bold text-foreground truncate">{item.name}</h3>
                        <p className="text-xs text-muted-foreground font-mono">{item.code || '—'}</p>
                      </div>
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium shrink-0 ${st.color}`}>
                      {lang === 'ar' ? st.ar : st.en}
                    </span>
                  </div>
                </div>

                {/* جسم البطاقة */}
                <div className="p-4 space-y-2 text-sm">
                  {item.location && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="size-3.5 shrink-0" />
                      <span className="truncate">{item.location}</span>
                    </div>
                  )}
                  {settings.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="size-3.5 shrink-0" />
                      <span dir="ltr" className="truncate">{settings.phone}</span>
                    </div>
                  )}
                  {settings.posTerminalId && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CreditCard className="size-3.5 shrink-0" />
                      <span className="font-mono text-xs">
                        {t('نقطة البيع', 'POS', lang)}: <span dir="ltr">{settings.posTerminalId}</span>
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <LayoutGrid className="size-3.5 shrink-0" />
                    <span>
                      {t('الطاولات', 'Tables', lang)}: <span className="font-semibold text-foreground">{stats.total}</span>
                      <span className="text-xs">
                        {' '}({t('متاحة', 'avail', lang)} {stats.available}، {t('مشغولة', 'occ', lang)} {stats.occupied})
                      </span>
                    </span>
                  </div>
                </div>

                {/* تذييل البطاقة */}
                <div className="px-4 py-2 bg-muted/30 border-t flex items-center justify-between">
                  <Button
                    size="sm"
                    className="gap-1.5 h-7 bg-emerald-600 hover:bg-emerald-700"
                    onClick={(e) => { e.stopPropagation(); openTables(item); }}
                  >
                    {t('الطاولات', 'Tables', lang)}
                    <OpenArrow className="size-3.5" />
                  </Button>
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost" size="icon" className="size-7"
                      onClick={(e) => { e.stopPropagation(); openEdit(item); }}
                      title={t('تعديل', 'Edit', lang)}
                    >
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      variant="ghost" size="icon" className="size-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); askDelete(item.id); }}
                      title={t('حذف', 'Delete', lang)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <div className="flex items-center gap-4 text-sm text-muted-foreground">
        <span>{filtered.length} {t('فرع', 'branches', lang)}</span>
      </div>

      {/* ─── نافذة الإنشاء/التعديل ─────────────────────────────────── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing
                ? t('تعديل الفرع', 'Edit Branch', lang)
                : t('فرع جديد', 'New Branch', lang)}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* القسم الأساسي */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>{t('كود الفرع', 'Branch Code', lang)} *</Label>
                <Input value={form.code} readOnly className="bg-muted font-mono" placeholder="BR-0001" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('اسم الفرع', 'Branch Name', lang)} *</Label>
                <Input
                  value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                  placeholder={t('مثال: الفرع الرئيسي', 'e.g. Main Branch', lang)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('الاسم بالعربية', 'Arabic Name', lang)}</Label>
                <Input
                  value={form.nameAr || ''}
                  onChange={e => setForm(f => ({ ...f, nameAr: e.target.value }))}
                  dir="rtl"
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('الموقع', 'Location', lang)}</Label>
                <Input
                  value={form.location || ''}
                  onChange={e => setForm(f => ({ ...f, location: e.target.value }))}
                  placeholder={t('الحي، المدينة', 'District, City', lang)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>{t('الحالة', 'Status', lang)}</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(PROJECT_STATUS).map(([k, v]) => (
                      <SelectItem key={k} value={k}>{lang === 'ar' ? v.ar : v.en}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 col-span-2">
                <Label>{t('ملاحظات', 'Notes', lang)}</Label>
                <Textarea
                  value={form.description || ''}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                  rows={2}
                />
              </div>
            </div>

            {/* قسم الإعدادات التفصيلية — يظهر فقط في التعديل */}
            {editing && (
              <div className="border-t pt-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-muted-foreground">
                  <SettingsIcon className="size-4" />
                  {t('إعدادات الفرع التفصيلية', 'Detailed Branch Settings', lang)}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>{t('الاسم الإنجليزي', 'English Name', lang)}</Label>
                    <Input
                      value={branchSettingsForm.branchNameEn}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, branchNameEn: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('اسم المدير', 'Manager Name', lang)}</Label>
                    <Input
                      value={branchSettingsForm.managerName}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, managerName: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('الهاتف', 'Phone', lang)}</Label>
                    <Input
                      value={branchSettingsForm.phone}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, phone: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('هاتف إضافي', 'Phone 2', lang)}</Label>
                    <Input
                      value={branchSettingsForm.phone2}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, phone2: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('المدينة', 'City', lang)}</Label>
                    <Input
                      value={branchSettingsForm.city}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, city: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('العنوان التفصيلي', 'Detailed Address', lang)}</Label>
                    <Input
                      value={branchSettingsForm.address}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, address: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('الرقم الضريبي', 'VAT Number', lang)}</Label>
                    <Input
                      value={branchSettingsForm.vatNumber}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, vatNumber: e.target.value }))}
                      dir="ltr"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('رابط الشعار', 'Logo URL', lang)}</Label>
                    <Input
                      value={branchSettingsForm.logoUrl}
                      onChange={e => setBranchSettingsForm(s => ({ ...s, logoUrl: e.target.value }))}
                      dir="ltr"
                      placeholder="https://..."
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('اللون الأساسي', 'Primary Color', lang)}</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        value={branchSettingsForm.primaryColor}
                        onChange={e => setBranchSettingsForm(s => ({ ...s, primaryColor: e.target.value }))}
                        className="w-12 h-9 p-1"
                      />
                      <Input
                        value={branchSettingsForm.primaryColor}
                        onChange={e => setBranchSettingsForm(s => ({ ...s, primaryColor: e.target.value }))}
                        dir="ltr"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label>{t('اللون الثانوي', 'Accent Color', lang)}</Label>
                    <div className="flex gap-2 items-center">
                      <Input
                        type="color"
                        value={branchSettingsForm.accentColor}
                        onChange={e => setBranchSettingsForm(s => ({ ...s, accentColor: e.target.value }))}
                        className="w-12 h-9 p-1"
                      />
                      <Input
                        value={branchSettingsForm.accentColor}
                        onChange={e => setBranchSettingsForm(s => ({ ...s, accentColor: e.target.value }))}
                        dir="ltr"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              {t('إلغاء', 'Cancel', lang)}
            </Button>
            <Button
              onClick={save}
              disabled={saving}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title={t('حذف الفرع', 'Delete Branch', lang)}
        description={t(
          'سيتم حذف الفرع نهائياً مع إعداداته وطاولاته. لا يمكن التراجع. هل أنت متأكد؟',
          'This branch will be permanently deleted along with its settings and tables. This cannot be undone. Are you sure?',
          lang
        )}
        onConfirm={remove}
        confirmLabel={t('حذف', 'Delete', lang)}
      />
    </ModuleLayout>
  );
}
