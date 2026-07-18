import { lazy, Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { StoreProvider, useStore } from '@/lib/store';
import AppShell from '@/components/layout/AppShell';
import { CYCLE_BY_KEY, cycleForTab } from '@/lib/cycles';

// Pages — code-split with React.lazy so the initial bundle stays small.
// Each page becomes its own chunk loaded on demand.
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const CycleScreen = lazy(() => import('@/pages/CycleScreen'));
const EmployeeWorkspace = lazy(() => import('@/pages/EmployeeWorkspace'));
const Branches = lazy(() => import('@/pages/Branches'));
const Tables = lazy(() => import('@/pages/Tables'));
const POS = lazy(() => import('@/pages/POS'));
const Profile = lazy(() => import('@/pages/Profile'));
const Login = lazy(() => import('@/pages/Login'));
const Register = lazy(() => import('@/pages/Register'));
const ForgotPassword = lazy(() => import('@/pages/ForgotPassword'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));

// Reusable loading spinner (same emerald spinner used for the auth loading state).
const PageLoader = () => (
  <div className="fixed inset-0 flex items-center justify-center">
    <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin"></div>
  </div>
);

// Standalone screens that are opened from within a cycle (not a cycle themselves).
// Keys map to lazy elements; they're rendered inside a <Suspense> boundary below.
const STANDALONE = {
  dashboard: <Dashboard />,
  profile: <Profile />,
  'employee-workspace': <EmployeeWorkspace />,
  // Restaurant POS screens — reached via setActiveItem() navigation.
  branches: <Branches />,
  tables: <Tables />,
  pos: <POS />,
};

// Resolve the active screen: a cycle key -> CycleScreen; a tab key -> its cycle;
// a standalone key -> its page; otherwise the dashboard.
function MainApp() {
  const { activeItem } = useStore();

  let currentPage;
  if (CYCLE_BY_KEY[activeItem]) {
    currentPage = <CycleScreen cycleKey={activeItem} />;
  } else if (STANDALONE[activeItem]) {
    currentPage = STANDALONE[activeItem];
  } else {
    const owningCycle = cycleForTab(activeItem);
    currentPage = owningCycle ? <CycleScreen cycleKey={owningCycle.key} /> : <Dashboard />;
  }

  return (
    <AppShell>
      <Suspense fallback={<PageLoader />}>
        {currentPage}
      </Suspense>
    </AppShell>
  );
}

// Auth routes are always available so the in-app login/register pages render.
const AuthRoutes = () => (
  <Suspense fallback={<PageLoader />}>
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>
  </Suspense>
);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-emerald-600 rounded-full animate-spin"></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      // Show the in-app login page instead of redirecting to the hosted login.
      return <AuthRoutes />;
    }
  }

  // No token / not signed in (app runs with requiresAuth:false, so no authError
  // is raised). Show the in-app auth pages instead of the dashboard — this is what
  // makes logout land on the login screen instead of bouncing back to the dashboard.
  if (!isAuthenticated) {
    return <AuthRoutes />;
  }

  return (
    <Routes>
      <Route path="/login" element={<Navigate to="/" replace />} />
      <Route path="/register" element={<Navigate to="/" replace />} />
      <Route path="/*" element={<MainApp />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <StoreProvider>
          <Router>
            <ScrollToTop />
            <AuthenticatedApp />
          </Router>
          <Toaster />
          <SonnerToaster richColors closeButton position="top-center" />
        </StoreProvider>
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;