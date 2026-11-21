import { Types } from "mongoose";
import { HttpError } from "./httpError";

export function parseObjectId(id: string | string[] | undefined) {
  if (typeof id !== "string" || !/^[a-f\d]{24}$/i.test(id)) {
    throw new HttpError(404, "Not found");
  }
  return new Types.ObjectId(id);
}
