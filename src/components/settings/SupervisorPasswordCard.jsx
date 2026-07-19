import React, { useState } from 'react';
import { ShieldCheck, Key, Loader2, CheckCircle2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { base44 } from '@/api/base44Client';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { toast } from 'sonner';

// بطاقة ضبط كلمة مرور المشرف لإلغاء الفواتير الحساسة.
// كلمة المرور تُرسل للخادم ويُخزَّن هاشها (scrypt) على CompanySettings — لا في الواجهة.
export default function SupervisorPasswordCard() {
  const { lang } = useStore();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    // لا نفرض أي قيد على طول/نوع كلمة المرور — يقرر المستخدم ما يناسبه
    // (4 أو 5 أو 8 أرقام، أحرف، أو خليط). المطلوب الوحيد: ألا تكون فارغة،
    // وأن تتطابق مع التأكيد.
    if (!newPassword) {
      toast.error(t('أدخل كلمة المرور الجديدة', 'Enter the new password', lang));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(t('كلمتا المرور غير متطابقتين', 'Passwords do not match', lang));
      return;
    }
    setSaving(true);
    try {
      // نرسلها لـ endpoint الخادم عبر functions.invoke.
      await base44.functions.invoke('setSupervisorPassword', { newPassword });
      toast.success(t('تم تحديث كلمة مرور المشرف', 'Supervisor password updated', lang));
      setNewPassword('');
      setConfirmPassword('');
    } catch (e) {
      toast.error(e?.message || t('فشل التحديث', 'Update failed', lang));
    }
    setSaving(false);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <ShieldCheck className="size-4 text-amber-600" />
          {t('أمان المشرف — كلمة مرور إلغاء الفواتير', 'Supervisor Security — Invoice Cancel Password', lang)}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-800 flex items-start gap-2">
          <Key className="size-4 shrink-0 mt-0.5" />
          <span>
            {t(
              'كلمة المرور هذه تُطلب عند إلغاء فاتورة من نقطة البيع. تُخزَّن كهاش آمن على الخادم (لا في المتصفح). لا تُشاركها مع غير المصرّح لهم.',
              'This password is required to cancel an invoice from POS. It is stored as a secure hash on the server (not in the browser). Do not share it with unauthorized users.',
              lang
            )}
          </span>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('كلمة المرور الجديدة', 'New password', lang)}</Label>
          <Input
            type="password"
            value={newPassword}
            onChange={e => setNewPassword(e.target.value)}
            placeholder="••••••••"
            className="h-9"
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">{t('تأكيد كلمة المرور', 'Confirm password', lang)}</Label>
          <Input
            type="password"
            value={confirmPassword}
            onChange={e => setConfirmPassword(e.target.value)}
            placeholder="••••••••"
            className="h-9"
            autoComplete="new-password"
            onKeyDown={e => { if (e.key === 'Enter') save(); }}
          />
        </div>
        <Button onClick={save} disabled={saving} className="gap-2 bg-amber-600 hover:bg-amber-700">
          {saving ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
          {saving ? t('جاري الحفظ...', 'Saving...', lang) : t('حفظ كلمة المرور', 'Save password', lang)}
        </Button>
      </CardContent>
    </Card>
  );
}
