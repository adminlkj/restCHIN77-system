import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { t } from '@/lib/utils-binaa';

const ACCOUNT_TYPES = [
  { key: 'ASSET', ar: 'أصول', en: 'Asset', nature: 'DEBIT' },
  { key: 'LIABILITY', ar: 'خصوم', en: 'Liability', nature: 'CREDIT' },
  { key: 'EQUITY', ar: 'حقوق ملكية', en: 'Equity', nature: 'CREDIT' },
  { key: 'REVENUE', ar: 'إيرادات', en: 'Revenue', nature: 'CREDIT' },
  { key: 'EXPENSE', ar: 'مصروفات', en: 'Expense', nature: 'DEBIT' },
];

const EMPTY = { code: '', name: '', nameEn: '', parentCode: '', accountType: 'EXPENSE', nature: 'DEBIT', semanticRole: '', isPostable: true, isActive: true, openingBalance: 0 };

// يقترح أول رقم حساب فرعي متاح تحت حساب أب (مثل 1114 تحت مجموعة النقدية 1110).
function nextChildCode(parentCode, allAccounts) {
  if (!parentCode) return '';
  const used = new Set((allAccounts || []).map(a => String(a.code)));
  // نبدأ من parentCode+1 ونزيد حتى نجد رقماً غير مستخدم ضمن نفس نطاق الأب.
  const base = parseInt(parentCode, 10);
  if (Number.isNaN(base)) return '';
  for (let i = 1; i <= 99; i++) {
    const candidate = String(base + i);
    if (!used.has(candidate)) return candidate;
  }
  return '';
}

