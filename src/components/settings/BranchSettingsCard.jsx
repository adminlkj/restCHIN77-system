import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Store, Loader2, Save, Upload, RefreshCw, Image as ImageIcon,
  CreditCard, Eye, Phone, MapPin, User, Palette, Receipt, Settings2,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useBranches } from '@/hooks/useBranches';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import {
  getBranchSettings, setBranchSettings, DEFAULT_BRANCH_SETTINGS,
} from '@/lib/branchSettings';
import ThermalReceiptDocument from '@/components/shared/ThermalReceiptDocument';

// ═══════════════════════════════════════════════════════════════════════
// بطاقة إعدادات الفروع — تتيح اختيار فرع وتحرير إعداداته الخاصة:
//   - اسم الفرع (عربي/إنجليزي)
//   - هاتف، هاتف إضافي، عنوان، مدينة
//   - شعار (رفع صورة)
//   - رقم ضريبي (إن اختلف عن الشركة)
//   - ألوان أساسية وثانوية
//   - اسم المدير
//   - معرّف نقطة البيع (read-only، يُولّد تلقائياً)
// يحفظ في قاعدة البيانات عبر setBranchSettings(branchId, settings).
// يعرض معاينة حيّة لترويسة الإيصال.
// ═══════════════════════════════════════════════════════════════════════

const EMPTY_FORM = {
  ...DEFAULT_BRANCH_SETTINGS,
};

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

const ColorField = ({ label, value, onChange }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    <div className="flex gap-2 items-center">
      <Input
        type="color"
        value={value || '#d97706'}
        onChange={e => onChange(e.target.value)}
        className="w-12 h-9 p-1"
      />
      <Input
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        dir="ltr"
        className="font-mono text-xs"
      />
    </div>
  </div>
);

