import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { useStore } from '@/lib/store';
import { t } from '@/lib/utils-binaa';
import { APP_ROLES, resolveUserModules, MODULES } from '@/lib/permissions';
import ModuleLayout from '@/components/shared/ModuleLayout';
import { User as UserIcon, ShieldCheck, Save } from 'lucide-react';

export default function Profile() {
  const { lang } = useStore();
  const { toast } = useToast();
  const [user, setUser] = useState(null);
  const [form, setForm] = useState({ jobTitle: '', department: '', phone: '' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    base44.auth.me().then(u => {
      setUser(u);
      setForm({ jobTitle: u.jobTitle || '', department: u.department || '', phone: u.phone || '' });
    });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await base44.auth.updateMe(form);
      toast({ title: t('تم حفظ الملف الشخصي', 'Profile saved', lang) });
    } catch (e) {
      toast({ title: t('تعذر الحفظ', 'Save failed', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  if (!user) return <ModuleLayout title={t('ملفي الشخصي', 'My Profile', lang)}><div className="py-16 text-center text-muted-foreground">{t('جارٍ التحميل...', 'Loading...', lang)}</div></ModuleLayout>;

  const roleMeta = APP_ROLES[user.appRole || 'VIEWER'];
  const myModules = resolveUserModules(user);
  const isFullAccess = user.role === 'admin' || user.appRole === 'OWNER';

  return (
    <ModuleLayout title={t('ملفي الشخصي', 'My Profile', lang)} subtitle={t('بياناتك وصلاحياتك في النظام', 'Your info and system access', lang)}>
      <div className="grid gap-5 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><UserIcon className="size-4" />{t('البيانات الشخصية', 'Personal Info', lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>{t('الاسم', 'Name', lang)}</Label>
                <Input value={user.full_name || ''} disabled className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('البريد الإلكتروني', 'Email', lang)}</Label>
                <Input value={user.email || ''} disabled dir="ltr" className="bg-muted/40" />
              </div>
              <div className="space-y-1.5">
                <Label>{t('المسمى الوظيفي', 'Job Title', lang)}</Label>
                <Input value={form.jobTitle} onChange={e => setForm({ ...form, jobTitle: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('القسم', 'Department', lang)}</Label>
                <Input value={form.department} onChange={e => setForm({ ...form, department: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>{t('الهاتف', 'Phone', lang)}</Label>
                <Input dir="ltr" value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
              </div>
            </div>
            <Button onClick={handleSave} disabled={saving} className="gap-2 bg-emerald-600 hover:bg-emerald-700">
              <Save className="size-4" />{saving ? t('جارٍ الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base flex items-center gap-2"><ShieldCheck className="size-4" />{t('الدور والصلاحيات', 'Role & Access', lang)}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <p className="text-xs text-muted-foreground mb-1">{t('الدور الوظيفي', 'Business Role', lang)}</p>
              <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${roleMeta.color}`}>{lang === 'ar' ? roleMeta.ar : roleMeta.en}</span>
            </div>
            <div>
              <p className="text-xs text-muted-foreground mb-1.5">{t('الوحدات المتاحة', 'Available Modules', lang)}</p>
              {isFullAccess ? (
                <span className="text-sm text-emerald-600 font-medium">{t('وصول كامل لجميع الوحدات', 'Full access to all modules', lang)}</span>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {myModules.map(k => {
                    const m = MODULES.find(x => x.key === k);
                    return <span key={k} className="text-[11px] bg-muted px-2 py-0.5 rounded">{m ? (lang === 'ar' ? m.ar : m.en) : k}</span>;
                  })}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </ModuleLayout>
  );
}