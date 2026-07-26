'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';

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
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  login: async () => {},
  register: async () => '',
  logout: () => {},
  isAuthenticated: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const router = useRouter();

  useEffect(() => {
    const storedUser = localStorage.getItem('adgen_user');
    const storedToken = localStorage.getItem('adgen_token');
    if (storedUser && storedToken) {
      try {
        setUser(JSON.parse(storedUser));
        return;
      } catch {
        localStorage.removeItem('adgen_user');
        localStorage.removeItem('adgen_token');
      }
    }
    setUser(null);
  }, []);

  const login = async (email: string, password?: string) => {
    try {
      const res = await api.post('/users/login', { email, password });
      const userData = res.data.user;
      setUser(userData);
      if (!res.data.token) throw new Error('Invalid auth payload received from server');
      localStorage.setItem('adgen_user', JSON.stringify(userData));
      localStorage.setItem('adgen_token', res.data.token);
      router.push('/');
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      throw new Error(errorMsg || 'Login failed. Please check credentials.');
    }
  };

  const register = async (name: string, email: string, password?: string) => {
    try {
      const res = await api.post('/users/register', { name, email, password });
      return res.data.message || 'Registration submitted! Awaiting owner approval.';
    } catch (err: unknown) {
      const errorMsg = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      throw new Error(errorMsg || 'Registration failed.');
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('adgen_user');
    localStorage.removeItem('adgen_token');
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
