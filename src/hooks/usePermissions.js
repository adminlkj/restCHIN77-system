import { useMemo } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { canAccess, hasPermission, resolveModuleActions } from '@/lib/permissions';

// Convenience hook for gating in-screen controls by the current user's
// granted actions on a given module.
//
//   const perm = usePermissions('projects');
//   perm.canView / perm.canCreate / perm.canEdit / perm.canDelete
//   perm.can('edit')
//
export function usePermissions(moduleKey) {
  const { user } = useAuth();
  return useMemo(() => {
    const actions = moduleKey ? resolveModuleActions(user, moduleKey) : [];
    return {
      user,
      actions,
      canView: moduleKey ? canAccess(user, moduleKey) : false,
      canCreate: hasPermission(user, moduleKey, 'create'),
      canEdit: hasPermission(user, moduleKey, 'edit'),
      canDelete: hasPermission(user, moduleKey, 'delete'),
      can: (action) => hasPermission(user, moduleKey, action),
    };
  }, [user, moduleKey]);
}