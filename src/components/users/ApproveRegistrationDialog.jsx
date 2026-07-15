import React, { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { base44 } from '@/api/base44Client';
import { useToast } from '@/components/ui/use-toast';
import { t } from '@/lib/utils-binaa';
import { APP_ROLES, APP_ROLE_KEYS, ACTION_KEYS, resolveUserModules } from '@/lib/permissions';
import PermissionMatrix from '@/components/users/PermissionMatrix';
import { UserCheck } from 'lucide-react';

export default function ApproveRegistrationDialog({ open, onOpenChange, request, onDone, lang }) {
  const { toast } = useToast();
  const [appRole, setAppRole] = useState('VIEWER');
  const [useCustom, setUseCustom] = useState(false);
  const [customModules, setCustomModules] = useState([]);
  const [moduleActions, setModuleActions] = useState({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (request) {
      setAppRole('VIEWER');
      setUseCustom(false);
      const modules = resolveUserModules({ role: 'user', appRole: 'VIEWER', allowedModules: [] });
      setCustomModules(modules);
      setModuleActions(Object.fromEntries(modules.map(k => [k, [...ACTION_KEYS]])));
    }
  }, [request]);

  if (!request) return null;

  const isOwner = appRole === 'OWNER';
  const defaultModules = resolveUserModules({ role: isOwner ? 'admin' : 'user', appRole, allowedModules: [] });
  const visibleModules = useCustom && !isOwner ? customModules : defaultModules;

  const toggleModule = (key) => {
    setCustomModules(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    setModuleActions(prev => ({ ...prev, [key]: prev[key] || [...ACTION_KEYS] }));
  };

  const toggleAction = (key, action) => {
    setModuleActions(prev => {
      const current = prev[key] || [...ACTION_KEYS];
      return { ...prev, [key]: current.includes(action) ? current.filter(a => a !== action) : [...current, action] };
    });
  };

  const approve = async () => {
    setSaving(true);
    try {
      const cleanedActions = {};
      if (useCustom && !isOwner) customModules.forEach(k => { cleanedActions[k] = moduleActions[k] || [...ACTION_KEYS]; });
      await base44.users.approveRegistrationRequest({
        id: request.id,
        appRole,
        allowedModules: useCustom && !isOwner ? customModules : [],
        modulePermissions: useCustom && !isOwner ? cleanedActions : {},
      });
      toast({ title: t('تم اعتماد المستخدم', 'User approved', lang) });
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast({ title: t('تعذر الاعتماد', 'Approval failed', lang), description: e.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserCheck className="size-5 text-emerald-600" />
            {t('اعتماد طلب تسجيل', 'Approve registration request', lang)} — {request.email}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="font-medium">{request.fullName || '—'}</div>
            <div className="text-muted-foreground" dir="ltr">{request.email}</div>
          </div>

          <div className="space-y-1.5">
            <Label>{t('الدور والصلاحية', 'Role and access', lang)}</Label>
            <Select value={appRole} onValueChange={setAppRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {APP_ROLE_KEYS.map(k => (
                  <SelectItem key={k} value={k}>{lang === 'ar' ? APP_ROLES[k].ar : APP_ROLES[k].en}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="rounded-lg border p-3 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('صلاحيات مخصصة', 'Custom permissions', lang)}</p>
                <p className="text-xs text-muted-foreground">{t('فعّلها لاختيار الشاشات والصلاحيات يدوياً.', 'Enable to choose screens and actions manually.', lang)}</p>
              </div>
              <Switch checked={useCustom} onCheckedChange={setUseCustom} disabled={isOwner} />
            </div>
            {isOwner && <p className="text-xs text-violet-600">{t('المالك لديه صلاحية كاملة دائماً.', 'Owner always has full access.', lang)}</p>}
            <PermissionMatrix
              lang={lang}
              disabled={!useCustom || isOwner}
              visibleModules={visibleModules}
              moduleActions={moduleActions}
              onToggleModule={toggleModule}
              onToggleAction={toggleAction}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t('إلغاء', 'Cancel', lang)}</Button>
          <Button onClick={approve} disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
            {saving ? t('جارٍ الاعتماد...', 'Approving...', lang) : t('اعتماد وإنشاء المستخدم', 'Approve and create user', lang)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}