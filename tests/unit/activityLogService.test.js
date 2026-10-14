const activityLogService = require('../../services/activityLogService');
const { ActivityLog, User, ClassesSchedule, ClassesCapacity } = require('../../models/Associations');

// Mock specific models from Associations
jest.mock('../../models/Associations', () => ({
  ActivityLog: {
    create: jest.fn(),
    findAndCountAll: jest.fn(),
    findAll: jest.fn()
  },
  User: {},
  ClassesSchedule: {
    findAll: jest.fn()
  },
  ClassesCapacity: {}
}));

describe('ActivityLogService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createLog', () => {
    test('should create a log entry', async () => {
      const mockData = { service: 'Auth', action: 'Login', user_id: 1 };
      ActivityLog.create.mockResolvedValue(mockData);

      const result = await activityLogService.createLog(mockData);

      expect(ActivityLog.create).toHaveBeenCalledWith(mockData);
      expect(result).toEqual(mockData);
    });

    test('should not throw on failure (swallows error)', async () => {
      ActivityLog.create.mockRejectedValue(new Error('Log Failure'));
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      const result = await activityLogService.createLog({ data: 'test' });
      
      expect(result).toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getActivityLogs', () => {
    test('should fetch and enrich logs with schedule details', async () => {
      const mockLog = {
        id: 1,
        details: { schedule_id: 101 },
        get: jest.fn().mockReturnValue({ id: 1, details: { schedule_id: 101 } })
      };
      
      ActivityLog.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockLog]
      });

      const mockSchedule = {
        id: 101,
        start_time: '10:00',
        end_time: '11:00',
        toJSON: jest.fn().mockReturnValue({ id: 101, start_time: '10:00', end_time: '11:00' })
      };
      ClassesSchedule.findAll.mockResolvedValue([mockSchedule]);

      const result = await activityLogService.getActivityLogs({ limit: 10, offset: 0 });

      expect(ActivityLog.findAndCountAll).toHaveBeenCalled();
      expect(ClassesSchedule.findAll).toHaveBeenCalledWith(expect.objectContaining({
        where: { id: [101] }
      }));
      expect(result.total).toBe(1);
      expect(result.logs[0].details.schedule_details).toBeDefined();
    });

    test('should apply date filter when date query is provided', async () => {
      const mockLog = {
        id: 2,
        get: jest.fn().mockReturnValue({ id: 2 })
      };

      ActivityLog.findAndCountAll.mockResolvedValue({
        count: 1,
        rows: [mockLog]
      });

      await activityLogService.getActivityLogs({ date: '2026-06-02' });

      expect(ActivityLog.findAndCountAll).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.objectContaining({
          created_at: expect.any(Object)
        })
      }));
    });
  });

  describe('getScheduleLogs', () => {
    test('finds SCHEDULE logs mentioning the schedule directly or via a moved advance rule', async () => {
      const { Op } = require('sequelize');
      ActivityLog.findAll.mockResolvedValue([{ get: () => ({ action: 'UPDATE' }) }]);

      const result = await activityLogService.getScheduleLogs('s1');

      expect(result).toEqual([{ action: 'UPDATE' }]);
      const query = ActivityLog.findAll.mock.calls[0][0];
      expect(query.where.service).toBe('SCHEDULE');
      expect(query.where[Op.or]).toEqual([
        { details: { schedule_id: 's1' } },
        { details: { old_values: { classes_schedule_id: 's1' } } },
        { details: { new_values: { classes_schedule_id: 's1' } } }
      ]);
      expect(query.order).toEqual([['created_at', 'DESC']]);
    });
  });
});
