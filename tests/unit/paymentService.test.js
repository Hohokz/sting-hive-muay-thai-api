const paymentService = require('../../services/paymentService');
const { sequelize } = require('../../config/db');

jest.mock('../../config/db', () => ({
  sequelize: { query: jest.fn() }
}));
jest.mock('../../models/Associations', () => ({ PaymentMethod: {} }));
jest.mock('../../services/activityLogService', () => ({ createLog: jest.fn() }));

// The range getPaymentSummary queried with, as ISO strings
const queriedRange = async (period, value) => {
  await paymentService.getPaymentSummary({ period, value });
  const { start, end } = sequelize.query.mock.calls[0][1].replacements;
  return [start.toISOString(), end.toISOString()];
};

describe('PaymentService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sequelize.query.mockResolvedValue([[]]);
  });

  describe('getPaymentSummary — periods are Thai calendar days', () => {
    test('day runs from Thai midnight to the next Thai midnight', async () => {
      expect(await queriedRange('day', '2026-10-14')).toEqual([
        '2026-10-13T17:00:00.000Z',
        '2026-10-14T17:00:00.000Z'
      ]);
    });

    test('week starts on the ISO Monday, Thai midnight', async () => {
      // ISO week 42 of 2026 is Mon 12 Oct – Sun 18 Oct
      expect(await queriedRange('week', '2026-W42')).toEqual([
        '2026-10-11T17:00:00.000Z',
        '2026-10-18T17:00:00.000Z'
      ]);
    });

    test('week 1 can start in the previous calendar year', async () => {
      // ISO week 1 of 2026 starts Mon 29 Dec 2025
      expect(await queriedRange('week', '2026-W01')).toEqual([
        '2025-12-28T17:00:00.000Z',
        '2026-01-04T17:00:00.000Z'
      ]);
    });

    test('month covers the whole Thai month', async () => {
      expect(await queriedRange('month', '2026-10')).toEqual([
        '2026-09-30T17:00:00.000Z',
        '2026-10-31T17:00:00.000Z'
      ]);
    });

    test('year covers the whole Thai year', async () => {
      expect(await queriedRange('year', '2026')).toEqual([
        '2025-12-31T17:00:00.000Z',
        '2026-12-31T17:00:00.000Z'
      ]);
    });

    test('a class day, stored as 00:00 UTC, falls inside its own Thai day', async () => {
      const [start, end] = await queriedRange('day', '2026-10-14');
      const classDay = '2026-10-14T00:00:00.000Z';
      expect(classDay >= start && classDay < end).toBe(true);
    });

    test('rejects a malformed value', async () => {
      await expect(
        paymentService.getPaymentSummary({ period: 'month', value: '2026-1' })
      ).rejects.toMatchObject({ status: 400 });
      expect(sequelize.query).not.toHaveBeenCalled();
    });
  });
});
