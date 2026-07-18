import React, { createContext, useState, useContext, useEffect } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

// وضع التطوير: يتخطى شاشة الدخول ويدخل مباشرة إلى النظام للاختبار قبل النشر.
// يتم تفعيله فقط عبر متغير البيئة VITE_DEV_BYPASS_AUTH=true.
// افتراضياً = false (آمن للإنتاج) بحيث يُستخدم نظام مصادقة Base44 الحقيقي.
const DEV_BYPASS_AUTH = import.meta.env.VITE_DEV_BYPASS_AUTH === 'true';
const DEV_USER = {
  id: 'dev-owner',
  email: 'dev@restchin.local',
  full_name: 'System Developer',
  role: 'admin',
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(false);
  const [authError, setAuthError] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [appPublicSettings] = useState({ public_settings: { requiresAuth: true } });

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    setAuthError(null);
    setIsLoadingPublicSettings(false);
    await checkUserAuth();
  };

  const checkUserAuth = async () => {
    if (DEV_BYPASS_AUTH) {
      setUser(DEV_USER);
      setIsAuthenticated(true);
      setAuthError(null);
      setIsLoadingAuth(false);
      setAuthChecked(true);
      return;
    }
    try {
      setIsLoadingAuth(true);
      const currentUser = await base44.auth.me();
      if (currentUser && (currentUser.email || currentUser.id)) {
        setUser(currentUser);
        setIsAuthenticated(true);
        setAuthError(null);
      } else {
        throw new Error('No user session');
      }
    } catch (error) {
      setUser(null);
      setIsAuthenticated(false);
      setAuthError({ type: 'auth_required', message: 'Authentication required' });
    } finally {
      setIsLoadingAuth(false);
      setAuthChecked(true);
    }
  };

  const logout = (shouldRedirect = true) => {
    base44.auth.logout();
    setUser(null);
    setIsAuthenticated(false);
    // ملاحظة: إبطال كاش الإعدادات يتم عبر إعادة تحميل الصفحة (window.location.href).
    // لا حاجة لاستيراد ديناميكي هنا.
    if (shouldRedirect) window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};