export default function BranchSettingsCard() {
  const { lang } = useStore();
  const { toast } = useToast();
  const { settings: companySettings } = useCompanySettings();

  const [branches, setBranches] = useState([]);
  // قائمة الفروع من cache مشترك (useBranches) بدلاً من جلبها مستقلة عند كل mount.
  const { branches: cachedBranches, loading: branchesLoading, reload: reloadBranches } = useBranches();
  useEffect(() => { setBranches(cachedBranches); }, [cachedBranches]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  // اختيار أول فرع تلقائيًّا عند توفر القائمة.
  useEffect(() => {
    if (!selectedBranchId && branches.length > 0) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // ─── تحميل قائمة الفروع ────────────────────────────────────────────
  // الفروع تُجلب تلقائيًّا من الـ Hook عند mount. زر التحديث فقط يُعيل الـ cache.

  // ─── تحميل إعدادات الفرع المختار (async) ───────────────────────────
  useEffect(() => {
    if (!selectedBranchId) {
      setForm(EMPTY_FORM);
      return;
    }
    let active = true;
    setSettingsLoading(true);
    getBranchSettings(selectedBranchId)
      .then(s => {
        if (!active) return;
        const branch = branches.find(b => b.id === selectedBranchId);
        setForm({
          ...DEFAULT_BRANCH_SETTINGS,
          ...s,
          branchName: s.branchName || branch?.name || '',
        });
      })
      .catch(() => { if (active) setForm(EMPTY_FORM); })
      .finally(() => { if (active) setSettingsLoading(false); });
    return () => { active = false; };
  }, [selectedBranchId, branches]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  // ─── رفع الشعار ────────────────────────────────────────────────────
  const handleLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('logoUrl', file_url);
      toast({ title: t('تم رفع الشعار', 'Logo uploaded', lang) });
    } catch (err) {
      toast({ title: t('خطأ في الرفع', 'Upload failed', lang), description: err.message, variant: 'destructive' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // ─── رفع شعار الإيصال الحراري (مستقل عن شعار الفرع العام) ─────────
  const thermalFileInputRef = useRef(null);
  const [thermalUploading, setThermalUploading] = useState(false);
  const handleThermalLogoUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setThermalUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set('thermalLogoUrl', file_url);
      set('thermalLogoSource', 'CUSTOM');
      toast({ title: t('تم رفع شعار الإيصال الحراري', 'Thermal logo uploaded', lang) });
    } catch (err) {
      toast({ title: t('خطأ في الرفع', 'Upload failed', lang), description: err.message, variant: 'destructive' });
    } finally {
      setThermalUploading(false);
      if (thermalFileInputRef.current) thermalFileInputRef.current.value = '';
    }
  };

  // ─── معاينة حيّة للإيصال الحراري (تستخدم نفس المكوّن الفعلي) ────────
  // ندمج إعدادات الفرع الحالية مع إعدادات الشركة لإنشاء كائن settings
  // مطابق لما سيستلمه ThermalReceiptDocument عند الطباعة الفعلية.
  const thermalPreviewSettings = useMemo(() => {
    return {
      ...companySettings,
      branchName: form.branchName || '',
      branchNameEn: form.branchNameEn || '',
      phone: form.phone || companySettings.phone || '',
      phone2: form.phone2 || '',
      address: form.address || companySettings.address || '',
      city: form.city || companySettings.city || '',
      logoUrl: form.logoUrl || companySettings.logoUrl || '',
      vatNumber: form.vatNumber || companySettings.vatNumber || '',
      primaryColor: form.primaryColor || companySettings.primaryColor || '#d97706',
      accentColor: form.accentColor || companySettings.accentColor || '#1f2d3d',
      thermalLogoEnabled: form.thermalLogoEnabled !== undefined ? form.thermalLogoEnabled : true,
      thermalLogoSource: form.thermalLogoSource || 'BRANCH',
      thermalLogoUrl: form.thermalLogoUrl || '',
      thermalLogoWidth: Number(form.thermalLogoWidth) || 180,
      thermalLogoHeight: Number(form.thermalLogoHeight) || 90,
      thermalLogoAlign: form.thermalLogoAlign || 'CENTER',
      thermalLogoMarginBottom: Number(form.thermalLogoMarginBottom) || 10,
      thermalLogoFit: form.thermalLogoFit || 'CONTAIN',
    };
  }, [companySettings, form]);

  // فاتورة تجريبية للمعاينة الكاملة للإيصال
  const SAMPLE_RECEIPT = useMemo(() => ({
    invoiceNo: 'INV-PREVIEW',
    date: new Date().toISOString(),
    cashier: t('الكاشير', 'Cashier', lang),
    tableNo: '1',
    lineItems: [
      { description: t('برجر لحم', 'Beef Burger', lang), qty: 2, unitPrice: 35, total: 70 },
      { description: t('بطاطس مقلية', 'French Fries', lang), qty: 1, unitPrice: 15, total: 15 },
    ],
    subtotal: 85,
    vatAmount: 12.75,
    vatRate: 0.15,
    totalAmount: 97.75,
    paidAmount: 100,
    notes: JSON.stringify({ saleType: 'DINE_IN', payments: [{ method: 'cash', amount: 100 }] }),
  }), [lang]);

  // ─── الحفظ ─────────────────────────────────────────────────────────
  const save = async () => {
    if (!selectedBranchId) {
      toast({ title: t('اختر فرعاً أولاً', 'Select a branch first', lang), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, ...payload } = form;
      await setBranchSettings(selectedBranchId, {
        ...payload,
        branchId: selectedBranchId,
        branchName: payload.branchName || branches.find(b => b.id === selectedBranchId)?.name || '',
      });
      toast({ title: t('تم حفظ إعدادات الفرع', 'Branch settings saved', lang) });
    } catch (e) {
      toast({ title: t('خطأ', 'Error', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  // عرض حالة التحميل
  if (branchesLoading) {
    return (
      <Card>
        <CardContent className="py-10 text-center">
          <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  if (branches.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Store className="size-4" />{t('إعدادات الفروع', 'Branch Settings', lang)}
          </CardTitle>
        </CardHeader>
        <CardContent className="text-center py-8 text-muted-foreground">
          <Store className="size-10 mx-auto mb-3 opacity-50" />
          <p>{t('لا توجد فروع بعد. أنشئ فرعاً أولاً من شاشة الفروع.', 'No branches yet. Create a branch first from the Branches screen.', lang)}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Store className="size-4" />{t('إعدادات الفروع', 'Branch Settings', lang)}
        </CardTitle>
        <p className="text-xs text-muted-foreground mt-1">
          {t('كل فرع له إعداداته الخاصة (شعار، هاتف، عنوان، ألوان). اسم الشركة موحّد من إعدادات الشركة.',
             'Each branch has its own settings (logo, phone, address, colors). Company name is unified from Company settings.',
             lang)}
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* اختيار الفرع */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] space-y-1.5">
            <Label className="text-xs">{t('اختر الفرع', 'Select Branch', lang)}</Label>
            <Select value={selectedBranchId} onValueChange={setSelectedBranchId}>
              <SelectTrigger><SelectValue placeholder={t('اختر فرعاً...', 'Select a branch...', lang)} /></SelectTrigger>
              <SelectContent>
                {branches.map(b => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name} {b.code ? <span className="text-muted-foreground ms-1 font-mono text-xs">{b.code}</span> : null}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button variant="outline" size="icon" onClick={reloadBranches} title={t('تحديث', 'Refresh', lang)}>
            <RefreshCw className="size-4" />
          </Button>
        </div>

        {settingsLoading ? (
          <div className="py-10 text-center">
            <Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* قسم: هوية الفرع */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-foreground">{t('هوية الفرع', 'Branch Identity', lang)}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('اسم الفرع (عربي)', 'Branch Name (AR)', lang)}>
                  <Input value={form.branchName || ''} onChange={e => set('branchName', e.target.value)} dir="rtl" />
                </Field>
                <Field label={t('اسم الفرع (إنجليزي)', 'Branch Name (EN)', lang)}>
                  <Input value={form.branchNameEn || ''} onChange={e => set('branchNameEn', e.target.value)} dir="ltr" />
                </Field>
                <Field label={t('اسم المدير', 'Manager Name', lang)}>
                  <div className="relative">
                    <User className="absolute start-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input value={form.managerName || ''} onChange={e => set('managerName', e.target.value)} className="ps-7" />
                  </div>
                </Field>
                <Field label={t('معرّف نقطة البيع (تلقائي)', 'POS Terminal ID (auto)', lang)}>
                  <div className="relative">
                    <CreditCard className="absolute start-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input
                      value={form.posTerminalId || ''}
                      readOnly
                      dir="ltr"
                      className="ps-7 bg-muted font-mono text-xs"
                      placeholder="POS-XXXXXX"
                    />
                  </div>
                </Field>
              </div>
            </div>

            {/* قسم: الشعار العام (يُستخدم في الفاتورة A4 وعرض النظام) */}
            <div>
              <h4 className="text-sm font-semibold mb-1 text-foreground flex items-center gap-2">
                <ImageIcon className="size-4" />{t('شعار الفرع (للفاتورة A4 وعرض النظام)', 'Branch Logo (A4 Invoice & System)', lang)}
              </h4>
              <p className="text-xs text-muted-foreground mb-3">
                {t('هذا الشعار يظهر في الفاتورة A4 ولوحة التحكم. لا يؤثر على الإيصال الحراري (له شعار مستقل بالأسفل).',
                   'This logo appears in A4 invoice & dashboard. Does NOT affect thermal receipt (it has its own logo below).',
                   lang)}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="logo"
                    className="size-20 rounded-lg border p-1 object-contain bg-white"
                    onError={(e) => { e.target.style.display = 'none'; }}
                  />
                ) : (
                  <div className="size-20 rounded-lg border border-dashed flex items-center justify-center text-muted-foreground">
                    <ImageIcon className="size-6" />
                  </div>
                )}
                <div className="flex-1 min-w-[200px] space-y-2">
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    onChange={handleLogoUpload}
                    className="hidden"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-1.5"
                  >
                    {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    {t('رفع صورة', 'Upload Image', lang)}
                  </Button>
                  <Field label={t('أو رابط مباشر', 'Or direct URL', lang)}>
                    <Input value={form.logoUrl || ''} onChange={e => set('logoUrl', e.target.value)} dir="ltr" placeholder="https://..." />
                  </Field>
                </div>
              </div>
            </div>

            {/* قسم: بيانات الاتصال */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-foreground">{t('بيانات الاتصال', 'Contact Info', lang)}</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label={t('الهاتف', 'Phone', lang)}>
                  <div className="relative">
                    <Phone className="absolute start-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} dir="ltr" className="ps-7" />
                  </div>
                </Field>
                <Field label={t('هاتف إضافي', 'Phone 2', lang)}>
                  <Input value={form.phone2 || ''} onChange={e => set('phone2', e.target.value)} dir="ltr" />
                </Field>
                <Field label={t('المدينة', 'City', lang)}>
                  <Input value={form.city || ''} onChange={e => set('city', e.target.value)} />
                </Field>
                <Field label={t('العنوان', 'Address', lang)}>
                  <div className="relative">
                    <MapPin className="absolute start-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                    <Input value={form.address || ''} onChange={e => set('address', e.target.value)} className="ps-7" />
                  </div>
                </Field>
                <Field label={t('الرقم الضريبي (إن اختلف عن الشركة)', 'VAT Number (if different from company)', lang)}>
                  <Input value={form.vatNumber || ''} onChange={e => set('vatNumber', e.target.value)} dir="ltr" placeholder={companySettings.vatNumber || ''} />
                </Field>
              </div>
            </div>

            {/* قسم: الألوان */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                <Palette className="size-4" />{t('ألوان الفرع', 'Branch Colors', lang)}
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <ColorField label={t('اللون الأساسي', 'Primary Color', lang)} value={form.primaryColor} onChange={v => set('primaryColor', v)} />
                <ColorField label={t('اللون الثانوي', 'Accent Color', lang)} value={form.accentColor} onChange={v => set('accentColor', v)} />
              </div>
            </div>

            {/* ════════════════════════════════════════════════════════════
                قسم: إعدادات الإيصال الحراري (مستقلة عن شعار الفاتورة A4)
                نمط احترافي: شعار في الأعلى وسط/يمين/يسار + تحكم بالأبعاد
                حسب نوع الطابعة (58mm أو 80mm)
                ════════════════════════════════════════════════════════════ */}
            <div className="border-t pt-4 mt-4">
              <h4 className="text-sm font-semibold mb-1 text-foreground flex items-center gap-2">
                <Receipt className="size-4 text-amber-600" />
                {t('إعدادات الإيصال الحراري', 'Thermal Receipt Settings', lang)}
              </h4>
              <p className="text-xs text-muted-foreground mb-4">
                {t('شعار مستقل للإيصال الحراري فقط — لا يؤثر على الفاتورة A4 ولا عرض النظام. اختر الشعار والأبعاد والمحاذاة حسب نوع الطابعة (58mm أو 80mm).',
                   'Independent logo for thermal receipt only — does NOT affect A4 invoice or system display. Choose logo, size & alignment per printer type (58mm or 80mm).',
                   lang)}
              </p>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* ─── يمين: عناصر التحكم ─── */}
                <div className="space-y-4">
                  {/* إظهار الشعار */}
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div>
                      <Label className="text-sm font-medium">{t('إظهار شعار الإيصال', 'Show Receipt Logo', lang)}</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {t('إذا أُغلق، لا يظهر أي شعار على الإيصال الحراري.',
                           'If off, no logo is shown on the thermal receipt.',
                           lang)}
                      </p>
                    </div>
                    <Switch
                      checked={form.thermalLogoEnabled !== false}
                      onCheckedChange={(v) => set('thermalLogoEnabled', v)}
                    />
                  </div>

                  {/* مصدر الشعار */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('مصدر الشعار', 'Logo Source', lang)}</Label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => set('thermalLogoSource', 'BRANCH')}
                        className={`flex items-center gap-2 rounded-md border p-2.5 text-xs transition ${
                          (form.thermalLogoSource || 'BRANCH') === 'BRANCH'
                            ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                            : 'border-input hover:bg-accent'
                        }`}
                      >
                        <span className={`size-3 rounded-full border-2 ${(form.thermalLogoSource || 'BRANCH') === 'BRANCH' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'}`} />
                        {t('شعار الفرع', 'Branch Logo', lang)}
                      </button>
                      <button
                        type="button"
                        onClick={() => set('thermalLogoSource', 'CUSTOM')}
                        className={`flex items-center gap-2 rounded-md border p-2.5 text-xs transition ${
                          form.thermalLogoSource === 'CUSTOM'
                            ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200'
                            : 'border-input hover:bg-accent'
                        }`}
                      >
                        <span className={`size-3 rounded-full border-2 ${form.thermalLogoSource === 'CUSTOM' ? 'border-amber-500 bg-amber-500' : 'border-muted-foreground'}`} />
                        {t('شعار خاص بالإيصال', 'Custom Receipt Logo', lang)}
                      </button>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      {t('BRANCH = يستخدم شعار الفرع العام (نفس شعار الفاتورة A4). CUSTOM = شعار مخصص للإيصال فقط.',
                         'BRANCH = uses the branch logo (same as A4 invoice). CUSTOM = a separate logo just for the receipt.',
                         lang)}
                    </p>
                  </div>

                  {/* رفع شعار مخصص (يظهر فقط عند CUSTOM) */}
                  {form.thermalLogoSource === 'CUSTOM' ? (
                    <div className="rounded-md border p-3 space-y-3 bg-muted/30">
                      <Label className="text-xs font-medium">{t('شعار الإيصال المخصص', 'Custom Receipt Logo', lang)}</Label>
                      <div className="flex flex-wrap items-center gap-3">
                        {form.thermalLogoUrl ? (
                          <img
                            src={form.thermalLogoUrl}
                            alt="thermal logo"
                            className="size-16 rounded border p-1 object-contain bg-white"
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div className="size-16 rounded border border-dashed flex items-center justify-center text-muted-foreground">
                            <Receipt className="size-5" />
                          </div>
                        )}
                        <div className="flex-1 min-w-[180px] space-y-2">
                          <input
                            ref={thermalFileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={handleThermalLogoUpload}
                            className="hidden"
                          />
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => thermalFileInputRef.current?.click()}
                            disabled={thermalUploading}
                            className="gap-1.5"
                          >
                            {thermalUploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                            {t('رفع شعار', 'Upload Logo', lang)}
                          </Button>
                          <Input
                            value={form.thermalLogoUrl || ''}
                            onChange={(e) => set('thermalLogoUrl', e.target.value)}
                            dir="ltr"
                            placeholder="https://..."
                            className="text-xs"
                          />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* الأبعاد + المحاذاة */}
                  <div className="grid grid-cols-2 gap-3">
                    <Field label={`${t('عرض الشعار (px)', 'Logo Width (px)', lang)} · max 220`}>
                      <Input
                        type="number"
                        min="40"
                        max="220"
                        value={form.thermalLogoWidth ?? 180}
                        onChange={(e) => set('thermalLogoWidth', Math.min(220, Math.max(40, Number(e.target.value) || 180)))}
                        dir="ltr"
                      />
                    </Field>
                    <Field label={`${t('ارتفاع الشعار (px)', 'Logo Height (px)', lang)} · max 120`}>
                      <Input
                        type="number"
                        min="20"
                        max="120"
                        value={form.thermalLogoHeight ?? 90}
                        onChange={(e) => set('thermalLogoHeight', Math.min(120, Math.max(20, Number(e.target.value) || 90)))}
                        dir="ltr"
                      />
                    </Field>
                  </div>

                  <Field label={t('المسافة أسفل الشعار (px)', 'Logo Bottom Margin (px)', lang)}>
                    <Input
                      type="number"
                      min="0"
                      max="50"
                      value={form.thermalLogoMarginBottom ?? 10}
                      onChange={(e) => set('thermalLogoMarginBottom', Math.max(0, Number(e.target.value) || 0))}
                      dir="ltr"
                    />
                  </Field>

                  {/* المحاذاة */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('محاذاة الشعار', 'Logo Alignment', lang)}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: 'LEFT', label: t('يسار', 'Left', lang) },
                        { v: 'CENTER', label: t('وسط', 'Center', lang) },
                        { v: 'RIGHT', label: t('يمين', 'Right', lang) },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => set('thermalLogoAlign', opt.v)}
                          className={`rounded-md border p-2 text-xs transition ${
                            (form.thermalLogoAlign || 'CENTER') === opt.v
                              ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 font-medium'
                              : 'border-input hover:bg-accent'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* طريقة العرض (Fit) */}
                  <div className="space-y-2">
                    <Label className="text-xs font-medium">{t('طريقة عرض الشعار', 'Logo Fit Mode', lang)}</Label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { v: 'CONTAIN', label: t('احتواء', 'Contain', lang), hint: t('داخل المساحة', 'Inside area') },
                        { v: 'COVER', label: t('تعبئة', 'Cover', lang), hint: t('يملأ المساحة', 'Fill area') },
                        { v: 'ORIGINAL', label: t('أصلي', 'Original', lang), hint: t('حجم طبيعي', 'Natural size') },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          onClick={() => set('thermalLogoFit', opt.v)}
                          className={`rounded-md border p-2 text-xs transition flex flex-col items-center gap-0.5 ${
                            (form.thermalLogoFit || 'CONTAIN') === opt.v
                              ? 'border-amber-500 bg-amber-50 text-amber-900 dark:bg-amber-950/30 dark:text-amber-200 font-medium'
                              : 'border-input hover:bg-accent'
                          }`}
                        >
                          <span>{opt.label}</span>
                          <span className="text-[10px] text-muted-foreground">{opt.hint}</span>
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* تلميح الطابعة */}
                  <div className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-md p-2.5 flex items-start gap-2">
                    <Settings2 className="size-3.5 shrink-0 mt-0.5 text-blue-600" />
                    <span>
                      {t('للطابعة 58mm: استخدم عرض 140-160px. للطابعة 80mm: استخدم عرض 180-220px. حافظ على نسبة الأبعاد لتفادي التشوه.',
                         'For 58mm printer: use width 140-160px. For 80mm printer: use width 180-220px. Keep aspect ratio to avoid distortion.',
                         lang)}
                    </span>
                  </div>
                </div>

                {/* ─── يسار: المعاينة الحيّة (نفس المكوّن الفعلي!) ─── */}
                <div>
                  <Label className="text-xs font-medium mb-2 block flex items-center gap-1.5">
                    <Eye className="size-3.5" />
                    {t('معاينة حيّة (نفس الإيصال المطبوع)', 'Live Preview (same as printed)', lang)}
                  </Label>
                  <div className="rounded-md border bg-slate-100 dark:bg-slate-900 p-3 overflow-auto max-h-[600px]">
                    <div className="bg-white shadow-md mx-auto" style={{ maxWidth: 320, padding: 4 }}>
                      <ThermalReceiptDocument
                        invoice={SAMPLE_RECEIPT}
                        settings={thermalPreviewSettings}
                        lang={lang}
                      />
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-2 text-center">
                    {t('هذه المعاينة تطابق تماماً ما سيُطبع — لا فرق بين المعاينة والطباعة.',
                       'This preview exactly matches what will be printed — no difference between preview and print.',
                       lang)}
                  </p>
                </div>
              </div>
            </div>

            {/* زر الحفظ */}
            <div className="flex items-center gap-2 pt-2 border-t">
              <Button onClick={save} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {t('حفظ إعدادات الفرع', 'Save Branch Settings', lang)}
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
