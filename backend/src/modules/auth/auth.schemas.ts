import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(60),
  email: z.string().trim().toLowerCase().email(),
  // bcrypt only uses the first 72 bytes, so longer passwords add no security.
  password: z.string().min(8).max(72),
  // Notice there is NO `role` field. Anything extra a client sends is dropped,
  // so nobody can register themselves as an admin.
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});
