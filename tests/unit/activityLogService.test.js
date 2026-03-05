const activityLogService = require('../../services/activityLogService');
const { ActivityLog, User, ClassesSchedule, ClassesCapacity } = require('../../models/Associations');

// Mock specific models from Associations
jest.mock('../../models/Associations', () => ({
  ActivityLog: {
    create: jest.fn(),
    findAndCountAll: jest.fn()
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
  });
});
