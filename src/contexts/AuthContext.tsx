import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '../../utils/supabase';

interface User {
  id: string;
  email: string;
  name: string;
  unit: string | null;
  role: string;
  created_at?: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, name: string, unit?: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  isAdmin: boolean;
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

  useEffect(() => {
    // On initial load, try to authenticate the user from the cookie
    const checkAuth = async () => {
      try {
        const response = await fetch('http://localhost:3002/api/auth/me', {
          credentials: 'include',
        });

        if (response.ok) {
          const data = await response.json();
          // IMPORTANT: The /me endpoint does not return a token, so on page refresh,
          // Supabase requests will not be authenticated until the user logs in again.
          // This is a limitation of the current auth architecture.
          setUser(data.user);
        } else {
          setUser(null);
          if (supabase.global?.headers) {
            delete supabase.global.headers['Authorization'];
          }
        }
      } catch (error) {
        setUser(null);
        if (supabase.global?.headers) {
          delete supabase.global.headers['Authorization'];
        }
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const login = async (email: string, password: string) => {
    const response = await fetch('http://localhost:3002/api/auth/login', {
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

  const signup = async (email: string, password: string, name: string, unit?: string) => {
    const response = await fetch('http://localhost:3002/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, unit }),
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || 'Registrasi gagal');
    }
  };

  const logout = async () => {
    try {
      await fetch('http://localhost:3002/api/auth/logout', {
        method: 'POST',
        credentials: 'include',
      });
    } catch (error) {
      console.error('Logout error:', error);
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
    isAdmin: user?.role === 'admin',
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
