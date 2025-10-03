export type Gym = typeof GymValue[keyof typeof GymValue];
export const GymValue = {
  STING_CLUB: 'STING_CLUB',
  STING_HIVE: 'STING_HIVE',
} as const;