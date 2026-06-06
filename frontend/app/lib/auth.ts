const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";
const STORAGE_KEY = "auth_user";
const COOKIE_NAME = "auth_token";

export type Role = "admin" | "customer" | "maker";

export interface AuthUser {
  token: string;
  role: Role;
  username: string;
  userId: number;
}

export function saveAuth(user: AuthUser): void {
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  // middlewareがEdge Runtimeで読めるようcookieにも保存
  document.cookie = `${COOKIE_NAME}=${user.token}; path=/; max-age=${60 * 60 * 24}; SameSite=Lax`;
}

export function loadAuth(): AuthUser | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
}

export function clearAuth(): void {
  sessionStorage.removeItem(STORAGE_KEY);
  document.cookie = `${COOKIE_NAME}=; path=/; max-age=0`;
}

export async function apiLogin(email: string, password: string): Promise<AuthUser> {
  const res = await fetch(`${API_BASE}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "ログインに失敗しました");
  }
  const data = await res.json();
  return {
    token: data.access_token,
    role: data.role as Role,
    username: data.username,
    userId: data.user_id,
  };
}

async function _signup(url: string, email: string, username: string, password: string): Promise<AuthUser> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, username, password }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { detail?: string }).detail ?? "登録に失敗しました");
  }
  const data = await res.json();
  return {
    token: data.access_token,
    role: data.role as Role,
    username: data.username,
    userId: data.user_id,
  };
}

export function apiSignup(email: string, username: string, password: string): Promise<AuthUser> {
  return _signup(`${API_BASE}/auth/signup`, email, username, password);
}

export function apiSignupMaker(email: string, username: string, password: string): Promise<AuthUser> {
  return _signup(`${API_BASE}/auth/signup/maker`, email, username, password);
}
