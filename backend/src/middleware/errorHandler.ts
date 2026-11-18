import { NextFunction, Request, Response } from "express";
import { HttpError } from "../utils/httpError";
import { logger } from "../config/logger";

// Express recognises an error handler by its 4 parameters, so keep `_next`
// even though we don't use it.
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof HttpError) {
    res.status(err.status).json({ message: err.message });
    return;
  }

  // 11000 = MongoDB duplicate key. This catches the race where two people register
  // the same email at the same moment (the unique index is the final guard).
  if (
    typeof err === "object" &&
    err !== null &&
    (err as { code?: number }).code === 11000
  ) {
    res.status(409).json({ message: "Already exists" });
    return;
  }

  // Unknown error: log the details, but never leak them to the client.
  logger.error(err);
  res.status(500).json({ message: "Internal server error" });
}
