// POST /api/staff/tickets/scan  ->  the verdict for one scan.
export type ScanVerdict =
  | "admitted"
  | "already_used"
  | "cancelled"
  | "showing_cancelled"
  | "too_early"
  | "show_over";

export type ScanTicketInfo = {
  reference: string;
  movieTitle: string;
  cinemaName: string;
  hallName: string;
  format: string;
  language: string;
  startTime: string; // UTC ISO
  endTime: string;
  seats: string[];
};

export type ScanResult =
  | { result: "invalid" } // not one of our tickets
  | {
      result: ScanVerdict;
      ticket: ScanTicketInfo;
      usedAt?: string | null; // admitted / already_used
      entryOpensAt?: string; // too_early
    };
