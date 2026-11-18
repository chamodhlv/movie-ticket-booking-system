import bcrypt from "bcryptjs";
import mongoose from "mongoose";
import { connectMongo } from "../config/db";
import { User } from "../modules/users/user.model";

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  if (!email || !password)
    throw new Error("Set ADMIN_EMAIL and ADMIN_PASSWORD in backend/.env");

  await connectMongo();
  const passwordHash = await bcrypt.hash(password, 12);

  // upsert = create if missing, update if it already exists (safe to run many times)
  await User.findOneAndUpdate(
    { email: email.toLowerCase() },
    { name: "Admin", email: email.toLowerCase(), passwordHash, role: "admin" },
    { upsert: true },
  );

  console.log(`Admin ready: ${email}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
