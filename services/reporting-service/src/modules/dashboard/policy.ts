export const PERMISSIONS = ["reporting:read"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function can(required: Permission, granted: readonly string[]): boolean {
  return granted.includes(required);
}
