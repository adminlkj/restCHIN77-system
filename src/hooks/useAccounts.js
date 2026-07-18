// ═══════════════════════════════════════════════════════════════════════
// useAccounts — ذاكرة مؤقتة مشتركة للدليل المحاسبي (ChartAccount).
//
// 10+ شاشات تستدعي ChartAccount.list() بشكل مستقل (PostingEngine،
// JournalEntries، TrialBalance، Reports، إلخ). كل واحدة تجلب 1000 حساب
// عند mount. هذا الـ hook يوحّد الطلب في cache مشترك (15 دقيقة TTL).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

let _accounts = null;
let _accountsMap = null;
let _accountsAt = 0;
let _accountsPromise = null;
const ACCOUNTS_TTL = 15 * 60 * 1000; // 15 دقيقة — الدليل نادر التغيير

async function _fetchAccounts(force = false) {
  const now = Date.now();
  if (!force && _accounts && (now - _accountsAt) < ACCOUNTS_TTL) {
    return _accounts;
  }
  if (_accountsPromise) return _accountsPromise;
  _accountsPromise = (async () => {
    try {
      const rows = await base44.entities.ChartAccount.list('code', 1000);
      _accounts = rows || [];
      // بناء خريطة للأدوار الدلالية (يستخدمها financialEngine + ledgerEngine)
      _accountsMap = {};
      for (const a of _accounts) {
        if (a.code) _accountsMap[a.code] = a;
      }
      _accountsAt = Date.now();
      return _accounts;
    } catch {
      return _accounts || [];
    } finally {
      _accountsPromise = null;
    }
  })();
  return _accountsPromise;
}

export function useAccounts() {
  const [accounts, setAccounts] = useState(_accounts || []);
  const [loading, setLoading] = useState(!_accounts);

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await _fetchAccounts();
    setAccounts(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    if (_accounts) { setAccounts(_accounts); setLoading(false); return; }
    load();
  }, [load]);

  return { accounts, loading, reload: () => _fetchAccounts(true).then(setAccounts) };
}

// وصول مباشر للقيمة المخزّنة (للاستخدام خارج React).
export function getCachedAccounts() {
  return _accounts || [];
}

export function getCachedAccountMap() {
  return _accountsMap || {};
}

// ملء الـ cache مسبقاً (pre-warm) — يُستدعى بعد تسجيل الدخول.
export async function prefetchAccounts() {
  return _fetchAccounts();
}

// إبطال الـ cache عند إنشاء/تعديل/حذف حساب.
export function invalidateAccounts() {
  _accounts = null;
  _accountsMap = null;
  _accountsAt = 0;
}
