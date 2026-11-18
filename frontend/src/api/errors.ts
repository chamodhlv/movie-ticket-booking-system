import axios from "axios";

type ApiErrorBody = {
  message?: string;
  errors?: { path: string; message: string }[];
};

// Turns any error into a short message that is safe to show the user.
export function getErrorMessage(err: unknown): string {
  if (axios.isAxiosError(err)) {
    if (!err.response) return "Cannot reach the server. Please try again.";
    if (err.response.status === 429)
      return "Too many attempts. Please wait a few minutes.";

    const data = err.response.data as ApiErrorBody | undefined;
    // Our backend sends a list of field errors for validation failures
    if (data?.errors?.length)
      return data.errors.map((e) => `${e.path}: ${e.message}`).join(", ");
    if (data?.message) return data.message;
  }
  return "Something went wrong. Please try again.";
}
