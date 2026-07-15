import React, { useState, useEffect, useRef } from 'react';
import {
  Store, Loader2, Save, Upload, RefreshCw, Image as ImageIcon,
  CreditCard, Eye, Phone, MapPin, User, Palette,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings } from '@/hooks/useCompanySettings';
import {
  getBranchSettings, setBranchSettings, DEFAULT_BRANCH_SETTINGS,
} from '@/lib/branchSettings';

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
  const [branchesLoading, setBranchesLoading] = useState(true);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);

  // ─── تحميل قائمة الفروع ────────────────────────────────────────────
  const loadBranches = async () => {
    setBranchesLoading(true);
    try {
      const rows = await base44.entities.Project.list('-created_date', 200);
      const list = Array.isArray(rows) ? rows : [];
      setBranches(list);
      if (!selectedBranchId && list.length > 0) {
        setSelectedBranchId(list[0].id);
      }
    } catch (e) {
      console.warn('Branch list failed:', e);
      setBranches([]);
    } finally {
      setBranchesLoading(false);
    }
  };

  useEffect(() => { loadBranches(); }, []);

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

  // ─── الحفظ ─────────────────────────────────────────────────────────
  const save = async () => {
    if (!selectedBranchId) {
      toast({ title: t('اختر فرعاً أولاً', 'Select a branch first', lang), variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      const { id, created_date, updated_date, created_by_id, ...payload } = form;
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
          <Button variant="outline" size="icon" onClick={loadBranches} title={t('تحديث', 'Refresh', lang)}>
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

            {/* قسم: الشعار */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                <ImageIcon className="size-4" />{t('شعار الفرع', 'Branch Logo', lang)}
              </h4>
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

            {/* معاينة ترويسة الإيصال */}
            <div>
              <h4 className="text-sm font-semibold mb-3 text-foreground flex items-center gap-2">
                <Eye className="size-4" />{t('معاينة ترويسة الإيصال', 'Receipt Header Preview', lang)}
              </h4>
              <ReceiptHeaderPreview
                companySettings={companySettings}
                branchSettings={form}
                lang={lang}
              />
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

// ─── مكوّن المعاينة ───────────────────────────────────────────────────
// يعرض ترويسة الإيصال كما ستظهر في الطباعة (طباعة هندسة resolveReceiptSettings):
//   1) شعار الفرع
//   2) اسم الشركة (LARGE BOLD)
//   3) اسم الشركة بالإنجليزي (صغير)
//   4) اسم الفرع (متوسط + بادئة "فرع:")
//   5) رقم ضريبي، هاتف، عنوان
function ReceiptHeaderPreview({ companySettings, branchSettings, lang }) {
  const rtl = lang === 'ar';
  const dir = rtl ? 'rtl' : 'ltr';
  const align = rtl ? 'right' : 'left';

  const primary = branchSettings.primaryColor || companySettings.primaryColor || '#d97706';
  const accent = branchSettings.accentColor || companySettings.accentColor || '#1f2d3d';
  const logoUrl = branchSettings.logoUrl || companySettings.logoUrl || '';
  const companyName = companySettings.companyName || '';
  const companyNameEn = companySettings.companyNameEn || '';
  const branchName = branchSettings.branchName || '';
  const phone = branchSettings.phone || companySettings.phone || '';
  const vatNumber = branchSettings.vatNumber || companySettings.vatNumber || '';
  const address = branchSettings.address || companySettings.address || '';
  const city = branchSettings.city || companySettings.city || '';

  const T = (ar, en) => (rtl ? ar : en);

  return (
    <div
      dir={dir}
      style={{
        background: '#fff',
        color: '#000',
        border: '1px solid #e2e8f0',
        borderRadius: 8,
        padding: 12,
        fontFamily: "'Cairo', 'Tahoma', sans-serif",
        textAlign: align,
        maxWidth: 320,
      }}
    >
      {logoUrl ? (
        <div style={{ textAlign: 'center', marginBottom: 6 }}>
          <img src={logoUrl} alt="logo" style={{ maxWidth: '120px', maxHeight: '60px', objectFit: 'contain' }} />
        </div>
      ) : null}

      <div style={{ textAlign: 'center', fontWeight: 800, fontSize: 18, color: accent, lineHeight: 1.3 }}>
        {(rtl ? companyName : (companyNameEn || companyName)) || (rtl ? 'مطعمنا' : 'Our Restaurant')}
      </div>

      {companyNameEn && rtl && companyName ? (
        <div dir="ltr" style={{ textAlign: 'center', fontSize: 11, color: '#555', marginBottom: 2 }}>{companyNameEn}</div>
      ) : null}

      {branchName ? (
        <div style={{ textAlign: 'center', fontSize: 13, color: primary, fontWeight: 700, marginTop: 4 }}>
          {T('فرع:', 'Branch:')} {branchName}
        </div>
      ) : null}

      {branchName && (vatNumber || phone || address || city) ? (
        <div style={{ textAlign: 'center', color: '#bbb', fontSize: 10, margin: '4px 0' }}>{'·'.repeat(28)}</div>
      ) : null}

      {vatNumber ? (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>
          {T('الرقم الضريبي', 'VAT No.')}: <span dir="ltr">{vatNumber}</span>
        </div>
      ) : null}

      {phone ? (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>
          {T('هاتف', 'Tel')}: <span dir="ltr">{phone}</span>
        </div>
      ) : null}

      {(address || city) ? (
        <div style={{ textAlign: 'center', fontSize: 11, color: '#555' }}>
          {[address, city].filter(Boolean).join(' - ')}
        </div>
      ) : null}
    </div>
  );
}
