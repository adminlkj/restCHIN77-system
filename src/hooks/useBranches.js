// ═══════════════════════════════════════════════════════════════════════
// useBranches — ذاكرة مؤقتة مشتركة لقائمة الفروع (Project entity).
//
// المشكلة: أكثر من 12 شاشة تستدعي base44.entities.Project.list() بشكل
// مستقل عند mount، مما يُسبب طلبات متكررة للـ backend عند كل تنقّل.
//
// الحل: cache على مستوى الوحدة (module-level) مع dedup للطلبات المتزامنة
// و TTL 10 دقائق (الفروع نادراً ما تتغير). كل المستهلكين يشاركون نفس
// الطلب والنتيجة.
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

let _branches = null;
let _branchesAt = 0;
let _branchesPromise = null;
const BRANCHES_TTL = 10 * 60 * 1000; // 10 دقائق

async function _fetchBranches(force = false) {
  const now = Date.now();
  if (!force && _branches && (now - _branchesAt) < BRANCHES_TTL) {
    return _branches;
  }
  if (_branchesPromise) return _branchesPromise;
  _branchesPromise = (async () => {
    try {
      const rows = await base44.entities.Project.list('-created_date', 500);
      _branches = rows || [];
      _branchesAt = Date.now();
      return _branches;
    } catch {
      return _branches || [];
    } finally {
      _branchesPromise = null;
    }
  })();
  return _branchesPromise;
}

export function useBranches() {
  const [branches, setBranches] = useState(_branches || []);
  const [loading, setLoading] = useState(!_branches);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await _fetchBranches();
    setBranches(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    if (_branches) { setBranches(_branches); setLoading(false); return; }
    load();
  }, [load]);

  return { branches, loading, reload: () => _fetchBranches(true).then(setBranches) };
}

// وصول مباشر للقيمة المخزّنة (للاستخدام خارج React، مثل AppShell).
export function getCachedBranches() {
  return _branches || [];
}

// ملء الـ cache مسبقاً (pre-warm) — يُستدعى بعد تسجيل الدخول.
export async function prefetchBranches() {
  return _fetchBranches();
}

// إبطال الـ cache عند إنشاء/تعديل/حذف فرع.
export function invalidateBranches() {
  _branches = null;
  _branchesAt = 0;
}
