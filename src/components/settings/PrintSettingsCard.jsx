import React, { useState, useEffect } from 'react';
import { FileText, Upload, Loader2, Save, Eye, Receipt } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings, DEFAULT_COMPANY_SETTINGS, invalidateCompanySettingsCache } from '@/hooks/useCompanySettings';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import InvoiceDocument from '@/components/shared/InvoiceDocument';
import ThermalReceiptDocument from '@/components/shared/ThermalReceiptDocument';

const TEMPLATES = [
  { key: 'MODERN', ar: 'عصري', en: 'Modern' },
  { key: 'CLASSIC', ar: 'كلاسيكي', en: 'Classic' },
  { key: 'MINIMAL', ar: 'بسيط', en: 'Minimal' },
];

// فاتورة تجريبية لمعاينة القالب داخل الإعدادات.
const SAMPLE_INVOICE = {
  invoiceNo: 'INV-0001',
  invoiceType: 'CONSTRUCTION',
  clientName: 'زبون تجريبي',
  projectName: 'الفرع الرئيسي',
  date: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
  status: 'SENT',
  subtotal: 100,
  vatAmount: 15,
  totalAmount: 115,
  paidAmount: 50,
};

// إيصال حراري تجريبي لمعاينة إعدادات الطباعة الحرارية مباشرةً.
const SAMPLE_THERMAL = {
  invoiceNo: 'INV-2026-0001',
  date: new Date().toISOString(),
  saleType: 'DINE_IN',
  clientName: 'زبون نقدي',
  cashier: 'الكاشير',
  tableNo: 'طاولة 1',
  subtotal: 100,
  vatAmount: 15,
  vatRate: 0.15,
  totalAmount: 115,
  paidAmount: 115,
  notes: JSON.stringify({
    payments: [{ method: 'CASH', amount: 115 }],
    cashReceived: 115,
    items: [
      { description: 'برجر لحم', descriptionEn: 'Beef Burger', qty: 2, unitPrice: 40, total: 80 },
      { description: 'بيبسي', descriptionEn: 'Pepsi', qty: 1, unitPrice: 20, total: 20 },
    ],
  }),
};

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

