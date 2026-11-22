import { useEffect, useState } from "react";

// The server's current time in ms, refreshed every second. Whatever uses it re-renders once
// per second, which is what makes a countdown tick and what frees seats whose hold ran out.
export function useServerNow(clockOffset: number) {
  const [clientNow, setClientNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setClientNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return clientNow + clockOffset;
}
