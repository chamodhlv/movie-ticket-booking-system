import axios from "axios";
import { api } from "./client";
import type { LoginInput, RegisterInput, User } from "../types/auth";

export async function registerRequest(input: RegisterInput) {
  const res = await api.post<{ user: User }>("/api/auth/register", input);
  return res.data.user;
}

export async function loginRequest(input: LoginInput) {
  const res = await api.post<{ user: User }>("/api/auth/login", input);
  return res.data.user;
}

export async function logoutRequest() {
  await api.post("/api/auth/logout");
}

// "Not logged in" is a normal answer, not a failure, so we return null for a 401
// instead of throwing. Real problems (server down, network) still throw.
export async function fetchMe(): Promise<User | null> {
  try {
    const res = await api.get<{ user: User }>("/api/auth/me");
    return res.data.user;
  } catch (err) {
    if (axios.isAxiosError(err) && err.response?.status === 401) return null;
    throw err;
  }
}
