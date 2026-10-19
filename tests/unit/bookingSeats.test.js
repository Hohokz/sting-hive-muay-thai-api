jest.mock('../../models/Associations', () => ({ ClassesBooking: { findOne: jest.fn() } }));

const { bookingSeats, sumBookingSeats } = require('../../utils/bookingSeats');
const { ClassesBooking } = require('../../models/Associations');

describe('bookingSeats', () => {
  test('group booking: one seat per student', () => {
    expect(bookingSeats({ capacity: 4, private_trainers: null })).toBe(4);
  });

  test('private booking: one seat per trainer', () => {
    expect(bookingSeats({ capacity: 5, private_trainers: 3 })).toBe(3);
  });

  test('legacy private booking (no private_trainers): falls back to students', () => {
    expect(bookingSeats({ capacity: 4, private_trainers: null })).toBe(4);
    expect(bookingSeats({ capacity: 4 })).toBe(4);
  });
});

describe('sumBookingSeats', () => {
  beforeEach(() => jest.clearAllMocks());

  test('returns the SUM as a number (Postgres sends it as a string)', async () => {
    ClassesBooking.findOne.mockResolvedValue({ seats: '7' });
    expect(await sumBookingSeats({ classes_schedule_id: 1 })).toBe(7);
  });

  test('no matching bookings (SUM is NULL) → 0', async () => {
    ClassesBooking.findOne.mockResolvedValue({ seats: null });
    expect(await sumBookingSeats({})).toBe(0);
  });

  test('passes the transaction and include through', async () => {
    ClassesBooking.findOne.mockResolvedValue({ seats: '1' });
    const transaction = {};
    const include = [{ as: 'schedule' }];
    await sumBookingSeats({ id: 1 }, { transaction, include });
    expect(ClassesBooking.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 1 }, transaction, include, raw: true })
    );
  });
});
