export const PERMISSIONS = ["property:read","property:create","property:verify","property:update"] as const;

export type Permission = (typeof PERMISSIONS)[number];

export function can(required: Permission, granted: readonly string[]): boolean {
  return granted.includes(required);
}
