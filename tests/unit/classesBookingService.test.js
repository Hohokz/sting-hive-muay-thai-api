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
