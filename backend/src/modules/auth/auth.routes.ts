import { Router } from "express";
import rateLimit from "express-rate-limit";
import { User } from "../users/user.model";
import { requireAuth, requireRole } from "../../middleware/auth";
import { validate } from "../../middleware/validate";
import { HttpError } from "../../utils/httpError";
import { clearAuthCookies, setAuthCookies } from "./cookies";
import { loginSchema, registerSchema } from "./auth.schemas";
import {
  issueTokens,
  registerUser,
  revokeRefreshToken,
  rotateRefreshToken,
  toPublicUser,
  verifyCredentials,
} from "./auth.service";

export const authRouter = Router();

// Slows down password guessing: max 20 attempts per 15 minutes per IP.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
});

authRouter.post(
  "/register",
  authLimiter,
  validate(registerSchema),
  async (req, res) => {
    const user = await registerUser(req.body);
    const tokens = await issueTokens(user.id, user.role);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.status(201).json({ user: toPublicUser(user) });
  },
);

authRouter.post(
  "/login",
  authLimiter,
  validate(loginSchema),
  async (req, res) => {
    const user = await verifyCredentials(req.body.email, req.body.password);
    const tokens = await issueTokens(user.id, user.role);
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    res.json({ user: toPublicUser(user) });
  },
);

authRouter.post("/refresh", async (req, res) => {
  const oldToken = req.cookies?.refreshToken;
  if (!oldToken) throw new HttpError(401, "No refresh token");
  try {
    const { user, accessToken, refreshToken } =
      await rotateRefreshToken(oldToken);
    setAuthCookies(res, accessToken, refreshToken);
    res.json({ user: toPublicUser(user) });
  } catch (err) {
    clearAuthCookies(res); // bad token: remove the dead cookies from the browser
    throw err;
  }
});

authRouter.post("/logout", async (req, res) => {
  const token = req.cookies?.refreshToken;
  if (token) await revokeRefreshToken(token);
  clearAuthCookies(res);
  res.status(204).end();
});

// The frontend calls this on page load to learn "am I logged in, and as whom?"
authRouter.get("/me", requireAuth, async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw new HttpError(401, "User no longer exists");
  res.json({ user: toPublicUser(user) });
});

// TEMPORARY: only to test the role guard in Step 26. We'll delete it later.
authRouter.get(
  "/admin-check",
  requireAuth,
  requireRole("admin"),
  (_req, res) => {
    res.json({ message: "You are an admin" });
  },
);
