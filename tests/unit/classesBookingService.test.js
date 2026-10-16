const classesBookingService = require('../../services/classesBookingService');
const {
  ClassesBooking,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBookingInAdvance,
  User
} = require('../../models/Associations');
const { sequelize } = require('../../config/db');
const { sendBookingConfirmationEmail } = require('../../utils/emailService');
const { getSchedulesById, getScheduleRealtimeAvailability } = require('../../services/classesScheduleService');
const activityLogService = require('../../services/activityLogService');
const cacheUtil = require('../../utils/cacheUtility');

// Mock Models
jest.mock('../../models/Associations', () => ({
  ClassesBooking: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn()
  },
  ClassesSchedule: {},
  ClassesCapacity: {},
  ClassesBookingInAdvance: {},
  User: { findByPk: jest.fn(), findAll: jest.fn() }
}));

jest.mock('../../config/db', () => ({
  sequelize: {
    transaction: jest.fn().mockResolvedValue({
      commit: jest.fn(),
      rollback: jest.fn()
    })
  }
}));

// Mock external services and utilities
jest.mock('../../utils/emailService', () => ({ sendBookingConfirmationEmail: jest.fn() }));
jest.mock('../../services/classesScheduleService', () => ({
  getSchedulesById: jest.fn(),
  getScheduleRealtimeAvailability: jest.fn()
}));
jest.mock('../../services/activityLogService', () => ({ createLog: jest.fn() }));
jest.mock('../../utils/cacheUtility', () => ({ clearByPrefix: jest.fn() }));
jest.mock('fs', () => ({
  // Spread the real module first — the exceljs dependency chain (via the
  // `tmp` package) uses several other fs members (constants, rmdirSync,
  // ...) at require time, and this mock only needs to fake
  // existsSync/readFileSync for the email template logic this test
  // actually exercises.
  ...jest.requireActual('fs'),
  existsSync: jest.fn().mockReturnValue(true),
  readFileSync: jest.fn().mockReturnValue('<html>{{client_name}}</html>')
}));

