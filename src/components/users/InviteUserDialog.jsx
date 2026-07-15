import React, { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { APP_ROLES, APP_ROLE_KEYS } from '@/lib/permissions';
import { UserPlus } from 'lucide-react';

export default function InviteUserDialog({ open, onOpenChange, onInvited, lang }) {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [appRole, setAppRole] = useState('VIEWER');
  const [sending, setSending] = useState(false);
  const [inviteResult, setInviteResult] = useState(null);

  const handleInvite = async () => {
    if (!email || !email.includes('@')) {
      toast({ title: t('بريد غير صحيح', 'Invalid email', lang), variant: 'destructive' });
      return;
    }
    setSending(true);
    try {
      const normalizedEmail = email.trim().toLowerCase();
      const existingUsers = await base44.entities.User.list('-created_date', 500);
      if (existingUsers.some(u => String(u.email || '').toLowerCase() === normalizedEmail)) {
        toast({ title: t('البريد مستخدم بالفعل', 'Email already exists', lang), description: t('لا يمكن إنشاء دعوتين أو صلاحيتين لنفس البريد. عدّل المستخدم الموجود بدلاً من دعوته مرة أخرى.', 'You cannot create duplicate access for the same email. Edit the existing user instead.', lang), variant: 'destructive' });
        return;
      }
      // System role: OWNER maps to admin, others to user
      const systemRole = appRole === 'OWNER' ? 'admin' : 'user';
      const result = await base44.users.inviteUser(normalizedEmail, systemRole, appRole);
      setInviteResult(result);
      toast({ title: t('تم إنشاء حساب المستخدم', 'User account created', lang), description: t('انسخ كلمة المرور المؤقتة وأرسلها للمستخدم.', 'Copy the temporary password and send it to the user.', lang) });
      onInvited?.();
    } catch (e) {
      const duplicate = e.message?.includes('already') || e.message?.includes('exists') || e.message?.includes('409');
      toast({ title: duplicate ? t('البريد مستخدم بالفعل', 'Email already exists', lang) : t('تعذر إرسال الدعوة', 'Could not send invite', lang), description: duplicate ? t('هذا البريد مرتبط بمستخدم موجود ولا يمكن تغيير صلاحياته عبر دعوة جديدة.', 'This email belongs to an existing user and cannot be changed through a new invite.', lang) : e.message, variant: 'destructive' });
    } finally {
      setSending(false);
    }
  };

  const close = () => {
    setEmail('');
    setAppRole('VIEWER');
    setInviteResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(next) => next ? onOpenChange(true) : close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="size-5 text-emerald-600" />
            {t('دعوة مستخدم جديد', 'Invite New User', lang)}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>{t('البريد الإلكتروني', 'Email', lang)}</Label>
            <Input type="email" dir="ltr" placeholder="name@company.com" value={email} onChange={e => setEmail(e.target.value)} disabled={!!inviteResult} />
          </div>
          <div className="space-y-1.5">
            <Label>{t('الدور الوظيفي', 'Business Role', lang)}</Label>
            <Select value={appRole} onValueChange={setAppRole} disabled={!!inviteResult}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_ROLE_KEYS.map(k => (
                  <SelectItem key={k} value={k}>{lang === 'ar' ? APP_ROLES[k].ar : APP_ROLES[k].en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              {t('البريد الإلكتروني غير مفعّل في النسخة المنشورة حالياً؛ سيتم إنشاء الحساب وعرض كلمة مرور مؤقتة لإرسالها للمستخدم.',
                 'Email sending is not enabled in this deployment; the account will be created and a temporary password shown for you to send.', lang)}
            </p>
          </div>
          {inviteResult?.tempPassword && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 space-y-2">
              <p className="text-sm font-semibold text-emerald-800">{t('تم إنشاء الحساب', 'Account created', lang)}</p>
              <p className="text-xs text-emerald-700">{t('أرسل هذه البيانات للمستخدم لتسجيل الدخول:', 'Send these credentials to the user:', lang)}</p>
              <div className="rounded bg-white border p-2 text-xs" dir="ltr">
                <div>Email: {inviteResult.email}</div>
                <div>Password: {inviteResult.tempPassword}</div>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={() => navigator.clipboard?.writeText(`Email: ${inviteResult.email}\nPassword: ${inviteResult.tempPassword}`)}>
                {t('نسخ البيانات', 'Copy credentials', lang)}
              </Button>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={close}>{inviteResult ? t('إغلاق', 'Close', lang) : t('إلغاء', 'Cancel', lang)}</Button>
          {!inviteResult && (
            <Button onClick={handleInvite} disabled={sending} className="bg-emerald-600 hover:bg-emerald-700">
              {sending ? t('جارٍ الإنشاء...', 'Creating...', lang) : t('إنشاء الدعوة', 'Create Invite', lang)}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}