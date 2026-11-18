export type Role = "customer" | "admin" | "staff";

export type User = { id: string; name: string; email: string; role: Role };

export type LoginInput = { email: string; password: string };
export type RegisterInput = LoginInput & { name: string };
