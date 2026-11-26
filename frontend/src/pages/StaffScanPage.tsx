import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { scanTicketRequest } from "../api/staff";
import { getErrorMessage } from "../api/errors";
import { ErrorBanner } from "../components/admin/fields";
import {
  btnPrimary,
  btnSecondary,
  cardClass,
} from "../components/admin/styles";
import QrCameraScanner from "../components/QrCameraScanner";
import { formatDayLabel, formatTime } from "../lib/dates";
import type { ScanResult, ScanTicketInfo, ScanVerdict } from "../types/scan";

// How each verdict looks. `tone` is the card color, so staff can read the answer from across the
// counter without reading any words: green = let them in, amber = stop and look, red = no.
const VERDICTS: Record<
  ScanVerdict | "invalid",
  { title: string; tone: string }
> = {
  admitted: {
    title: "ADMIT",
    tone: "border-emerald-700 bg-emerald-950 text-emerald-300",
  },
  already_used: {
    title: "ALREADY USED",
    tone: "border-amber-700 bg-amber-950 text-amber-200",
  },
  too_early: {
    title: "TOO EARLY",
    tone: "border-amber-700 bg-amber-950 text-amber-200",
  },
  show_over: {
    title: "SHOW HAS ENDED",
    tone: "border-red-700 bg-red-950 text-red-300",
  },
  cancelled: {
    title: "BOOKING CANCELLED",
    tone: "border-red-700 bg-red-950 text-red-300",
  },
  showing_cancelled: {
    title: "SHOWING CANCELLED",
    tone: "border-red-700 bg-red-950 text-red-300",
  },
  invalid: {
    title: "NOT A VALID TICKET",
    tone: "border-red-700 bg-red-950 text-red-300",
  },
};

// The one line under the title that explains the verdict.
function explain(r: ScanResult): string {
  if (r.result === "invalid")
    return "This is not a ticket from this system. Do not let them in.";
  if (r.result === "already_used")
    return r.usedAt
      ? `Already scanned at ${formatTime(r.usedAt)}.`
      : "Already scanned.";
  if (r.result === "too_early")
    return r.entryOpensAt
      ? `Entry opens at ${formatTime(r.entryOpensAt)}.`
      : "Entry is not open yet.";
  if (r.result === "show_over") return "This showing has already finished.";
  if (r.result === "cancelled")
    return "This booking was cancelled and refunded.";
  if (r.result === "showing_cancelled")
    return "The cinema cancelled this showing.";
  return "Entry allowed. This ticket is now marked as used.";
}

function TicketDetails({ t }: { t: ScanTicketInfo }) {
  return (
    <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 text-sm text-slate-100">
      <div className="col-span-2">
        <dt className="text-xs uppercase text-slate-400">Movie</dt>
        <dd className="text-lg font-semibold">{t.movieTitle}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-slate-400">Showing</dt>
        <dd>
          {formatDayLabel(t.startTime)}, {formatTime(t.startTime)}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-slate-400">Hall</dt>
        <dd>
          {t.hallName} · {t.format}
        </dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-slate-400">Seats</dt>
        <dd className="font-semibold">{t.seats.join(", ")}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-slate-400">Cinema</dt>
        <dd>{t.cinemaName}</dd>
      </div>
      <div>
        <dt className="text-xs uppercase text-slate-400">Reference</dt>
        <dd className="font-mono">{t.reference}</dd>
      </div>
    </dl>
  );
}

export default function StaffScanPage() {
  const [result, setResult] = useState<ScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [code, setCode] = useState("");

  const scan = useMutation({
    mutationFn: scanTicketRequest,
    onSuccess: (r) => {
      setResult(r);
      // A buzz on phones that support it, so staff can feel the answer without looking:
      // one short pulse = admit, a long double pulse = stop. (Not available on iPhones.)
      navigator.vibrate?.(r.result === "admitted" ? 80 : [200, 100, 200]);
    },
    onError: (err) => setError(getErrorMessage(err)),
  });

  // The camera only looks while there is nothing on screen to read. Once a code is read, the
  // answer stays up until staff press "Scan next", so a second code in view can't replace it.
  const cameraActive = !result && !error && !scan.isPending;

  function check(text: string) {
    if (scan.isPending) return;
    scan.mutate(text);
  }

  function handleTypedCode(e: FormEvent) {
    e.preventDefault();
    if (code.trim()) check(code);
  }

  function reset() {
    setResult(null);
    setError(null);
    setCode("");
    scan.reset();
  }

  return (
    <main className="mx-auto max-w-xl px-4 py-6">
      <h1 className="text-2xl font-bold">Scan tickets</h1>
      <p className="mb-4 text-sm text-slate-400">
        Point the camera at the QR code, or type the backup code.
      </p>

      {result ? (
        // ---- The answer ----
        <section
          role="status"
          className={`rounded-2xl border-2 p-5 ${VERDICTS[result.result].tone}`}
        >
          <p className="text-3xl font-extrabold tracking-wide">
            {result.result === "admitted" ? "✓ " : ""}
            {VERDICTS[result.result].title}
          </p>
          <p className="mt-1 text-sm">{explain(result)}</p>
          {result.result !== "invalid" && <TicketDetails t={result.ticket} />}
          {/* text-white: this button sits inside a colored card and would otherwise inherit its tint */}
          <button
            onClick={reset}
            className={`${btnPrimary} mt-5 w-full py-3 text-base text-white`}
          >
            Scan next
          </button>
        </section>
      ) : error ? (
        // ---- The request itself failed (no network, logged out...). Not a verdict. ----
        <div className="space-y-3">
          <ErrorBanner message={error} />
          <button onClick={reset} className={`${btnPrimary} w-full py-3`}>
            Try again
          </button>
        </div>
      ) : (
        // ---- Waiting for a ticket ----
        <div className="space-y-4">
          <div className="relative">
            <QrCameraScanner active={cameraActive} onScan={check} />
            {scan.isPending && (
              <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/60 text-lg font-semibold">
                Checking…
              </div>
            )}
          </div>

          <form onSubmit={handleTypedCode} className={`${cardClass} space-y-3`}>
            <label
              htmlFor="backup-code"
              className="block text-sm text-slate-300"
            >
              Camera not working? Type the backup code
            </label>
            <div className="flex gap-2">
              <input
                id="backup-code"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="K7M2-9QXP"
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                maxLength={20}
                className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 font-mono text-lg uppercase tracking-widest text-slate-100 outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={!code.trim() || scan.isPending}
                className={btnSecondary}
              >
                Check
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
