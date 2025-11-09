import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { supabase } from '@/utils/supabase';
import { getAuthApiUrl } from '../config/authApi';

interface User {
  id: string;
  email: string;
  name: string;
  unit: string | null;
  role: string;
  created_at?: string;
  is_approved: boolean;
  phone_number: string | null;
}

interface SignupPayload {
  email: string;
  password: string;
  name: string;
  unit?: string;
  phoneNumber: string;
  otp: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (payload: SignupPayload) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isApproved: boolean;
  isAdmin: boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCurrentUser = useCallback(async () => {
    try {
      const response = await fetch(getAuthApiUrl('auth/me'), {
        credentials: 'include',
      });

      if (response.ok) {
        const data = await response.json();
        setUser(data.user);
      } else {
        setUser(null);
        if (supabase.global?.headers) {
          delete supabase.global.headers['Authorization'];
        }
      }
    } catch {
      setUser(null);
      if (supabase.global?.headers) {
        delete supabase.global.headers['Authorization'];
      }
    }
  }, []);

  useEffect(() => {
    fetchCurrentUser().finally(() => setLoading(false));
  }, [fetchCurrentUser]);

  const login = async (email: string, password: string) => {
    const response = await fetch(getAuthApiUrl('auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    const data = await response.json();

    if (!response.ok) {
      if (supabase.global?.headers) {
        delete supabase.global.headers['Authorization'];
      }
      throw new Error(data.error || 'Login gagal');
    }

    // CRITICAL: Set the token for Supabase BEFORE setting the user state.
    if (!supabase.global) {
      supabase.global = {};
    }
    if (!supabase.global.headers) {
      supabase.global.headers = {};
    }
    supabase.global.headers['Authorization'] = `Bearer ${data.token}`;
    setUser(data.user);
  };

  const signup = async ({ email, password, name, unit, phoneNumber, otp }: SignupPayload) => {
    const response = await fetch(getAuthApiUrl('auth/signup'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, unit, phoneNumber, otp }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registrasi gagal');
    }
  };

  const logout = async () => {
    try {
      await fetch(getAuthApiUrl('auth/logout'), {
        method: 'POST',
        credentials: 'include',
      });
    } finally {
      // CRITICAL: Clear the user state BEFORE clearing the token.
      setUser(null);
      if (supabase.global?.headers) {
        delete supabase.global.headers['Authorization'];
      }
    }
  };

  const value: AuthContextType = {
    user,
    loading,
    login,
    signup,
    logout,
    isAuthenticated: !!user,
    isApproved: user?.is_approved ?? false,
    isAdmin: user?.role === 'admin',
    refreshUser: fetchCurrentUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
