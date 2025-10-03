export type UserRole = typeof UserRoleValue[keyof typeof UserRoleValue];
export const UserRoleValue = {
  ADMIN: 'ADMIN',
  USER: 'USER',
} as const;