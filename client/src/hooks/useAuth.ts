import { useState, useEffect, createContext, useContext, ReactNode, createElement } from 'react';
import { authService, User } from '../services/auth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (email: string, pass: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshAuth: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const refreshAuth = async () => {
    try {
      setLoading(true);
      const currentUser = await authService.checkAuth();
      setUser(currentUser);
      setError(null);
    } catch (err) {
      setUser(null);
      setError(err instanceof Error ? err.message : 'Failed to authenticate');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshAuth();
  }, []);

  const login = async (email: string, pass: string) => {
    setError(null);
    try {
      const loggedInUser = await authService.login(email, pass);
      setUser(loggedInUser);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid credentials';
      setError(msg);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
    }
  };

  return createElement(
    AuthContext.Provider,
    { value: { user, loading, error, login, logout, refreshAuth } },
    children
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
