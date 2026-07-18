// ═══════════════════════════════════════════════════════════════════════
// useParties — ذاكرة مؤقتة مشتركة للعملاء والموردين.
//
// عدة شاشات (SalesInvoices, PurchaseOrders, ClientPayments, SupplierPayments,
// Expenses, Reports) تستدعي Client.list() و Supplier.list() بشكل مستقل
// عند mount. هذا الـ hook يوحّد الطلب في cache مشترك (10 دقيقة TTL).
// ═══════════════════════════════════════════════════════════════════════
import { useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const TTL = 10 * 60 * 1000; // 10 دقائق

function makeCache(fetcher) {
  let _data = null;
  let _at = 0;
  let _promise = null;

  async function _fetch(force = false) {
    const now = Date.now();
    if (!force && _data && (now - _at) < TTL) return _data;
    if (_promise) return _promise;
    _promise = (async () => {
      try {
        _data = await fetcher();
        _at = Date.now();
        return _data;
      } catch {
        return _data || [];
      } finally {
        _promise = null;
      }
    })();
    return _promise;
  }

  return {
    _fetch,
    get: () => _data,
    invalidate: () => { _data = null; _at = 0; },
  };
}

const clientsCache = makeCache(() => base44.entities.Client.list('-created_date', 500));
const suppliersCache = makeCache(() => base44.entities.Supplier.list('-created_date', 500));

export function useClients() {
  const [clients, setClients] = useState(clientsCache.get() || []);
  const [loading, setLoading] = useState(!clientsCache.get());

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await clientsCache._fetch();
    setClients(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    const cached = clientsCache.get();
    if (cached) { setClients(cached); setLoading(false); return; }
    load();
  }, [load]);

  return { clients, loading, reload: () => clientsCache._fetch(true).then(setClients) };
}

export function useSuppliers() {
  const [suppliers, setSuppliers] = useState(suppliersCache.get() || []);
  const [loading, setLoading] = useState(!suppliersCache.get());

  const load = useCallback(async () => {
    setLoading(true);
    const rows = await suppliersCache._fetch();
    setSuppliers(rows);
    setLoading(false);
    return rows;
  }, []);

  useEffect(() => {
    const cached = suppliersCache.get();
    if (cached) { setSuppliers(cached); setLoading(false); return; }
    load();
  }, [load]);

  return { suppliers, loading, reload: () => suppliersCache._fetch(true).then(setSuppliers) };
}

export function invalidateClients() { clientsCache.invalidate(); }
export function invalidateSuppliers() { suppliersCache.invalidate(); }
export async function prefetchClients() { return clientsCache._fetch(); }
export async function prefetchSuppliers() { return suppliersCache._fetch(); }
