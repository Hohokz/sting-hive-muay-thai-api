export type BookingStatus = typeof BookingStatusValue[keyof typeof BookingStatusValue];
export const BookingStatusValue = {
  WAITING: 'WAITING',
  SUCCEED: 'SUCCEED',
  FAILED: 'FAILED',
  CANCELED: 'CANCELED',
  RESCHEDULED: 'RESCHEDULED',
} as const;