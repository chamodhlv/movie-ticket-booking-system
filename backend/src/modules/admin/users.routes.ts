import { Router } from "express";
import { z } from "zod";
import { logger } from "../../config/logger";
import { validate } from "../../middleware/validate";
import { HttpError } from "../../utils/httpError";
import { escapeRegex } from "../../utils/escapeRegex";
import { parseObjectId } from "../../utils/objectId";
import { User } from "../users/user.model";

// Mounted at /api/admin/users by admin.routes.ts, AFTER its "admins only" check, so everything
// here is already admin-protected.
export const adminUsersRouter = Router();

const PAGE_SIZE = 20;

const toPublic = (u: {
  _id: unknown;
  name: string;
  email: string;
  role: string;
  createdAt?: Date;
}) => ({
  id: String(u._id),
  name: u.name,
  email: u.email,
  role: u.role,
  createdAt: u.createdAt,
});

// GET /api/admin/users?search=ann&page=1
adminUsersRouter.get("/", async (req, res) => {
  const { search, page } = z
    .object({
      search: z.string().trim().max(100).optional(),
      page: z.coerce.number().int().min(1).default(1),
    })
    .parse(req.query);

  // "ann" finds Anna and joanne@x.com. escapeRegex makes sure typed characters like ( are just text.
  const filter = search
    ? {
        $or: [
          { name: { $regex: escapeRegex(search), $options: "i" } },
          { email: { $regex: escapeRegex(search), $options: "i" } },
        ],
      }
    : {};

  const [users, total] = await Promise.all([
    User.find(filter)
      .select("name email role createdAt") // never the password hash
      .sort({ createdAt: -1 })
      .skip((page - 1) * PAGE_SIZE)
      .limit(PAGE_SIZE)
      .lean(),
    User.countDocuments(filter),
  ]);

  res.json({ users: users.map(toPublic), total, page, pageSize: PAGE_SIZE });
});

// Only these two roles can be handed out here. "admin" is deliberately missing: nobody can be
// promoted to admin from the website, so a hijacked admin session can't mint more admins.
// (Admins are still created with npm run seed:admin.)
const roleSchema = z.object({ role: z.enum(["customer", "staff"]) });

// PATCH /api/admin/users/:id/role   { role: "staff" | "customer" }
adminUsersRouter.patch("/:id/role", validate(roleSchema), async (req, res) => {
  const id = parseObjectId(req.params.id);

  // The filter protects admins: an admin account can't be changed (or demoted) through this
  // route. The guard is part of the update itself, not a separate check beforehand, so it can't
  // race with anything. matchedCount tells us whether the guard let the update through.
  const result = await User.updateOne(
    { _id: id, role: { $ne: "admin" } },
    { $set: { role: req.body.role } },
  );

  if (result.matchedCount === 0) {
    // Either there is no such user, or it is an admin. Tell them apart for a useful message.
    if (await User.exists({ _id: id }))
      throw new HttpError(409, "Admin accounts can't be changed here");
    throw new HttpError(404, "User not found");
  }

  const updated = await User.findById(id)
    .select("name email role createdAt")
    .lean();
  if (!updated) throw new HttpError(404, "User not found");

  logger.info(
    { by: req.user!.id, userId: id.toString(), role: req.body.role },
    "User role changed",
  );
  res.json({ user: toPublic(updated) });
});
