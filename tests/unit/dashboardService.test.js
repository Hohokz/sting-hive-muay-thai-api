const dashboardService = require('../../services/dashboardService');
const { ClassesBooking, ClassesSchedule } = require('../../models/Associations');

jest.mock('../../models/Associations', () => ({
  ClassesBooking: {
    count: jest.fn(),
    sum: jest.fn(),
    findAll: jest.fn()
  },
  ClassesSchedule: {}
}));

describe('DashboardService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDashboardSummary', () => {
    test('should return a summary of today bookings', async () => {
      ClassesBooking.count.mockResolvedValue(10);
      ClassesBooking.sum.mockImplementation((attr) => {
        if (attr === 'capacity') return Promise.resolve(25);
        return Promise.resolve(0);
      });

      const result = await dashboardService.getDashboardSummary('2024-03-05');

      expect(ClassesBooking.count).toHaveBeenCalled();
      expect(ClassesBooking.sum).toHaveBeenCalled();
      expect(result.todayBooking).toBe(10);
      expect(result.totalCapacityToday).toBe(25);
    });
  });

  describe('getDailyBookingsByDate', () => {
    test('should return bookings for a specific date', async () => {
      const mockBooking = {
        id: 1,
        toJSON: () => ({ id: 1, schedule: { id: 101 } })
      };
      ClassesBooking.findAll.mockResolvedValue([mockBooking]);

      const result = await dashboardService.getDailyBookingsByDate('2024-03-05');

      expect(ClassesBooking.findAll).toHaveBeenCalledWith(expect.objectContaining({
        where: expect.anything(),
        include: expect.any(Array)
      }));
      expect(result[0].schedule_id).toBe(101);
    });
  });
});
