export const PERMISSIONS = ["gis:read","gis:manage"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function can(required: Permission, granted: readonly string[]): boolean {
  return granted.includes(required);
}
