import { useEffect, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchMe,
  loginRequest,
  logoutRequest,
  registerRequest,
} from "../api/auth";
import { setSessionExpiredHandler } from "../api/client";
import { AuthContext, type AuthContextValue } from "./auth-context";

const ME_KEY = ["me"];

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  // The "current user" lives in React Query's cache. It is the single source of truth.
  const { data: user = null, isLoading } = useQuery({
    queryKey: ME_KEY,
    queryFn: fetchMe,
    retry: false, // a 401 won't get better by retrying
    staleTime: Infinity, // don't re-ask on every render; we update it ourselves
  });

  // If a silent refresh fails (e.g. the 7-day refresh token expired), clear the user.
  // ProtectedRoute then sends them to the login page automatically.
  useEffect(() => {
    setSessionExpiredHandler(() => queryClient.setQueryData(ME_KEY, null));
    return () => setSessionExpiredHandler(null);
  }, [queryClient]);

  const value: AuthContextValue = {
    user,
    isLoading,

    login: async (input) => {
      const u = await loginRequest(input);
      queryClient.setQueryData(ME_KEY, u); // everyone using useAuth() updates instantly
      return u;
    },

    register: async (input) => {
      const u = await registerRequest(input);
      queryClient.setQueryData(ME_KEY, u);
      return u;
    },

    logout: async () => {
      try {
        await logoutRequest();
      } finally {
        // Even if the request failed, clear the UI. Also wipe every OTHER cached
        // query (bookings, etc.) so the next person on a shared computer
        // can't see the previous user's data.
        queryClient.removeQueries({ predicate: (q) => q.queryKey[0] !== "me" });
        queryClient.setQueryData(ME_KEY, null);
      }
    },
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
