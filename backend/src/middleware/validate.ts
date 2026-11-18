import { NextFunction, Request, Response } from "express";
import { ZodType } from "zod";

// Usage: router.post("/x", validate(someZodSchema), handler)
// Rejects bad input BEFORE it reaches our logic, and replaces req.body with
// the cleaned version (trimmed, lowercased, unknown fields removed).
export const validate =
  (schema: ZodType) => (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        message: "Validation failed",
        errors: result.error.issues.map((i) => ({
          path: i.path.join("."),
          message: i.message,
        })),
      });
      return;
    }
    req.body = result.data;
    next();
  };
