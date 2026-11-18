import bcrypt from "bcryptjs";
import { User } from "../users/user.model";
import { RefreshToken } from "./refreshToken.model";
import { HttpError } from "../../utils/httpError";
import {
  REFRESH_TTL_SECONDS,
  generateRefreshToken,
  hashToken,
  signAccessToken,
} from "./tokens";

const BCRYPT_ROUNDS = 12; // higher = slower to crack, but slower login too

export function toPublicUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
}) {
  return { id: user.id, name: user.name, email: user.email, role: user.role };
}

export async function registerUser(input: {
  name: string;
  email: string;
  password: string;
}) {
  if (await User.exists({ email: input.email })) {
    throw new HttpError(409, "Email already registered");
  }
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  return User.create({ name: input.name, email: input.email, passwordHash });
}

export async function verifyCredentials(email: string, password: string) {
  const user = await User.findOne({ email }).select("+passwordHash");
  const ok = user ? await bcrypt.compare(password, user.passwordHash) : false;
  // Same message for "unknown email" and "wrong password", so attackers
  // can't use the login form to find out which emails have accounts.
  if (!user || !ok) throw new HttpError(401, "Invalid email or password");
  return user;
}

export async function issueTokens(userId: string, role: string) {
  const accessToken = signAccessToken(userId, role);
  const { token: refreshToken, hash } = generateRefreshToken();
  await RefreshToken.create({
    user: userId,
    tokenHash: hash,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
  });
  return { accessToken, refreshToken };
}

export async function rotateRefreshToken(oldToken: string) {
  // findOneAndDelete is ATOMIC. If two requests present the same token at the
  // same instant, only one gets the document back and the other gets null.
  // That means a refresh token can never be used twice.
  const stored = await RefreshToken.findOneAndDelete({
    tokenHash: hashToken(oldToken),
    expiresAt: { $gt: new Date() },
  });
  if (!stored) throw new HttpError(401, "Invalid refresh token");

  const user = await User.findById(stored.user);
  if (!user) throw new HttpError(401, "User no longer exists");

  const tokens = await issueTokens(user.id, user.role);
  return { user, ...tokens };
}

export async function revokeRefreshToken(token: string) {
  await RefreshToken.deleteOne({ tokenHash: hashToken(token) });
}
