import React, { useState, useEffect } from 'react';
import { Building2, Loader2, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { useCompanySettings, DEFAULT_COMPANY_SETTINGS } from '@/hooks/useCompanySettings';

const Field = ({ label, children }) => (
  <div className="space-y-1.5">
    <Label className="text-xs">{label}</Label>
    {children}
  </div>
);

export default function CompanySettingsCard() {
  const { lang } = useStore();
  const { toast } = useToast();
  const { settings, record, loading, reload } = useCompanySettings();
  const [form, setForm] = useState(DEFAULT_COMPANY_SETTINGS);
  const [saving, setSaving] = useState(false);

  useEffect(() => { if (!loading) setForm(settings); }, [loading, settings]);

  const set = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      const { id, created_date, updated_date, created_by_id, ...payload } = form;  
      if (record?.id) {
        await base44.entities.CompanySettings.update(record.id, payload);
      } else {
        await base44.entities.CompanySettings.create(payload);
      }
      toast({ title: t('تم حفظ بيانات الشركة', 'Company details saved', lang) });
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

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="size-4" />{t('بيانات الشركة', 'Company Details', lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Field label={t('اسم الشركة (عربي)', 'Company Name (AR)', lang)}><Input value={form.companyName || ''} onChange={e => set('companyName', e.target.value)} /></Field>
          <Field label={t('اسم الشركة (إنجليزي)', 'Company Name (EN)', lang)}><Input value={form.companyNameEn || ''} onChange={e => set('companyNameEn', e.target.value)} /></Field>
          <Field label={t('الرقم الضريبي', 'VAT Number', lang)}><Input value={form.vatNumber || ''} onChange={e => set('vatNumber', e.target.value)} /></Field>
          <Field label={t('السجل التجاري', 'CR Number', lang)}><Input value={form.crNumber || ''} onChange={e => set('crNumber', e.target.value)} /></Field>
          <Field label={t('العنوان', 'Address', lang)}><Input value={form.address || ''} onChange={e => set('address', e.target.value)} /></Field>
          <Field label={t('المدينة', 'City', lang)}><Input value={form.city || ''} onChange={e => set('city', e.target.value)} /></Field>
          <Field label={t('الهاتف', 'Phone', lang)}><Input value={form.phone || ''} onChange={e => set('phone', e.target.value)} /></Field>
          <Field label={t('البريد الإلكتروني', 'Email', lang)}><Input value={form.email || ''} onChange={e => set('email', e.target.value)} /></Field>
          <Field label={t('الموقع الإلكتروني', 'Website', lang)}><Input value={form.website || ''} onChange={e => set('website', e.target.value)} /></Field>
        </div>

        <div>
          <h4 className="text-sm font-semibold mb-3">{t('البيانات البنكية', 'Bank Details', lang)}</h4>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field label={t('اسم البنك', 'Bank Name', lang)}><Input value={form.bankName || ''} onChange={e => set('bankName', e.target.value)} /></Field>
            <Field label={t('اسم صاحب الحساب', 'Account Name', lang)}><Input value={form.bankAccountName || ''} onChange={e => set('bankAccountName', e.target.value)} /></Field>
            <Field label={t('الفرع', 'Branch', lang)}><Input value={form.bankBranch || ''} onChange={e => set('bankBranch', e.target.value)} /></Field>
            <Field label={t('رقم الحساب', 'Account No.', lang)}><Input value={form.bankAccountNumber || ''} onChange={e => set('bankAccountNumber', e.target.value)} className="font-mono text-xs" /></Field>
            <Field label={t('الآيبان', 'IBAN', lang)}><Input value={form.iban || ''} onChange={e => set('iban', e.target.value)} className="font-mono text-xs" /></Field>
            <Field label={t('رمز السويفت', 'SWIFT Code', lang)}><Input value={form.swiftCode || ''} onChange={e => set('swiftCode', e.target.value.toUpperCase())} className="font-mono text-xs uppercase" /></Field>
          </div>
        </div>

        <div className="flex items-center gap-2 pt-2 border-t">
          <Button onClick={save} disabled={saving} className="gap-1.5 bg-emerald-600 hover:bg-emerald-700">
            {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {t('حفظ البيانات', 'Save Details', lang)}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}