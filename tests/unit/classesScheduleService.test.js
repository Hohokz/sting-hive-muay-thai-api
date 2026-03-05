const classesScheduleService = require('../../services/classesScheduleService');
const {
  Gyms,
  ClassesSchedule,
  ClassesCapacity,
  ClassesBooking,
  ClassesBookingInAdvance
} = require('../../models/Associations');
const activityLogService = require('../../services/activityLogService');
const cacheUtil = require('../../utils/cacheUtility');

// Mock Models
jest.mock('../../models/Associations', () => ({
  Gyms: { count: jest.fn() },
  ClassesSchedule: {
    create: jest.fn(),
    findByPk: jest.fn(),
    findAll: jest.fn(),
    destroy: jest.fn(),
    sequelize: {
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn(),
        rollback: jest.fn()
      })
    }
  },
  ClassesCapacity: {
    create: jest.fn(),
    update: jest.fn(),
    findOne: jest.fn()
  },
  ClassesBooking: {
    findAll: jest.fn(),
    sum: jest.fn()
  },
  ClassesBookingInAdvance: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    sequelize: {
      transaction: jest.fn().mockResolvedValue({
        commit: jest.fn(),
        rollback: jest.fn()
      })
    }
  }
}));

// Mock Services and Utilities
jest.mock('../../services/activityLogService', () => ({ createLog: jest.fn() }));
jest.mock('../../utils/cacheUtility', () => ({ get: jest.fn(), set: jest.fn(), clearByPrefix: jest.fn() }));

describe('ClassesScheduleService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createSchedule', () => {
    test('should create a schedule and capacity entry', async () => {
      const scheduleData = {
        start_time: '09:00',
        end_time: '10:00',
        gym_enum: 'STING_CLUB',
        capacity: 10
      };

      ClassesSchedule.create.mockResolvedValue({ id: 1 });
      ClassesSchedule.findByPk.mockResolvedValue({ id: 1, capacity_data: { capacity: 10 } });

      const result = await classesScheduleService.createSchedule(scheduleData, { id: 1, name: 'Admin' });

      expect(ClassesSchedule.create).toHaveBeenCalled();
      expect(ClassesCapacity.create).toHaveBeenCalled();
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('schedules');
      expect(result.id).toBe(1);
    });

    test('should throw error for invalid time format', async () => {
      const invalidData = { start_time: '9:00', end_time: '10:00' };
      await expect(classesScheduleService.createSchedule(invalidData)).rejects.toThrow('รูปแบบเวลาไม่ถูกต้อง');
    });
  });

  describe('getSchedules', () => {
    test('should return cached schedules if available', async () => {
      cacheUtil.get.mockReturnValue([{ id: 1 }]);
      const result = await classesScheduleService.getSchedules();
      expect(result).toHaveLength(1);
      expect(ClassesSchedule.findAll).not.toHaveBeenCalled();
    });

    test('should fetch from DB and cache if not in cache', async () => {
      cacheUtil.get.mockReturnValue(null);
      ClassesSchedule.findAll.mockResolvedValue([{ id: 1 }]);
      
      const result = await classesScheduleService.getSchedules();
      
      expect(ClassesSchedule.findAll).toHaveBeenCalled();
      expect(cacheUtil.set).toHaveBeenCalled();
      expect(result).toHaveLength(1);
    });
  });

  describe('getAvailableSchedulesByBookingDate', () => {
    test('should calculate availability correctly with advanced config', async () => {
      const mockSchedule = {
        id: 1,
        gyms_id: 1,
        start_time: '10:00',
        end_time: '11:00',
        gym_enum: 'STING_CLUB',
        capacity_data: { capacity: 10 }
      };
      
      ClassesSchedule.findAll.mockResolvedValue([mockSchedule]);
      ClassesBookingInAdvance.findAll.mockResolvedValue([]); // No gym closures
      ClassesBooking.findAll.mockResolvedValue([]); // No bookings
      
      const result = await classesScheduleService.getAvailableSchedulesByBookingDate('2024-03-05', 'STING_CLUB');

      expect(result).toHaveLength(1);
      expect(result[0].available_seats).toBe(10);
    });
  });
});
