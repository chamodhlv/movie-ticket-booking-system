import { NextFunction, Request, Response } from "express";
import { verifyAccessToken } from "../modules/auth/tokens";
import { HttpError } from "../utils/httpError";

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
