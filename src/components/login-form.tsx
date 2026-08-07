import { cn } from '@/lib/utils';
import { useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Link, useNavigate } from 'react-router-dom';
import { authAPI } from '@/services/api/auth';
import { useAuthStore } from '@/stores/authStore';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/label';

// The shared public demo account — the same credentials the landing page
// prints, published on purpose. GeneralSettings re-declares DEMO_EMAIL for
// its own check; neither module exports it, so this form keeps its own copy.
const DEMO_EMAIL = 'john@example.com';
const DEMO_PASSWORD = 'password123';

export function LoginForm({
  className,
  ...props
}: React.ComponentProps<'div'>) {
  const navigate = useNavigate();
  const setJWTAuth = useAuthStore((s) => s.setJWTAuth);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const doLogin = async (loginEmail: string, loginPassword: string) => {
    setBusy(true);
    setError(null);
    const res = await authAPI.login({
      email: loginEmail,
      password: loginPassword,
    });
    setBusy(false);
    if (!res.success || !res.data) {
      setError(res.message || 'Login failed');
      return;
    }
    setJWTAuth(res.data.tokens, res.data.user);
    navigate('/');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(email, password);
  };

  const handleDemoLogin = async () => {
    // Fill the visible form so the sign-in is watchable, then run the same
    // login path the form submits through — the demo never bypasses auth.
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    await doLogin(DEMO_EMAIL, DEMO_PASSWORD);
  };

  const handleGoogleLogin = () => {
    const redirectUri = `${window.location.origin}/auth/google/callback`;
    const url = authAPI.getGoogleAuthUrl(redirectUri);
    window.location.href = url;
  };

  return (
    <div className={cn('flex flex-col gap-6', className)} {...props}>
      <Card className="bg-transparent shadow-none border-transparent">
        <CardHeader>
          <p className="mb-1 font-mono text-[0.68rem] uppercase tracking-[0.09em] text-white/40">
            sign in
          </p>
          <CardTitle className="text-2xl tracking-tight text-white">
            Welcome back.
          </CardTitle>
          <CardDescription className="text-white/50">
            Your calendar and tasks, exactly where you left them.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin}>
            <div className="flex flex-col gap-6">
              <div className="grid gap-3">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="m@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="grid gap-3">
                <div className="flex items-center">
                  <Label htmlFor="password">Password</Label>
                </div>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-red-500">
                  {error}
                </p>
              )}
              <div className="flex flex-col gap-3">
                <Button
                  type="submit"
                  variant="authPrimary"
                  disabled={busy}
                  className={cn(
                    'w-full cursor-glow-border',
                    // Keep transitions for other properties, but no color change on hover in light mode
                    'transition-colors duration-200'
                  )}
                >
                  {busy ? 'Signing in…' : 'Login'}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full transition-colors duration-200 hover:bg-[oklch(0.18_0.01_260)] hover:text-white"
                  onClick={handleGoogleLogin}
                >
                  {/* Google G icon (SVG) */}
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 48 48"
                    className="h-4 w-4"
                  >
                    <path
                      fill="#FFC107"
                      d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.156 7.96 3.04l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.651-.389-3.917z"
                    />
                    <path
                      fill="#FF3D00"
                      d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.156 7.96 3.04l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z"
                    />
                    <path
                      fill="#4CAF50"
                      d="M24 44c5.166 0 9.86-1.977 13.409-5.196l-6.19-5.238C29.148 35.091 26.689 36 24 36c-5.202 0-9.616-3.317-11.277-7.946l-6.55 5.046C9.488 38.556 16.227 44 24 44z"
                    />
                    <path
                      fill="#1976D2"
                      d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.094 5.566.001-.001 6.19 5.238 6.19 5.238C39.441 35.894 44 30.5 44 24c0-1.341-.138-2.651-.389-3.917z"
                    />
                  </svg>
                  Login with Google
                </Button>
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={handleDemoLogin}
                  aria-describedby="demo-account-note"
                  className="w-full text-white/70 transition-colors duration-200 hover:bg-white/5 hover:text-white/90 dark:hover:bg-white/5"
                >
                  Sign in as the demo account
                </Button>
                <p
                  id="demo-account-note"
                  className="text-center font-mono text-xs leading-relaxed text-white/70"
                >
                  shared public account ·{' '}
                  <span className="whitespace-nowrap">
                    {DEMO_EMAIL} / {DEMO_PASSWORD}
                  </span>
                </p>
              </div>
            </div>
            <div className="mt-4 text-center text-sm">
              Don&apos;t have an account?{' '}
              <Link to="/signup" className="underline underline-offset-4">
                Sign up
              </Link>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
