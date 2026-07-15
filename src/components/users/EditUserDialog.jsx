import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { APP_ROLES, APP_ROLE_KEYS, ACTION_KEYS, resolveUserModules, resolveModuleActions } from '@/lib/permissions';
import PermissionMatrix from '@/components/users/PermissionMatrix';
import { ShieldCheck } from 'lucide-react';

export default function EditUserDialog({ open, onOpenChange, user, onSaved, lang }) {
  const { toast } = useToast();
  const [form, setForm] = useState({});
  const [customModules, setCustomModules] = useState([]);      // string[] of visible module keys
  const [moduleActions, setModuleActions] = useState({});       // { moduleKey: string[] }
  const [useCustom, setUseCustom] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm({
        appRole: user.appRole || 'VIEWER',
        role: user.role || 'user',
        jobTitle: user.jobTitle || '',
        department: user.department || '',
        phone: user.phone || '',
        isActive: user.isActive !== false,
        password: '',
      });
      const hasCustom = Array.isArray(user.allowedModules) && user.allowedModules.length > 0;
      setUseCustom(hasCustom);
      const modules = hasCustom ? user.allowedModules : resolveUserModules(user);
      setCustomModules(modules);
      // Seed per-module actions from any saved override, defaulting to full actions.
      const seeded = {};
      modules.forEach(k => {
        seeded[k] = resolveModuleActions(
          { ...user, role: 'user', appRole: user.appRole, allowedModules: modules },
          k
        );
      });
      setModuleActions(user.modulePermissions && typeof user.modulePermissions === 'object'
        ? { ...seeded, ...user.modulePermissions }
        : seeded);
    }
  }, [user]);

  if (!user) return null;

  const isOwner = form.appRole === 'OWNER';
  const roleDefaultModules = resolveUserModules({ ...user, allowedModules: [], role: form.role, appRole: form.appRole });
  const effectiveModules = useCustom ? customModules : roleDefaultModules;
  const matrixDisabled = !useCustom || isOwner;

  const toggleModule = (key) => {
    setCustomModules(prev => {
      const has = prev.includes(key);
      if (has) return prev.filter(k => k !== key);
      // Newly visible module → grant full actions by default.
      setModuleActions(m => ({ ...m, [key]: m[key] || [...ACTION_KEYS] }));
      return [...prev, key];
    });
  };

  const toggleAction = (key, action) => {
    setModuleActions(prev => {
      const current = prev[key] || [...ACTION_KEYS];
      const next = current.includes(action) ? current.filter(a => a !== action) : [...current, action];
      return { ...prev, [key]: next };
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // Only persist action maps for modules that are actually visible.
      const cleanedActions = {};
      if (useCustom && !isOwner) {
        customModules.forEach(k => { cleanedActions[k] = moduleActions[k] || [...ACTION_KEYS]; });
      }
      const payload = {
        appRole: form.appRole,
        role: isOwner ? 'admin' : form.role,
        jobTitle: form.jobTitle,
        department: form.department,
        phone: form.phone,
        isActive: form.isActive,
        ...(form.password ? { password: form.password } : {}),
        allowedModules: useCustom ? customModules : [],
        modulePermissions: useCustom && !isOwner ? cleanedActions : {},
      };
      const updatedUser = await base44.entities.User.update(user.id, payload);
      toast({ title: form.password ? t('تم حفظ التغييرات وتغيير كلمة المرور', 'Changes saved and password updated', lang) : t('تم حفظ التغييرات', 'Changes saved', lang), variant: 'success' });
      onOpenChange(false);
      onSaved?.(updatedUser, Boolean(form.password));
    } catch (e) {
      toast({ title: t('تعذر الحفظ', 'Save failed', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheck className="size-5 text-emerald-600" />
            {t('تعديل المستخدم', 'Edit User', lang)} — {user.full_name || user.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Profile fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <div className="space-y-1.5">
              <Label>{t('كلمة مرور جديدة', 'New Password', lang)}</Label>
              <Input type="password" dir="ltr" autoComplete="new-password" placeholder={t('اتركها فارغة بدون تغيير', 'Leave blank to keep current', lang)} value={form.password || ''} onChange={e => setForm({ ...form, password: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label>{t('الدور الوظيفي', 'Business Role', lang)}</Label>
              <Select value={form.appRole} onValueChange={v => setForm({ ...form, appRole: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {APP_ROLE_KEYS.map(k => (
                    <SelectItem key={k} value={k}>{lang === 'ar' ? APP_ROLES[k].ar : APP_ROLES[k].en}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Active toggle */}
          <div className="flex items-center justify-between rounded-lg border p-3">
            <div>
              <p className="text-sm font-medium">{t('حساب نشط', 'Active Account', lang)}</p>
              <p className="text-xs text-muted-foreground">{t('المستخدمون غير النشطين لا يمكنهم استخدام النظام', 'Inactive users cannot access the system', lang)}</p>
            </div>
            <Switch checked={form.isActive} onCheckedChange={v => setForm({ ...form, isActive: v })} />
          </div>

          {/* Custom permissions */}
          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('صلاحيات مخصصة', 'Custom Permissions', lang)}</p>
                <p className="text-xs text-muted-foreground">{t('حدّد الشاشات المرئية والصلاحيات داخل كل شاشة', 'Choose visible screens and the actions allowed within each', lang)}</p>
              </div>
              <Switch checked={useCustom} onCheckedChange={setUseCustom} disabled={isOwner} />
            </div>

            {isOwner && (
              <p className="text-xs text-violet-600">{t('المالك لديه صلاحية الوصول الكامل دائماً.', 'Owner always has full access.', lang)}</p>
            )}

            {!useCustom && !isOwner && (
              <p className="text-xs text-amber-600">{t('يتم تطبيق صلاحيات الدور الافتراضية. فعّل الخيار أعلاه للتخصيص.', 'Default role permissions apply. Enable the switch above to customize.', lang)}</p>
            )}

            <PermissionMatrix
              lang={lang}
              disabled={matrixDisabled}
              visibleModules={effectiveModules}
              moduleActions={moduleActions}
              onToggleModule={toggleModule}
              onToggleAction={toggleAction}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button onClick={handleSave} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? t('جارٍ الحفظ...', 'Saving...', lang) : t('حفظ', 'Save', lang)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}