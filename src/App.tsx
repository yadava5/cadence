import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import { QueryProvider, ThemeProvider } from './components/providers';
import { ProtectedRoute, PublicRoute, AuthLayout } from './components/auth';
import { lazy, Suspense } from 'react';
import { Toaster } from 'sonner';
import { Loader2 } from 'lucide-react';
import DevAuthToggle from './components/dev/DevAuthToggle';

/**
 * Fallback shown while a lazy route chunk downloads. Without this the Suspense
 * boundary rendered `null`, so entering the app right after login (MainLayout
 * chunk not yet cached) flashed a blank screen. Mirrors the ProtectedRoute
 * "Verifying your session" spinner so the whole entry feels like one loader.
 */
function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
    </div>
  );
}

const MainLayout = lazy(async () => ({
  default: (await import('./components/layout/MainLayout')).MainLayout,
}));
const LoginPage = lazy(async () => ({
  default: (await import('./pages/Login')).LoginPage,
}));
const SignupPage = lazy(async () => ({
  default: (await import('./pages/Signup')).SignupPage,
}));
const WelcomePage = lazy(() => import('./pages/Welcome'));
const GoogleCallbackPage = lazy(async () => ({
  default: (await import('./pages/GoogleCallback')).GoogleCallbackPage,
}));

function App() {
  return (
    <QueryProvider>
      <ThemeProvider>
        <Router>
          {/* Dev-only mock-auth toggle. `import.meta.env.DEV` is a build-time
              constant: in a production build this folds to `false &&`, the JSX
              is dropped, the import above is left unreferenced and Rollup
              tree-shakes the module away — verified by grepping dist/ for
              "Mock Login" / "mock-access-token" (0 hits). The old version
              gated an always-imported component behind runtime state, so all
              of it shipped. Deliberately NOT React.lazy: rendering an
              unmocked lazy component under this vitest setup sends
              src/App.test.tsx into an allocation loop until the worker OOMs. */}
          {import.meta.env.DEV && <DevAuthToggle />}
          <Toaster
            position="top-right"
            closeButton
            theme="system"
            richColors
            toastOptions={{
              classNames: {
                toast:
                  'rounded-md shadow-lg border border-border text-foreground bg-background',
                description: 'text-muted-foreground',
                success: 'bg-emerald-600 text-white',
                error: 'bg-red-600 text-white',
                warning: 'bg-amber-600 text-white',
              },
            }}
          />
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              {/* Public routes */}
              <Route
                path="/welcome"
                element={
                  <PublicRoute>
                    <WelcomePage />
                  </PublicRoute>
                }
              />
              <Route
                path="/login"
                element={
                  <PublicRoute>
                    <AuthLayout>
                      <LoginPage />
                    </AuthLayout>
                  </PublicRoute>
                }
              />
              <Route
                path="/signup"
                element={
                  <PublicRoute>
                    <AuthLayout>
                      <SignupPage />
                    </AuthLayout>
                  </PublicRoute>
                }
              />
              <Route
                path="/auth/google/callback"
                element={<GoogleCallbackPage />}
              />

              {/* Protected routes — logged-out visitors land on /welcome */}
              <Route
                path="/"
                element={
                  <ProtectedRoute redirectTo="/welcome">
                    <MainLayout />
                  </ProtectedRoute>
                }
              />

              {/* Redirect to login for unknown routes */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </Router>
      </ThemeProvider>
    </QueryProvider>
  );
}

export default App;
