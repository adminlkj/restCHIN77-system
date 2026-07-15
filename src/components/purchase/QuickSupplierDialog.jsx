import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { t, nextCodeFromList } from '@/lib/utils-binaa';
import { toast } from 'sonner';

const empty = { code: '', name: '', phone: '', email: '', taxNumber: '', contactPerson: '' };
const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

export default function QuickSupplierDialog({ open, onOpenChange, suppliers = [], lang, onCreated }) {
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) setForm({ ...empty, code: nextCodeFromList(suppliers, 'SUP') });
  }, [open, suppliers]);

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

  const save = async () => {
    if (!form.name?.trim()) return toast.error(t('اسم المورد مطلوب', 'Supplier name is required', lang));
    setSaving(true);
    try {
      const supplier = await base44.entities.Supplier.create({ ...form, code: form.code || nextCodeFromList(suppliers, 'SUP') });
      toast.success(t('تمت إضافة المورد', 'Supplier added', lang));
      onCreated?.(supplier);
      onOpenChange(false);
    } catch (err) {
      toast.error(errorMessage(err, t('فشل إضافة المورد', 'Failed to add supplier', lang)));
    }
    setSaving(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg" dir={lang === 'ar' ? 'rtl' : 'ltr'}>
        <DialogHeader><DialogTitle>{t('إضافة مورد سريعاً', 'Quick Add Supplier', lang)}</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-4 py-2">
          <div className="space-y-1.5"><Label>{t('الكود', 'Code', lang)}</Label><Input value={form.code} readOnly className="bg-muted" /></div>
          <div className="space-y-1.5"><Label>{t('اسم المورد', 'Supplier Name', lang)} *</Label><Input value={form.name} onChange={e => set('name', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('الهاتف', 'Phone', lang)}</Label><Input value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('البريد', 'Email', lang)}</Label><Input value={form.email} onChange={e => set('email', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('الرقم الضريبي', 'Tax No.', lang)}</Label><Input value={form.taxNumber} onChange={e => set('taxNumber', e.target.value)} /></div>
          <div className="space-y-1.5"><Label>{t('شخص التواصل', 'Contact', lang)}</Label><Input value={form.contactPerson} onChange={e => set('contactPerson', e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button onClick={save} disabled={saving} className="bg-amber-600 hover:bg-amber-700">{saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ المورد', 'Save Supplier', lang)}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}