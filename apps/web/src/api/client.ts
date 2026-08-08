import type { SavedGamePayload } from "../sim/serialize";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8000";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string | null,
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, typeof detail === "string" ? detail : "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface UserResponse {
  id: string;
  email: string;
  created_at: string;
}

export interface SaveMeta {
  slot: number;
  name: string;
  age: string;
  schema_version: number;
  updated_at: string;
  empty: boolean;
}

export interface SaveResponse {
  slot: number;
  name: string;
  age: string;
  schema_version: number;
  state: SavedGamePayload;
  updated_at: string;
}

export function register(email: string, password: string) {
  return request<UserResponse>("/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email: string, password: string) {
  return request<TokenResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
}

export function me(token: string) {
  return request<UserResponse>("/auth/me", {}, token);
}

export function listSaves(token: string) {
  return request<SaveMeta[]>("/saves", {}, token);
}

export function getSave(token: string, slot: number) {
  return request<SaveResponse>(`/saves/${slot}`, {}, token);
}

export function putSave(
  token: string,
  slot: number,
  body: {
    name: string;
    age: string;
    schema_version: number;
    state: SavedGamePayload;
  },
) {
  return request<SaveResponse>(`/saves/${slot}`, {
    method: "PUT",
    body: JSON.stringify(body),
  }, token);
}

export function deleteSave(token: string, slot: number) {
  return request<void>(`/saves/${slot}`, { method: "DELETE" }, token);
}
