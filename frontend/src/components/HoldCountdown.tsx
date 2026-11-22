// "7:42" counting down to `expiresAt`. Both numbers are on the SERVER's clock (ms since 1970):
// `now` comes from useServerNow(), which already corrects for the visitor's computer clock.
export default function HoldCountdown({
  expiresAt,
  now,
}: {
  expiresAt: number;
  now: number;
}) {
  const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const minutes = Math.floor(remaining / 60);
  const seconds = String(remaining % 60).padStart(2, "0");
  return (
    // role="timer" tells screen readers this is a clock (it does not announce every tick).
    <span
      role="timer"
      className={`font-mono text-2xl font-bold ${remaining < 60 ? "text-red-400" : "text-emerald-400"}`}
    >
      {minutes}:{seconds}
    </span>
  );
}
