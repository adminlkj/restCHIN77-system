// Simple global state using React context + localStorage
import { createContext, useContext, useState } from 'react';

const StoreContext = createContext(null);

export function StoreProvider({ children }) {
  const [lang, setLang] = useState(() => localStorage.getItem('binaa-lang') || 'ar');
  // ابدأ من شاشة الفروع — المستخدم يختار فرعاً ثم طاولة ثم يبدأ البيع.
  const [activeItem, setActiveItem] = useState(() => localStorage.getItem('restaurant-active-item') || 'branches');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // حفظ العنصر النشط لاستعادته عند إعادة التحميل
  const setActiveItemPersist = (item) => {
    setActiveItem(item);
    try { localStorage.setItem('restaurant-active-item', item); } catch { /* ignore */ }
  };

  // ─── Context Engine: السياق النشط أثناء التنقل ────────────────────────────
  const [activeProjectId, setActiveProjectId] = useState(null);
  const [activeProjectName, setActiveProjectName] = useState(null);
  const [activeClientId, setActiveClientId] = useState(null);
  const [activeClientName, setActiveClientName] = useState(null);
  const [activeEquipmentId, setActiveEquipmentId] = useState(null);
  const [activeEquipmentName, setActiveEquipmentName] = useState(null);
  const [activeEmployeeId, setActiveEmployeeId] = useState(null);
  const [activeEmployeeName, setActiveEmployeeName] = useState(null);
  const [activeSubcontractorId, setActiveSubcontractorId] = useState(null);
  const [activeSubcontractorName, setActiveSubcontractorName] = useState(null);

  const setSubcontractorContext = (id, name) => {
    setActiveSubcontractorId(id);
    setActiveSubcontractorName(name);
  };

  const setEquipmentContext = (id, name) => {
    setActiveEquipmentId(id);
    setActiveEquipmentName(name);
  };

  const setEmployeeContext = (id, name) => {
    setActiveEmployeeId(id);
    setActiveEmployeeName(name);
  };

  const setProjectContext = (id, name) => {
    setActiveProjectId(id);
    setActiveProjectName(name);
    // عند اختيار مشروع، امسح سياق العميل السابق إن وجد
    if (!id) { setActiveClientId(null); setActiveClientName(null); }
  };

  const setClientContext = (id, name) => {
    setActiveClientId(id);
    setActiveClientName(name);
  };

  const clearContext = () => {
    setActiveProjectId(null);
    setActiveProjectName(null);
    setActiveClientId(null);
    setActiveClientName(null);
  };

  const toggleLang = () => {
    const next = lang === 'ar' ? 'en' : 'ar';
    setLang(next);
    localStorage.setItem('binaa-lang', next);
  };

  return (
    <StoreContext.Provider value={{
      lang, toggleLang,
      activeItem, setActiveItem: setActiveItemPersist,
      sidebarOpen, setSidebarOpen,
      // Context Engine
      activeProjectId, activeProjectName,
      activeClientId, activeClientName,
      activeEquipmentId, activeEquipmentName, setEquipmentContext,
      activeEmployeeId, activeEmployeeName, setEmployeeContext,
      activeSubcontractorId, activeSubcontractorName, setSubcontractorContext,
      setProjectContext, setClientContext, clearContext,
      // convenience aliases used by some pages
      setActiveProjectId, setActiveProjectName,
      setActiveClientId, setActiveClientName,
    }}>
      {children}
    </StoreContext.Provider>
  );
}

export function useStore() {
  return useContext(StoreContext);
}