describe('ClassesBookingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createBooking', () => {
    test('should create a booking successfully', async () => {
      const bookingData = {
        classes_schedule_id: 1,
        client_name: 'Test Customer',
        client_email: 'test@example.com',
        capacity: 1,
        date_booking: '2026-12-01'
      };

      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10,
        currentBookingCount: 0,
        isCloseGym: false,
        isClassClosed: false
      });

      getSchedulesById.mockResolvedValue({ id: 1, gyms_id: 1, gym_enum: 'STING_CLUB', start_time: '10:00', end_time: '11:00' });
      ClassesBooking.create.mockResolvedValue({ id: 99, toJSON: () => ({ id: 99 }) });

      const result = await classesBookingService.createBooking(bookingData, { id: 1, name: 'Admin', role: 'ADMIN' });

      expect(ClassesBooking.create).toHaveBeenCalled();
      expect(activityLogService.createLog).toHaveBeenCalled();
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('availability');
      expect(result.id).toBe(99);
    });

    test('should throw error if class is full', async () => {
      const bookingData = {
        classes_schedule_id: 1,
        client_name: 'Test Customer',
        client_email: 'test@example.com',
        capacity: 5,
        date_booking: '2026-12-01'
      };

      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10,
        currentBookingCount: 8,
        isCloseGym: false,
        isClassClosed: false
      });

      await expect(classesBookingService.createBooking(bookingData)).rejects.toThrow('ที่นั่งไม่พอ');
    });

    describe('class type must match the schedule', () => {
      const bookingData = {
        classes_schedule_id: 1,
        client_name: 'Test Customer',
        client_email: 'test@example.com',
        capacity: 1,
        date_booking: '2026-12-01'
      };
      const groupSchedule = { id: 1, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: false };
      const privateSchedule = { ...groupSchedule, is_private_class: true };

      beforeEach(() => {
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 10,
          currentBookingCount: 0,
          isCloseGym: false,
          isClassClosed: false
        });
        ClassesBooking.create.mockResolvedValue({ id: 99 });
      });

      test('rejects a private booking on a group schedule', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);

        await expect(
          classesBookingService.createBooking({ ...bookingData, is_private: true })
        ).rejects.toMatchObject({ status: 400 });
        expect(ClassesBooking.create).not.toHaveBeenCalled();
      });

      test('rejects a group booking on a private schedule', async () => {
        getSchedulesById.mockResolvedValue(privateSchedule);

        await expect(
          classesBookingService.createBooking({ ...bookingData, is_private: false })
        ).rejects.toMatchObject({ status: 400 });
        expect(ClassesBooking.create).not.toHaveBeenCalled();
      });

      test('takes is_private from the schedule when the client omits it', async () => {
        getSchedulesById.mockResolvedValue(privateSchedule);

        await classesBookingService.createBooking(bookingData);

        expect(ClassesBooking.create.mock.calls[0][0].is_private).toBe(true);
      });
    });
  });

  describe('updateBooking', () => {
    const updateData = {
      classes_schedule_id: 2,
      client_name: 'Test Customer',
      client_email: 'test@example.com',
      capacity: 1,
      date_booking: '2026-12-01'
    };

    test('rejects moving a private booking onto a group schedule', async () => {
      const booking = { id: 5, classes_schedule_id: 1, capacity: 1, date_booking: '2026-12-01', update: jest.fn() };
      ClassesBooking.findByPk.mockResolvedValue(booking);
      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10,
        currentBookingCount: 0,
        isCloseGym: false,
        isClassClosed: false
      });
      getSchedulesById.mockResolvedValue({ id: 2, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: false });

      await expect(
        classesBookingService.updateBooking(5, { ...updateData, is_private: true })
      ).rejects.toMatchObject({ status: 400 });
      expect(booking.update).not.toHaveBeenCalled();
    });

    describe('changing the seat count in the same slot', () => {
      const sameSlot = { classes_schedule_id: 1, date_booking: '2026-12-01', is_private: false };
      const mockBooking = (capacity) => ({
        id: 5,
        classes_schedule_id: 1,
        capacity,
        date_booking: '2026-12-01',
        update: jest.fn().mockImplementation(async (data) => ({ id: 5, ...data }))
      });

      beforeEach(() => {
        getSchedulesById.mockResolvedValue({ id: 1, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: false });
      });

      test('shrinking 4 → 2 is allowed even when the slot is now over capacity', async () => {
        const booking = mockBooking(4);
        ClassesBooking.findByPk.mockResolvedValue(booking);
        // capacity was lowered to 3 after this booking of 4 (plus 1 other) was made
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 3, currentBookingCount: 5, isCloseGym: false, isClassClosed: false
        });

        await classesBookingService.updateBooking(5, { ...updateData, ...sameSlot, capacity: 2 });

        expect(getScheduleRealtimeAvailability).not.toHaveBeenCalled();
        expect(booking.update).toHaveBeenCalledWith(expect.objectContaining({ capacity: 2 }), expect.any(Object));
      });

      test('shrinking is allowed even when the class was closed by an advance rule', async () => {
        const booking = mockBooking(4);
        ClassesBooking.findByPk.mockResolvedValue(booking);
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 0, currentBookingCount: 4, isCloseGym: false, isClassClosed: true, closuresReason: 'Class Closed'
        });

        await classesBookingService.updateBooking(5, { ...updateData, ...sameSlot, capacity: 1 });

        expect(booking.update).toHaveBeenCalled();
      });

      test('growing 2 → 4 is still checked against free seats (own seats count as free)', async () => {
        const booking = mockBooking(2);
        ClassesBooking.findByPk.mockResolvedValue(booking);
        // 5 seats, 2 ours + 2 others → only 3 available to us
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 5, currentBookingCount: 4, isCloseGym: false, isClassClosed: false
        });

        await expect(
          classesBookingService.updateBooking(5, { ...updateData, ...sameSlot, capacity: 4 })
        ).rejects.toMatchObject({ status: 409 });
        expect(booking.update).not.toHaveBeenCalled();
      });

      test('growing 2 → 3 fits exactly', async () => {
        const booking = mockBooking(2);
        ClassesBooking.findByPk.mockResolvedValue(booking);
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 5, currentBookingCount: 4, isCloseGym: false, isClassClosed: false
        });

        await classesBookingService.updateBooking(5, { ...updateData, ...sameSlot, capacity: 3 });
        expect(booking.update).toHaveBeenCalled();
      });

      test('moving to another slot with fewer seats is still checked, even when shrinking', async () => {
        const booking = mockBooking(4);
        ClassesBooking.findByPk.mockResolvedValue(booking);
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 1, currentBookingCount: 0, isCloseGym: false, isClassClosed: false
        });

        await expect(
          classesBookingService.updateBooking(5, { ...updateData, ...sameSlot, classes_schedule_id: 2, capacity: 2 })
        ).rejects.toMatchObject({ status: 409 });
      });
    });
  });

  describe('updateBookingStatus', () => {
    test('should update status and clear cache', async () => {
      const mockBooking = {
        id: 99,
        booking_status: 'PENDING',
        update: jest.fn().mockResolvedValue({ id: 99, booking_status: 'SUCCEED' })
      };
      ClassesBooking.findByPk.mockResolvedValue(mockBooking);

      const result = await classesBookingService.updateBookingStatus(99, 'SUCCEED', { name: 'Admin' });

      expect(mockBooking.update).toHaveBeenCalledWith(expect.objectContaining({ booking_status: 'SUCCEED' }), expect.any(Object));
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('availability');
      expect(result.booking_status).toBe('SUCCEED');
    });
  });
});
