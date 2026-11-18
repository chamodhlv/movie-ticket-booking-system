import crypto from "crypto";
import jwt from "jsonwebtoken";
import { env } from "../../config/env";

export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_SECONDS = 7 * 24 * 60 * 60;

export function signAccessToken(userId: string, role: string) {
  // `subject` becomes the standard "sub" claim = who this token belongs to.
  return jwt.sign({ role }, env.JWT_ACCESS_SECRET, {
    subject: userId,
    expiresIn: ACCESS_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string) {
  // Pin the algorithm so nobody can trick the server with a token signed differently.
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"],
  }) as jwt.JwtPayload;
  return { id: decoded.sub as string, role: decoded.role as string };
}

// SHA-256 is fine here (passwords need a slow hash like bcrypt) because a refresh
// token is 48 random bytes. It can't be guessed, so a fast hash is safe.
export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function generateRefreshToken() {
  const token = crypto.randomBytes(48).toString("hex");
  return { token, hash: hashToken(token) };
}
