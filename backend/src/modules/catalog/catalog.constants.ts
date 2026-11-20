// `as const` makes these literal types, so TypeScript knows the exact allowed values.
export const FORMATS = ["2D", "3D", "IMAX", "4DX"] as const;
export const SEAT_TYPES = ["standard", "premium", "vip", "wheelchair"] as const;
export const MOVIE_STATUSES = ["upcoming", "now_showing", "archived"] as const;
