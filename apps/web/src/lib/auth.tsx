import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { apiFetch, setTokens, clearTokens } from "./api";

export type Role = "SUPER_ADMIN" | "SOCIETY_ADMIN" | "RESIDENT" | "SECURITY";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: Role;
  societyId: string | null;
  flatId: string | null;
  isOwner?: boolean;
  flat?: { id: string; number: string; block: { name: string } } | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (credential: string) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  async function refreshUser() {
    try {
      const me = await apiFetch<CurrentUser>("/auth/me");
      setUser(me);
    } catch {
      setUser(null);
    }
  }

  useEffect(() => {
    const hasToken = Boolean(localStorage.getItem("mc_access_token"));
    if (!hasToken) {
      setLoading(false);
      return;
    }
    refreshUser().finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; user: CurrentUser }>("/auth/login", {
      method: "POST",
      body: { email, password },
      skipAuth: true,
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  async function loginWithGoogle(credential: string) {
    const data = await apiFetch<{ accessToken: string; refreshToken: string; user: CurrentUser }>("/auth/google", {
      method: "POST",
      body: { credential },
      skipAuth: true,
    });
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }

  function logout() {
    clearTokens();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, loginWithGoogle, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
