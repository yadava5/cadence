import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { useAuthStore } from '@/stores/authStore';

vi.mock('./components/layout/MainLayout', () => ({
  MainLayout: () => <div>Mock MainLayout</div>,
}));

vi.mock('./pages/Login', () => ({
  LoginPage: () => <div>Login Page</div>,
}));

// Logged-out visitors land on the public welcome landing (App routes "/" through
// ProtectedRoute redirectTo="/welcome"), so stub the landing for this router test.
vi.mock('./pages/Welcome', () => ({
  default: () => <div>Welcome Landing</div>,
}));

import App from './App';

const resetAuthState = () => {
  useAuthStore.setState({
    isAuthenticated: false,
    isLoading: false,
    authMethod: null,
    jwtTokens: null,
    user: null,
    googleTokens: null,
    googleUser: null,
    error: null,
  });
};

const setAuthenticatedState = () => {
  useAuthStore.setState({
    isAuthenticated: true,
    isLoading: false,
    authMethod: 'jwt',
    jwtTokens: {
      accessToken: 'mock-access-token',
      refreshToken: 'mock-refresh-token',
      expiresAt: Date.now() + 60 * 60 * 1000,
    },
    user: {
      id: 'user-123',
      email: 'test@example.com',
      name: 'Test User',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    googleTokens: null,
    googleUser: null,
    error: null,
  });
};

describe('App', () => {
  beforeEach(() => {
    resetAuthState();
  });

  it('redirects unauthenticated users to the welcome landing', async () => {
    render(<App />);
    expect(await screen.findByText(/Welcome Landing/i)).toBeInTheDocument();
  });

  it('renders the main layout for authenticated users', async () => {
    setAuthenticatedState();
    render(<App />);

    expect(await screen.findByText(/Mock MainLayout/i)).toBeInTheDocument();
  });
});
