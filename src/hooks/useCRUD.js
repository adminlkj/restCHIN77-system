// Shared CRUD hook to eliminate repeated patterns across all pages
import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';

const errorMessage = (err, fallback) => err?.data?.error || err?.message || fallback;

export function useCRUD(entity, { defaultSort = '-created_date', relatedLoaders = [] } = {}) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const results = await Promise.all([
        entity.list(defaultSort),
        ...relatedLoaders.map(fn => fn()),
      ]);
      setItems(results[0]);
      setLoading(false);
      return results;
    } catch (err) {
      console.error('Load error:', err);
      toast.error(errorMessage(err, 'فشل تحميل البيانات — Load failed'));
      setLoading(false);
      return null;
    }
  }, []);

  useEffect(() => { load(); }, []);

  const create = async (data, successMsg = 'تمت الإضافة') => {
    setSaving(true);
    try {
      await entity.create(data);
      toast.success(successMsg);
      await load();
      setSaving(false);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'فشل الحفظ — Save failed'));
      setSaving(false);
      return false;
    }
  };

  const update = async (id, data, successMsg = 'تم التحديث') => {
    setSaving(true);
    try {
      await entity.update(id, data);
      toast.success(successMsg);
      await load();
      setSaving(false);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'فشل التحديث — Update failed'));
      setSaving(false);
      return false;
    }
  };

  const remove = async (id, successMsg = 'تم الحذف') => {
    setSaving(true);
    try {
      await entity.delete(id);
      toast.success(successMsg);
      await load();
      setSaving(false);
      return true;
    } catch (err) {
      toast.error(errorMessage(err, 'فشل الحذف — Delete failed'));
      setSaving(false);
      return false;
    }
  };

  return { items, setItems, loading, saving, setSaving, load, create, update, remove };
}