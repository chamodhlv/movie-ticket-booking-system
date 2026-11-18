import axios, { AxiosError, type InternalAxiosRequestConfig } from "axios";

const baseURL = import.meta.env.VITE_API_URL;

export const api = axios.create({ baseURL, withCredentials: true });

// A SECOND axios instance with NO interceptor, used only to call /refresh.
// If the refresh call used `api`, a failing refresh would trigger the interceptor
// again, which would call refresh again... an infinite loop.
const bare = axios.create({ baseURL, withCredentials: true });

// The app registers a function here to be told "the session is truly dead".
// (We use a callback to avoid a circular import between this file and AuthProvider.)
let onSessionExpired: (() => void) | null = null;
export function setSessionExpiredHandler(fn: (() => void) | null) {
  onSessionExpired = fn;
}

// SINGLE-FLIGHT REFRESH.
// Imagine the access token expired and the page fires 5 requests at once. All 5
// get a 401. If each called /refresh, the backend would rotate the refresh token
// on the first call and REJECT the other 4 (an old refresh token can only be used
// once), which would log the user out for no reason.
// Fix: the first failure starts the refresh and stores its promise here. The
// other 4 see a refresh is already running and just wait for that same promise.
let refreshPromise: Promise<unknown> | null = null;

function refreshSession() {
  if (!refreshPromise) {
    refreshPromise = bare.post("/api/auth/refresh").finally(() => {
      refreshPromise = null; // allow a future refresh once this one is done
    });
  }
  return refreshPromise;
}

// A 401 from these means "wrong password" etc., not "token expired", so never refresh.
const NO_REFRESH_URLS = [
  "/api/auth/login",
  "/api/auth/register",
  "/api/auth/logout",
];

// We mark a request after retrying it once, so it can never retry forever.
type RetriableConfig = InternalAxiosRequestConfig & { _retried?: boolean };

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;

    const shouldRefresh =
      error.response?.status === 401 &&
      original &&
      !original._retried &&
      !NO_REFRESH_URLS.some((url) => original.url?.startsWith(url));

    if (!shouldRefresh) return Promise.reject(error);

    original._retried = true;
    try {
      await refreshSession(); // new cookies are now set by the backend
      return api(original); // replay the original request; the browser sends the new cookie
    } catch (refreshError) {
      onSessionExpired?.(); // refresh failed: the user must log in again
      return Promise.reject(refreshError);
    }
  },
);
