import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/tokens";
import { HttpError } from "../utils/httpError";
import { User } from "../modules/users/user.model";

// Tell TypeScript that after requireAuth runs, `req.user` exists.
declare global {
  namespace Express {
    interface Request {
      user?: { id: string; role: string };
    }
  }
}

// Step 1: "Who are you?" Reads the cookie and checks the token.
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken;
  if (!token) throw new HttpError(401, "Not authenticated");
  try {
    req.user = verifyAccessToken(token);
  } catch {
    // Expired, tampered, or malformed. The frontend will react to this 401
    // by calling /api/auth/refresh and retrying (we build that in Part 4).
    throw new HttpError(401, "Invalid or expired token");
  }
  next();
}

// Step 2: "Are you allowed?" Use after requireAuth.
// Example: router.post("/movies", requireAuth, requireRole("admin"), handler)
export const requireRole =
  (...roles: string[]) =>
  (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new HttpError(403, "Forbidden");
    }
    next();
  };

// Like requireRole, but asks the DATABASE for the role instead of trusting the login token.
// HARD PART: the role is copied into the access token when it is created and the token lives
// 15 minutes. If an admin makes someone staff (or removes them), requireRole would keep
// believing the OLD role for up to 15 minutes. Use this one where that delay matters: the ticket
// scanner. It costs one tiny lookup by id per request.
export const requireFreshRole =
  (...roles: string[]) =>
  async (req: Request, _res: Response, next: NextFunction) => {
    const user = req.user
      ? await User.findById(req.user.id).select("role").lean()
      : null;
    if (!user || !roles.includes(user.role)) {
      throw new HttpError(403, "Forbidden");
    }
    req.user!.role = user.role; // from here on the request carries the real, current role
    next();
  };

// Like requireAuth, but for pages anyone may see. A valid cookie fills `req.user`; a missing or
// bad one simply leaves it empty and the request continues. (The seat map uses this: visitors
// can look, and logged-in users additionally get "these are YOUR held seats".)
export function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken;
  if (token) {
    try {
      req.user = verifyAccessToken(token);
    } catch {
      // Expired or invalid: treat the visitor as logged out.
    }
  }
  next();
}
