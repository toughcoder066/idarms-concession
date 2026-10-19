export const PERMISSIONS = ["bill:read","bill:generate"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function can(required: Permission, granted: readonly string[]): boolean {
  return granted.includes(required);
}
