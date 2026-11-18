import { createContext, useContext } from "react";
import type { LoginInput, RegisterInput, User } from "../types/auth";

export type AuthContextValue = {
  user: User | null; // null = not logged in
  isLoading: boolean; // true only during the very first "who am I?" check
  login: (input: LoginInput) => Promise<User>;
  register: (input: RegisterInput) => Promise<User>;
  logout: () => Promise<void>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
