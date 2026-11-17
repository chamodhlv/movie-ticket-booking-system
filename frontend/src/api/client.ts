import axios from "axios";

// One shared axios instance, so the base URL and settings live in a single place.
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL,
  // Makes the browser send cookies on requests to a different origin
  // (frontend :5173, backend :5000). We need this later for login cookies.
  withCredentials: true,
});
