export const PERMISSIONS = __PERMISSIONS__ as const;

export type Permission = (typeof PERMISSIONS)[number];

export function can(required: Permission, granted: readonly string[]): boolean {
  return granted.includes(required);
}