export default function ChartAccountDialog({ open, onOpenChange, account, parents, allAccounts, onSave, lang }) {
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [codeError, setCodeError] = useState('');

  const accountsList = allAccounts || parents || [];

  useEffect(() => {
    if (account) setForm({ ...EMPTY, ...account, openingBalance: 0 });
    else setForm(EMPTY);
    setCodeError('');
  }, [account, open]);

  // يتحقق من تكرار رقم الحساب (باستثناء الحساب نفسه عند التعديل).
  const isDuplicateCode = (code) => {
    if (!code) return false;
    return accountsList.some(a => String(a.code) === String(code) && a.id !== account?.id && a.code !== account?.code);
  };

  const set = (k, v) => {
    if (k === 'code') setCodeError(isDuplicateCode(v) ? t('هذا الرقم مستخدم لحساب آخر — اختر رقماً فريداً', 'This code is already used — choose a unique code', lang) : '');
    setForm(prev => ({ ...prev, [k]: v }));
  };

  const handleType = (type) => {
    const def = ACCOUNT_TYPES.find(a => a.key === type);
    setForm(prev => ({ ...prev, accountType: type, nature: def?.nature || prev.nature }));
  };

  // اختيار حساب أب يورّث نوعه وطبيعته للحساب الفرعي (مثلاً حساب بنكي جديد تحت "البنوك" يصبح أصلاً).
  const handleParent = (v) => {
    const parentCode = v === 'none' ? '' : v;
    const parent = (parents || []).find(p => p.code === parentCode);
    // عند اختيار أب لحساب جديد وبدون رقم بعد: اقترح أول رقم فرعي متاح تلقائياً.
    const suggested = (!account && parentCode && !form.code) ? nextChildCode(parentCode, accountsList) : form.code;
    setForm(prev => ({
      ...prev,
      parentCode,
      code: suggested,
      ...(parent ? { accountType: parent.accountType, nature: parent.nature } : {}),
    }));
    if (suggested) setCodeError('');
  };

  const handleSave = async () => {
    if (!form.code || !form.name) return;
    if (isDuplicateCode(form.code)) {
      setCodeError(t('هذا الرقم مستخدم لحساب آخر — اختر رقماً فريداً', 'This code is already used — choose a unique code', lang));
      return;
    }
    setSaving(true);
    const { openingBalance, ...rest } = form;
    await onSave(
      { ...rest, level: form.parentCode ? 2 : 1 },
      account ? 0 : Number(openingBalance) || 0
    );
    setSaving(false);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{account ? t('تعديل حساب', 'Edit Account', lang) : t('حساب جديد', 'New Account', lang)}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2">
            <Label className="text-xs">{t('الحساب الأب', 'Parent Account', lang)}</Label>
            <Select value={form.parentCode || 'none'} onValueChange={handleParent}>
              <SelectTrigger className="mt-1"><SelectValue placeholder={t('رئيسي', 'Top-level', lang)} /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">{t('حساب رئيسي (بدون أب)', 'Top-level (no parent)', lang)}</SelectItem>
                {(parents || []).filter(p => p.code !== form.code).map(p => (
                  <SelectItem key={p.code} value={p.code}>{p.code} — {lang === 'ar' ? p.name : (p.nameEn || p.name)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('اختر حساباً رئيسياً لإضافة حساب فرعي تحته (مثل حساب بنكي جديد تحت "البنوك")', 'Pick a parent to add a sub-account under it (e.g. a new bank under "Banks")', lang)}
            </p>
          </div>
          <div>
            <Label className="text-xs">{t('رقم الحساب', 'Account Code', lang)} *</Label>
            <Input value={form.code} onChange={e => set('code', e.target.value)} placeholder="1021" className={`mt-1 ${codeError ? 'border-destructive focus-visible:ring-destructive' : ''}`} />
            {codeError && <p className="text-[10px] text-destructive mt-1">{codeError}</p>}
          </div>
          <div>
            <Label className="text-xs">{t('نوع الحساب', 'Account Type', lang)} *</Label>
            <Select value={form.accountType} onValueChange={handleType} disabled={!!form.parentCode}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ACCOUNT_TYPES.map(a => <SelectItem key={a.key} value={a.key}>{lang === 'ar' ? a.ar : a.en}</SelectItem>)}
              </SelectContent>
            </Select>
            {form.parentCode && <p className="text-[10px] text-muted-foreground mt-1">{t('موروث من الحساب الأب', 'Inherited from parent', lang)}</p>}
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('الاسم بالعربية', 'Name (Arabic)', lang)} *</Label>
            <Input value={form.name} onChange={e => set('name', e.target.value)} className="mt-1" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">{t('الاسم بالإنجليزية', 'Name (English)', lang)}</Label>
            <Input value={form.nameEn} onChange={e => set('nameEn', e.target.value)} className="mt-1" />
          </div>
          <div>
            <Label className="text-xs">{t('الطبيعة', 'Nature', lang)}</Label>
            <Select value={form.nature} onValueChange={v => set('nature', v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DEBIT">{t('مدين', 'Debit', lang)}</SelectItem>
                <SelectItem value="CREDIT">{t('دائن', 'Credit', lang)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {!account && (
            <div>
              <Label className="text-xs">{t('الرصيد الافتتاحي', 'Opening Balance', lang)}</Label>
              <Input type="number" step="0.01" value={form.openingBalance} onChange={e => set('openingBalance', e.target.value)} placeholder="0.00" className="mt-1" />
              <p className="text-[10px] text-muted-foreground mt-1">{t('يُنشئ قيد افتتاحي متوازن تلقائياً', 'Creates a balanced opening entry automatically', lang)}</p>
            </div>
          )}
          <div className="col-span-2">
            <Label className="text-xs">{t('الدور الدلالي (اختياري)', 'Semantic Role (optional)', lang)}</Label>
            <Input value={form.semanticRole} onChange={e => set('semanticRole', e.target.value.toUpperCase())} placeholder="EXPENSE_GENERAL" className="mt-1 font-mono text-xs" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {t('يُستخدم لربط القيود التلقائية بهذا الحساب. اتركه فارغاً للحسابات التفصيلية.', 'Links auto-journal entries to this account. Leave empty for detail accounts.', lang)}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button onClick={handleSave} disabled={saving || !form.code || !form.name || !!codeError} className="bg-teal-600 hover:bg-teal-700">
            {saving ? t('جارٍ الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}