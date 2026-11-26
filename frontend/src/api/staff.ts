import { api } from "./client";
import type { ScanResult } from "../types/scan";

// `ticket` is whatever was read from the QR code, or the backup code that staff typed. The server
// works out which of the two it is.
export async function scanTicketRequest(ticket: string) {
  return (await api.post<ScanResult>("/api/staff/tickets/scan", { ticket }))
    .data;
}
