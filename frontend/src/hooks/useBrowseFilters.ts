import { useSearchParams } from "react-router-dom";
import type { Filters } from "../types/catalog";

export const FILTER_KEYS = ["city", "date", "language", "format"] as const;

// The URL is the single source of truth. This hook READS filters from it and
// WRITES changes back to it. There is no useState, so nothing can get out of sync.
export function useBrowseFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters: Filters = {};
  for (const key of FILTER_KEYS) {
    const value = searchParams.get(key);
    if (value) filters[key] = value;
  }

  // Bad input like ?page=abc or ?page=-3 falls back to page 1.
  const page = Math.max(1, Number(searchParams.get("page")) || 1);

  // The filters as a query string ("city=Kandy&format=3D"), used to carry the
  // user's filters along when they click through to a movie page.
  const search = new URLSearchParams(
    filters as Record<string, string>,
  ).toString();

  function setFilter(key: (typeof FILTER_KEYS)[number], value: string) {
    // The function form gives us the CURRENT params, so we change one key
    // and keep all the others.
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key); // "All" removes the key from the URL
      next.delete("page"); // a new filter can shrink the results, so go back to page 1
      return next;
    });
  }

  function setPage(p: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (p > 1) next.set("page", String(p));
      else next.delete("page");
      return next;
    });
  }

  function clearFilters() {
    setSearchParams({});
  }

  return { filters, page, search, setFilter, setPage, clearFilters };
}
