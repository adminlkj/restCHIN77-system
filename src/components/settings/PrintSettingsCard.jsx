import React, { useState, useEffect } from 'react';
import { FileText, Upload, Loader2, Save, Eye } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings, DEFAULT_COMPANY_SETTINGS } from '@/hooks/useCompanySettings';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import InvoiceDocument from '@/components/shared/InvoiceDocument';

const TEMPLATES = [
  { key: 'MODERN', ar: 'عصري', en: 'Modern' },
  { key: 'CLASSIC', ar: 'كلاسيكي', en: 'Classic' },
  { key: 'MINIMAL', ar: 'بسيط', en: 'Minimal' },
];

// فاتورة تجريبية لمعاينة القالب داخل الإعدادات.
const SAMPLE_INVOICE = {
  invoiceNo: 'INV-0001',
  invoiceType: 'RENTAL',
  clientName: 'شركة العميل التجريبية',
  projectName: 'مشروع تجريبي',
  date: new Date().toISOString().slice(0, 10),
  dueDate: new Date(Date.now() + 15 * 864e5).toISOString().slice(0, 10),
  status: 'SENT',
  subtotal: 10000,
  vatAmount: 1500,
  totalAmount: 11500,
  paidAmount: 5000,
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

  useEffect(() => { if (!loading) setForm(settings); }, [loading]);  

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
      const { id, created_date, updated_date, created_by_id, ...payload } = form;  
      if (record?.id) {
        await base44.entities.CompanySettings.update(record.id, payload);
      } else {
        await base44.entities.CompanySettings.create(payload);
      }
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

        <div className="flex items-center justify-between rounded-lg border p-3">
          <div>
            <div className="text-sm font-medium">{t('رمز QR الضريبي', 'ZATCA QR Code', lang)}</div>
            <div className="text-xs text-muted-foreground">{t('يتطلب إدخال الرقم الضريبي', 'Requires a VAT number', lang)}</div>
          </div>
          <Switch checked={!!form.showQr} onCheckedChange={v => set('showQr', v)} />
        </div>

        {/* الإجراءات */}
        <div className="flex items-center gap-2 pt-2 border-t">
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('حفظ الإعدادات', 'Save Settings', lang)}
          </Button>
          <Button variant="outline" onClick={() => setPreviewOpen(true)} className="gap-1.5">
            <Eye className="size-4" />{t('معاينة القالب', 'Preview Template', lang)}
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
    </Card>
  );
}