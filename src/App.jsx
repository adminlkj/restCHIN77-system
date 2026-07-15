import { Toaster } from "@/components/ui/toaster"
import { Toaster as SonnerToaster } from 'sonner'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ScrollToTop from './components/ScrollToTop';
import { StoreProvider, useStore } from '@/lib/store';
import AppShell from '@/components/layout/AppShell';
import { CYCLE_BY_KEY, cycleForTab } from '@/lib/cycles';

// Pages
import Dashboard from '@/pages/Dashboard';
import CycleScreen from '@/pages/CycleScreen';
import ProjectWorkspace from '@/pages/ProjectWorkspace';
import EquipmentWorkspace from '@/pages/EquipmentWorkspace';
import EmployeeWorkspace from '@/pages/EmployeeWorkspace';
import SubcontractorWorkspace from '@/pages/SubcontractorWorkspace';
import Branches from '@/pages/Branches';
import Tables from '@/pages/Tables';
import POS from '@/pages/POS';
import Profile from '@/pages/Profile';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import { Navigate } from 'react-router-dom';

// Standalone screens that are opened from within a cycle (not a cycle themselves).
const STANDALONE = {
  dashboard: <Dashboard />,
  profile: <Profile />,
  'project-workspace': <ProjectWorkspace />,
  'equipment-workspace': <EquipmentWorkspace />,
  'employee-workspace': <EmployeeWorkspace />,
  'subcontractor-workspace': <SubcontractorWorkspace />,
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
      {currentPage}
    </AppShell>
  );
}

// Auth routes are always available so the in-app login/register pages render.
const AuthRoutes = () => (
  <Routes>
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
    <Route path="/forgot-password" element={<ForgotPassword />} />
    <Route path="/reset-password" element={<ResetPassword />} />
    <Route path="*" element={<Navigate to="/login" replace />} />
  </Routes>
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