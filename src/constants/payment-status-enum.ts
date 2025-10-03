export type PaymentStatus = typeof PaymentStatusValue[keyof typeof PaymentStatusValue];
export const PaymentStatusValue = {
  PENDING: 'PENDING',
  PAID: 'PAID',
} as const;