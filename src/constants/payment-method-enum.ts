export type PaymentMethod = typeof PaymentMethodValue[keyof typeof PaymentMethodValue];
export const PaymentMethodValue = {
  UNPAY: 'UNPAY',
  PAID: 'PAID',
} as const;