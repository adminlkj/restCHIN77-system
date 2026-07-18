// Simple global state using React context + localStorage
//
// مهم: قيمة الـ context مُغلَّفة بـ useMemo لتفادي إعادة إنشائها عند كل render.
// بدون هذا، كل مستهلك لـ useStore() يُعاد render عند أي تغيير صغير،
// وكل useCallback/useEffect يعتمد على القيمة يُعاد تنفيذه → طلبات API متكررة.
import { createContext, useContext, useState, useMemo, useCallback } from 'react';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('binaa-lang') || 'ar');
  // ابدأ من شاشة الفروع — المستخدم يختار فرعاً ثم طاولة ثم يبدأ البيع.
  const [activeItem, setActiveItem] = useState(() => localStorage.getItem('restaurant-active-item') || 'branches');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // ─── Context Engine: السياق النشط أثناء التنقل ────────────────────────────
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectName, setActiveProjectName] = useState(null);
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeClientName, setActiveClientName] = useState(null);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [activeEquipmentName, setActiveEquipmentName] = useState(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState(null);
  const [activeEmployeeName, setActiveEmployeeName] = useState(null);

  // ─── Stable callbacks (useCallback لتفادي إعادة إنشائها) ──────────────────
  const setActiveItemPersist = useCallback((item) => {
    setActiveItem(item);
    try { localStorage.setItem('restaurant-active-item', item); } catch { /* ignore */ }
  }, []);

  const setEquipmentContext = useCallback((id, name) => {
    setActiveEquipmentId(id);
    setActiveEquipmentName(name);
  }, []);

  const setEmployeeContext = useCallback((id, name) => {
    setActiveEmployeeId(id);
    setActiveEmployeeName(name);
  }, []);

  const setProjectContext = useCallback((id, name) => {
    setActiveProjectId(id);
    setActiveProjectName(name);
    // عند اختيار مشروع، امسح سياق العميل السابق إن وجد
    if (!id) { setActiveClientId(null); setActiveClientName(null); }
  }, []);

  const setClientContext = useCallback((id, name) => {
    setActiveClientId(id);
    setActiveClientName(name);
  }, []);

  const clearContext = useCallback(() => {
    setActiveProjectId(null);
    setActiveProjectName(null);
    setActiveClientId(null);
    setActiveClientName(null);
  }, []);

  const toggleLang = useCallback(() => {
    setLang((prev) => {
      const next = prev === 'ar' ? 'en' : 'ar';
      localStorage.setItem('binaa-lang', next);
      return next;
    });
  }, []);

  // ─── Memoized value: لا تتغير المرجع إلا عند تغيير قيمة فعلية ──────────────
  // هذا يمنع كل مستهلكي useStore() من إعادة الـ render + إعادة تشغيل effects
  // عند أي تغيير في الـ provider (مثل تبديل القائمة الجانبية).
  const value = useMemo(() => ({
    lang, toggleLang,
    activeItem, setActiveItem: setActiveItemPersist,
    sidebarOpen, setSidebarOpen,
    // Context Engine
    activeProjectId, activeProjectName,
    activeClientId, activeClientName,
    activeEquipmentId, activeEquipmentName, setEquipmentContext,
    activeEmployeeId, activeEmployeeName, setEmployeeContext,
    setProjectContext, setClientContext, clearContext,
    // convenience aliases used by some pages
    setActiveProjectId, setActiveProjectName,
    setActiveClientId, setActiveClientName,
  }), [
    lang, toggleLang, activeItem, setActiveItemPersist, sidebarOpen,
    activeProjectId, activeProjectName,
    activeClientId, activeClientName,
    activeEquipmentId, activeEquipmentName, setEquipmentContext,
    activeEmployeeId, activeEmployeeName, setEmployeeContext,
    setProjectContext, setClientContext, clearContext,
  ]);

  return (
    <StoreContext.Provider value={value}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}