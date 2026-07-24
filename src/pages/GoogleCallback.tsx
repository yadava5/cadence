import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/Button';
import { useAuthStore } from '@/stores/authStore';
import { authAPI } from '@/services/api/auth';

export function GoogleCallbackPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [status, setStatus] = useState<'loading' | 'success' | 'error'>(
    'loading'
  );
  const [errorMessage, setErrorMessage] = useState<string>('');

  const { setJWTAuth, setError } = useAuthStore();

  useEffect(() => {
    const handleGoogleCallback = async () => {
      try {
        // Get authorization code from URL parameters
        const code = searchParams.get('code');
        const error = searchParams.get('error');
        const state = searchParams.get('state');

        if (error) {
          throw new Error(`Google OAuth error: ${error}`);
        }

        if (!code) {
          throw new Error('Authorization code not found');
        }

        const redirectUri = `${window.location.origin}/auth/google/callback`;

        if (state === 'calendar') {
          // "Connect Google Calendar" grant for an already-signed-in user:
          // hand the code to the calendar endpoint (Bearer-authed), which
          // stores the refresh token server-side and runs a first sync.
          // The Google consent round-trip can outlast the short-lived (~15 min)
          // Cadence access token, so refresh a near-expired token first and
          // retry once on a 401 — otherwise this final hand-off 401s with
          // "Sign in first" the instant after the user consented.
          await useAuthStore.getState().refreshTokenIfNeeded();
          if (!useAuthStore.getState().jwtTokens?.accessToken) {
            throw new Error('Sign in before connecting Google Calendar');
          }
          const postConnect = () =>
            fetch('/api/google/calendar', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${
                  useAuthStore.getState().jwtTokens?.accessToken ?? ''
                }`,
              },
              body: JSON.stringify({ code, redirectUri }),
            });
          let resp = await postConnect();
          if (resp.status === 401) {
            const refreshed = await useAuthStore
              .getState()
              .refreshTokenIfNeeded(true);
            if (refreshed) resp = await postConnect();
          }
          const payload = await resp.json();
          if (!resp.ok || !payload.success) {
            throw new Error(
              payload.error?.message || 'Failed to connect Google Calendar'
            );
          }
          setStatus('success');
          setTimeout(
            () => navigate('/?google=connected', { replace: true }),
            1200
          );
          return;
        }

        // Sign-in flow: exchange the code for a TaskFlow session (JWTs).
        const response = await authAPI.googleAuth({ code, redirectUri });

        if (!response.success || !response.data) {
          throw new Error(response.message || 'Google authentication failed');
        }

        const { tokens, user } = response.data;

        setJWTAuth(tokens, {
          id: user.id,
          email: user.email,
          name: user.name ?? user.email.split('@')[0],
          createdAt: user.createdAt,
          updatedAt: user.createdAt,
        });

        // Google sign-in now grants Calendar (calendar.events) in the SAME
        // consent, and the server persisted the calendar refresh token during
        // the exchange above — so this user is already calendar-connected.
        // Kick off a best-effort first pull sync so events land in the grid on
        // arrival, exactly like the manual "Connect Google Calendar" flow does.
        // This is intentionally non-fatal: if the user declined the calendar
        // checkbox on the consent screen (no calendar grant) or the sync fails
        // for any reason, we swallow it — the account is still signed in and can
        // connect from Settings later. Uses the freshly minted access token.
        try {
          await fetch('/api/google/calendar', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${tokens.accessToken}`,
            },
            body: JSON.stringify({}),
          });
        } catch {
          // best-effort; never block Google sign-in on the calendar pull
        }

        setStatus('success');

        // Redirect after a short delay
        setTimeout(() => {
          navigate('/', { replace: true });
        }, 1500);
      } catch (error) {
        console.error('Google callback error:', error);
        const message =
          error instanceof Error
            ? error.message
            : 'Google authentication failed';
        setErrorMessage(message);
        setError(message);
        setStatus('error');
      }
    };

    handleGoogleCallback();
  }, [searchParams, navigate, setJWTAuth, setError]);

  const handleRetry = () => {
    navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-blue-50 via-green-50 to-teal-50 dark:from-slate-900 dark:via-slate-800 dark:to-slate-900">
      <Card className="w-full max-w-md mx-auto shadow-2xl border-0 bg-white/95 dark:bg-slate-950/95 backdrop-blur-sm">
        <CardHeader className="text-center pb-4">
          <CardTitle className="text-xl font-semibold text-slate-900 dark:text-slate-100">
            Google Authentication
          </CardTitle>
          <CardDescription className="text-slate-600 dark:text-slate-400">
            {status === 'loading' && 'Processing your authentication...'}
            {status === 'success' && 'Successfully authenticated!'}
            {status === 'error' && 'Authentication failed'}
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col items-center space-y-6">
          {status === 'loading' && (
            <div className="flex flex-col items-center space-y-4">
              <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
              <div className="text-center">
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  Please wait while we complete your sign-in...
                </p>
                <div className="mt-2 flex items-center justify-center space-x-1">
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse delay-100" />
                  <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse delay-200" />
                </div>
              </div>
            </div>
          )}

          {status === 'success' && (
            <div className="flex flex-col items-center space-y-4">
              <div className="p-3 rounded-full bg-green-100 dark:bg-green-900/30">
                <CheckCircle className="h-8 w-8 text-green-600 dark:text-green-400" />
              </div>
              <div className="text-center">
                <p className="font-medium text-slate-900 dark:text-slate-100">
                  Welcome!
                </p>
                <p className="text-sm text-slate-600 dark:text-slate-400 mt-1">
                  You'll be redirected to your dashboard shortly.
                </p>
              </div>
            </div>
          )}

          {status === 'error' && (
            <div className="w-full space-y-4">
              <div className="flex flex-col items-center space-y-4">
                <div className="p-3 rounded-full bg-red-100 dark:bg-red-900/30">
                  <AlertCircle className="h-8 w-8 text-red-600 dark:text-red-400" />
                </div>
                <div className="text-center">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    Something went wrong
                  </p>
                </div>
              </div>

              <Alert className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/50">
                <AlertDescription className="text-red-800 dark:text-red-200 text-sm">
                  {errorMessage}
                </AlertDescription>
              </Alert>

              <Button
                onClick={handleRetry}
                className="w-full h-11 bg-gradient-to-r from-emerald-500 to-teal-600 hover:from-emerald-600 hover:to-teal-700 text-white"
              >
                Try Again
              </Button>
            </div>
          )}

          {/* Progress indicator for loading state */}
          {status === 'loading' && (
            <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1">
              <div
                className="bg-gradient-to-r from-emerald-500 to-teal-600 h-1 rounded-full animate-pulse"
                style={{ width: '60%' }}
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
