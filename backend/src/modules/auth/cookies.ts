import { CookieOptions, Response } from "express";
import { env } from "../../config/env";
import { ACCESS_TTL_SECONDS, REFRESH_TTL_SECONDS } from "./tokens";

const base: CookieOptions = {
  httpOnly: true, // JavaScript cannot read this cookie (protects against XSS theft)
  secure: env.NODE_ENV === "production", // production: sent over HTTPS only
  // "lax" = the browser won't attach the cookie to requests started by OTHER sites
  // (e.g. a hidden form on evil.com), which blocks most CSRF attacks.
  sameSite: "lax",
};

const ACCESS_PATH = "/";
// The refresh cookie is only sent to auth endpoints, so it is not exposed
// on every request. Less exposure, less risk.
const REFRESH_PATH = "/api/auth";

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
) {
  res.cookie("accessToken", accessToken, {
    ...base,
    path: ACCESS_PATH,
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie("refreshToken", refreshToken, {
    ...base,
    path: REFRESH_PATH,
    maxAge: REFRESH_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  // The path must match the one used when setting, or the browser keeps the cookie.
  res.clearCookie("accessToken", { ...base, path: ACCESS_PATH });
  res.clearCookie("refreshToken", { ...base, path: REFRESH_PATH });
}
