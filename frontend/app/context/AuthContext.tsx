"use client";

import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { AuthUser, saveAuth, loadAuth, clearAuth, apiLogin, apiSignup, apiSignupMaker } from "../lib/auth";

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, username: string, password: string, company_name?: string) => Promise<void>;
  signupMaker: (email: string, username: string, password: string, company_name?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    // SSRミスマッチ回避のためクライアント側でのみハイドレーション
    setUser(loadAuth());
  }, []);

  const login = async (email: string, password: string) => {
    const auth = await apiLogin(email, password);
    saveAuth(auth);
    setUser(auth);
  };

  const signup = async (email: string, username: string, password: string, company_name?: string) => {
    const auth = await apiSignup(email, username, password, company_name);
    saveAuth(auth);
    setUser(auth);
  };

  const signupMaker = async (email: string, username: string, password: string, company_name?: string) => {
    const auth = await apiSignupMaker(email, username, password, company_name);
    saveAuth(auth);
    setUser(auth);
  };

  const logout = () => {
    clearAuth();
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, login, signup, signupMaker, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
