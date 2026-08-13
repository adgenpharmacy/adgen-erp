'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { getApiErrorMessage } from '@/types';

interface User {
  id?: string;
  name: string;
  email: string;
  role: 'OWNER' | 'EMPLOYEE';
  isApproved?: boolean;
}

interface AuthContextType {
  user: User | null;
  login: (email: string, password?: string) => Promise<void>;
  register: (name: string, email: string, password?: string) => Promise<string>;
  logout: () => void;
  isAuthenticated: boolean;
  /** True until the stored session has been read — lets guards avoid a logged-out flash. */
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  register: async () => '',
  logout: () => {},
  isAuthenticated: false,
  isLoading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('adgen_user');
    const storedToken = localStorage.getItem('adgen_token');
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        setIsLoading(false);
        return;
      } catch {
        localStorage.removeItem('adgen_user');
        localStorage.removeItem('adgen_token');
      }
    }
    setUser(null);
    setIsLoading(false);
  }, []);

  /*
   * End the session when the server says the account no longer has access.
   *
   * 401 covers a rejected token — expired, or signed with a rotated secret. 403 with
   * `code: ACCOUNT_REVOKED` covers an account disabled or un-approved while someone was signed
   * in: their token is still valid, so nothing here fired, and they were left on a dashboard of
   * zeros with a failure toast on every screen. A plain 403 is NOT treated this way — that is
   * an employee touching an owner-only action, and signing them out for it would be absurd.
   */
  useEffect(() => {
    const interceptor = api.interceptors.response.use(
      (response) => response,
      (error) => {
        const status = error?.response?.status;
        const revoked = status === 403 && error.response.data?.code === 'ACCOUNT_REVOKED';

        if (status === 401 || revoked) {
          localStorage.removeItem('adgen_user');
          localStorage.removeItem('adgen_token');
          localStorage.removeItem('adgen_global_erp_cache_v1');
          setUser(null);
        }
        return Promise.reject(error);
      }
    );
    return () => api.interceptors.response.eject(interceptor);
  }, []);

  const login = async (email: string, password?: string) => {
    try {
      const res = await api.post('/users/login', { email, password });
      const userData = res.data.user;
      setUser(userData);
      if (!res.data.token) throw new Error('Invalid auth payload received from server');
      localStorage.setItem('adgen_user', JSON.stringify(userData));
      localStorage.setItem('adgen_token', res.data.token);

      // Return the user to the page the guard interrupted, if any.
      let destination = '/';
      if (typeof window !== 'undefined') {
        const next = new URLSearchParams(window.location.search).get('next');
        // Only accept same-site paths so the parameter can't be used to bounce elsewhere.
        if (next && next.startsWith('/') && !next.startsWith('//')) {
          destination = next;
        }
      }
      router.push(destination);
    } catch (err: unknown) {
      // A blocked or unreachable request is not a credentials problem — saying so sends the
      // operator hunting for a wrong password when the API address or CORS is misconfigured.
      throw new Error(getApiErrorMessage(err, 'Login failed. Please check credentials.'));
    }
  };

  const register = async (name: string, email: string, password?: string) => {
    try {
      const res = await api.post('/users/register', { name, email, password });
      return res.data.message || 'Registration submitted! Awaiting owner approval.';
    } catch (err: unknown) {
      throw new Error(getApiErrorMessage(err, 'Registration failed.'));
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('adgen_user');
    localStorage.removeItem('adgen_token');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user, isLoading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
