// Fixed choices used by the admin forms. They must match the backend's allowed values
// (backend/src/modules/catalog/catalog.constants.ts for FORMATS).
// TODO: FilterBar.tsx has its own copy of these two lists; point it here someday.
export const FORMATS = ["2D", "3D", "IMAX", "4DX"] as const;
export const LANGUAGES = ["English", "Sinhala", "Tamil"] as const;
export const MOVIE_STATUSES = [
  { value: "upcoming", label: "Upcoming" },
  { value: "now_showing", label: "Now showing" },
  { value: "archived", label: "Archived" },
] as const;