export default function PrintSettingsCard() {
  const { lang } = useStore();
  const { toast } = useToast();
  const { settings, record, loading, reload } = useCompanySettings();
  const [form, setForm] = useState(DEFAULT_COMPANY_SETTINGS);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const [thermalPreviewOpen, setThermalPreviewOpen] = useState(false);

  useEffect(() => { if (!loading) setForm(settings); }, [loading, settings]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const uploadImage = async (key, file) => {
    if (!file) return;
    setUploading(key);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      set(key, file_url);
    } catch (e) {
      toast({ title: t('خطأ في الرفع', 'Upload failed', lang), description: e.message, variant: 'destructive' });
    } finally {
      setUploading('');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const { id: _id, created_date: _created_date, updated_date: _updated_date, created_by_id: _created_by_id, ...payload } = form;
      if (record?.id) {
        await base44.entities.CompanySettings.update(record.id, payload);
      } else {
        await base44.entities.CompanySettings.create(payload);
      }
      invalidateCompanySettingsCache(); // إبطال الكاش ليُجلب كل المستهلكين النسخة الجديدة
      toast({ title: t('تم حفظ إعدادات الطباعة', 'Print settings saved', lang) });
      await reload();
    } catch (e) {
      toast({ title: t('خطأ', 'Error', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Card><CardContent className="py-10 text-center"><Loader2 className="size-5 animate-spin mx-auto text-muted-foreground" /></CardContent></Card>;
  }

  const ImageUploader = ({ fieldKey, label }) => (
    <Field label={label}>
      <div className="flex items-center gap-2">
        {form[fieldKey] && <img src={form[fieldKey]} alt={label} className="h-10 w-10 object-contain rounded border bg-white" />}
        <label className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-md border cursor-pointer hover:bg-accent">
          {uploading === fieldKey ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
          {t('رفع', 'Upload', lang)}
          <input type="file" accept="image/*" className="hidden" onChange={e => uploadImage(fieldKey, e.target.files?.[0])} />
        </label>
        {form[fieldKey] && <Button size="sm" variant="ghost" className="text-xs h-7" onClick={() => set(fieldKey, '')}>{t('إزالة', 'Remove', lang)}</Button>}
      </div>
    </Field>
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <FileText className="size-4" />{t('إعدادات الطباعة والفاتورة', 'Print & Invoice Settings', lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* القالب والألوان */}
        <div>
          <Label className="text-xs text-muted-foreground">{t('القالب', 'Template', lang)}</Label>
          <div className="flex gap-2 mt-2">
            {TEMPLATES.map(tp => (
              <button
                key={tp.key}
                onClick={() => set('template', tp.key)}
                className={`flex-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${form.template === tp.key ? 'border-emerald-500 bg-emerald-50 text-emerald-700 font-semibold' : 'border-border hover:bg-accent'}`}
              >
                {lang === 'ar' ? tp.ar : tp.en}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <Field label={t('اللون الأساسي', 'Primary Color', lang)}>
            <div className="flex items-center gap-2">
              <input type="color" value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
              <Input value={form.primaryColor} onChange={e => set('primaryColor', e.target.value)} className="font-mono text-xs" />
            </div>
          </Field>
          <Field label={t('اللون الثانوي', 'Accent Color', lang)}>
            <div className="flex items-center gap-2">
              <input type="color" value={form.accentColor} onChange={e => set('accentColor', e.target.value)} className="h-9 w-12 rounded border cursor-pointer" />
              <Input value={form.accentColor} onChange={e => set('accentColor', e.target.value)} className="font-mono text-xs" />
            </div>
          </Field>
        </div>

        {/* الصور */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <ImageUploader fieldKey="logoUrl" label={t('الشعار', 'Logo', lang)} />
          <ImageUploader fieldKey="headerImageUrl" label={t('صورة الهيدر', 'Header Image', lang)} />
          <ImageUploader fieldKey="footerImageUrl" label={t('صورة الفوتر', 'Footer Image', lang)} />
        </div>

        {/* الشروط والأحكام + QR */}
        <Field label={t('الشروط والأحكام', 'Terms & Conditions', lang)}>
          <Textarea value={form.terms || ''} onChange={e => set('terms', e.target.value)} rows={3} placeholder={t('تُطبع في أسفل كل فاتورة', 'Printed at the bottom of every invoice', lang)} />
        </Field>

        <Field label={t('رسالة الإيصال الختامية', 'Receipt Closing Message', lang)}>
          <Textarea value={form.receiptFooterMessage || ''} onChange={e => set('receiptFooterMessage', e.target.value)} rows={2} placeholder={t('شكراً لزيارتكم — نتمنى لكم وجبة شهية', 'Thank you for visiting — We hope you enjoyed your meal', lang)} />
        </Field>

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">{t('رمز QR الضريبي', 'ZATCA QR Code', lang)}</div>
            <div className="text-xs text-muted-foreground">{t('يتطلب إدخال الرقم الضريبي', 'Requires a VAT number', lang)}</div>
          </div>
          <Switch checked={!!form.showQr} onCheckedChange={v => set('showQr', v)} />
        </div>

        {/* ─── إعدادات طباعة الإيصال الحراري ─── */}
        <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 space-y-4">
          <div className="flex items-center gap-2 pb-2 border-b border-amber-200">
            <FileText className="size-4 text-amber-600" />
            <span className="text-sm font-bold text-amber-800">{t('إعدادات الإيصال الحراري', 'Thermal Receipt Settings', lang)}</span>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
            {t('تتحكم بمظهر الإيصال على طابعات الحرارية. تُطبَّق فوراً عند الطباعة.', 'Controls receipt appearance on thermal printers. Applied immediately when printing.', lang)}
          </p>

          {/* مقاس الورق */}
          <Field label={t('مقاس الورق', 'Paper Size', lang)}>
            <div className="flex gap-2">
              {[
                { key: '80mm', ar: '80mm (قياسي)', en: '80mm (Standard)' },
                { key: '58mm', ar: '58mm (صغير)', en: '58mm (Small)' },
              ].map(ps => (
                <button
                  key={ps.key}
                  type="button"
                  onClick={() => {
                    set('thermalPaperSize', ps.key);
                    set('thermalReceiptWidth', ps.key === '58mm' ? 200 : 272);
                  }}
                  className={`flex-1 rounded-lg border-2 px-3 py-2 text-xs transition-colors ${(form.thermalPaperSize || '80mm') === ps.key ? 'border-amber-500 bg-amber-100 text-amber-800 font-semibold' : 'border-border hover:bg-accent'}`}
                >
                  {lang === 'ar' ? ps.ar : ps.en}
                </button>
              ))}
            </div>
          </Field>

          <div className="grid grid-cols-2 gap-4">
            {/* سماكة الخط — shadcn Select */}
            <Field label={t('سماكة الخط', 'Font Weight', lang)}>
              <Select
                value={String(form.thermalFontWeight ?? 700)}
                onValueChange={(v) => set('thermalFontWeight', Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="400">{t('عادي (400)', 'Normal (400)', lang)}</SelectItem>
                  <SelectItem value="600">{t('شبه غامق (600)', 'Semi-bold (600)', lang)}</SelectItem>
                  <SelectItem value="700">{t('غامق (700) — موصى به', 'Bold (700) — recommended', lang)}</SelectItem>
                  <SelectItem value="800">{t('غامق جداً (800)', 'Extra bold (800)', lang)}</SelectItem>
                  <SelectItem value="900">{t('أسود (900)', 'Black (900)', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            {/* حجم الخط — أزرار خيارات سريعة +عرض القيمة */}
            <Field label={t('حجم الخط', 'Font Size', lang)}>
              <div className="flex items-center gap-1">
                {[10, 11, 12, 13, 14, 15].map(sz => (
                  <button
                    key={sz}
                    type="button"
                    onClick={() => set('thermalFontSize', sz)}
                    className={`h-9 flex-1 rounded-md border text-xs font-mono transition-colors ${(form.thermalFontSize ?? 12) === sz ? 'border-amber-500 bg-amber-100 text-amber-800 font-bold' : 'border-border hover:bg-accent'}`}
                  >
                    {sz}
                  </button>
                ))}
              </div>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            {/* عرض الإيصال — أزرار خيارات سريعة */}
            <Field label={t('عرض الإيصال', 'Receipt Width', lang)}>
              <div className="flex items-center gap-1">
                {[
                  { w: 200, label: '58mm' },
                  { w: 240, label: '240' },
                  { w: 272, label: '80mm' },
                  { w: 300, label: '300' },
                ].map(opt => (
                  <button
                    key={opt.w}
                    type="button"
                    onClick={() => set('thermalReceiptWidth', opt.w)}
                    className={`h-9 flex-1 rounded-md border text-xs transition-colors ${(form.thermalReceiptWidth ?? 272) === opt.w ? 'border-amber-500 bg-amber-100 text-amber-800 font-bold' : 'border-border hover:bg-accent'}`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground">{t('القيمة الحالية: ', 'Current: ', lang)}{form.thermalReceiptWidth ?? 272}px</p>
            </Field>

            {/* تباعد الأسطر — shadcn Select */}
            <Field label={t('تباعد الأسطر', 'Line Height', lang)}>
              <Select
                value={String(form.thermalLineHeight ?? 1.5)}
                onValueChange={(v) => set('thermalLineHeight', Number(v))}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1.2">{t('مضغوط (1.2)', 'Compact (1.2)', lang)}</SelectItem>
                  <SelectItem value="1.35">{t('مدمج (1.35)', 'Tight (1.35)', lang)}</SelectItem>
                  <SelectItem value="1.5">{t('عادي (1.5) — موصى به', 'Normal (1.5) — recommended', lang)}</SelectItem>
                  <SelectItem value="1.7">{t('مريح (1.7)', 'Relaxed (1.7)', lang)}</SelectItem>
                  <SelectItem value="2">{t('واسع (2.0)', 'Wide (2.0)', lang)}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* توفير الحبر */}
          <div className="flex items-center justify-between rounded-lg border bg-white p-3">
            <div>
              <div className="text-sm font-medium">{t('وضع توفير الحبر', 'Ink-Saving Mode', lang)}</div>
              <div className="text-xs text-muted-foreground">{t('يُخفّف كثافة العناصر الثانوية (الترجمة الإنجليزية)', 'Lightens secondary elements (English translations)', lang)}</div>
            </div>
            <Switch checked={!!form.thermalInkSaving} onCheckedChange={v => set('thermalInkSaving', v)} />
          </div>
        </div>

        {/* الإجراءات */}
        <div className="flex items-center gap-2 pt-2 border-t flex-wrap">
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('حفظ الإعدادات', 'Save Settings', lang)}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5">
            <Eye className="size-4" />{t('معاينة الفاتورة', 'Preview Invoice', lang)}
          </Button>
          <Button variant="outline" onClick={() => setThermalPreviewOpen(true)} className="gap-1.5 border-amber-300 text-amber-700 hover:bg-amber-50">
            <Receipt className="size-4" />{t('معاينة الإيصال الحراري', 'Preview Thermal Receipt', lang)}
          </Button>
        </div>
      </CardContent>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl max-h-[92vh] p-4 overflow-auto bg-muted/30">
          <div className="bg-white mx-auto max-w-2xl p-8 rounded shadow-sm">
            <InvoiceDocument invoice={SAMPLE_INVOICE} settings={form} lang={lang} />
          </div>
        </DialogContent>
      </Dialog>

      {/* معاينة الإيصال الحراري — تطبّق الإعدادات الحالية مباشرةً (live preview) */}
      <Dialog open={thermalPreviewOpen} onOpenChange={setThermalPreviewOpen}>
        <DialogContent className="max-w-[420px] max-h-[92vh] p-4 overflow-auto bg-slate-100">
          <div className="text-center mb-3">
            <span className="text-sm font-semibold text-amber-700">{t('معاينة مباشرة بإعداداتك الحالية', 'Live preview with current settings', lang)}</span>
          </div>
          <div className="bg-white shadow-md mx-auto" style={{ width: `${Number(form.thermalReceiptWidth) || 272}px`, padding: '8px' }}>
            <ThermalReceiptDocument invoice={SAMPLE_THERMAL} settings={form} lang={lang} />
          </div>
          <p className="text-xs text-center text-muted-foreground mt-3">
            {t('غيّر الإعدادات أعلاه ثم أعد فتح المعاينة لرؤية التأثير. احفظ لتطبيقها على كل الإيصالات.', 'Change settings above then reopen preview to see effect. Save to apply to all receipts.', lang)}
          </p>
        </DialogContent>
      </Dialog>
    </Card>
  );
}