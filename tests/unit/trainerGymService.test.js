const trainerGymService = require('../../services/trainerGymService');
const { User, Gyms, TrainerGyms, ClassesBooking } = require('../../models/Associations');
const activityLogService = require('../../services/activityLogService');

jest.mock('../../models/Associations', () => ({
  User: {
    findAll: jest.fn(),
    findByPk: jest.fn()
  },
  Gyms: {
    findByPk: jest.fn()
  },
  TrainerGyms: {
    findOne: jest.fn(),
    create: jest.fn(),
    destroy: jest.fn()
  },
  ClassesBooking: {
    findAll: jest.fn()
  }
}));

jest.mock('../../services/activityLogService', () => ({
  createLog: jest.fn().mockResolvedValue({})
}));

describe('TrainerGymService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getTrainersByGym', () => {
    test('should return trainers for a given gym', async () => {
      const mockGym = {
        id: 1,
        trainers: [{ id: 10, name: 'Trainer A' }, { id: 11, name: 'Trainer B' }]
      };
      Gyms.findByPk.mockResolvedValue(mockGym);

      const result = await trainerGymService.getTrainersByGym(1);

      expect(Gyms.findByPk).toHaveBeenCalledWith(1, expect.any(Object));
      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Trainer A');
    });

    test('should filter out busy trainers if date and schedule are provided', async () => {
      const mockGym = {
        id: 1,
        trainers: [{ id: 10, name: 'Trainer A' }, { id: 11, name: 'Trainer B' }]
      };
      Gyms.findByPk.mockResolvedValue(mockGym);
      
      // Mock one trainer as busy
      ClassesBooking.findAll.mockResolvedValue([{ trainer: 'Trainer A' }]);

      const result = await trainerGymService.getTrainersByGym(1, { 
        date: '2024-03-05', 
        classes_schedule_id: 100 
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Trainer B');
    });
  });

  describe('assignTrainerToGym', () => {
    test('should assign a trainer to a gym successfully', async () => {
      TrainerGyms.findOne.mockResolvedValue(null);
      TrainerGyms.create.mockResolvedValue({ id: 1 });
      User.findByPk.mockResolvedValue({ id: 10, name: 'Trainer A' });
      Gyms.findByPk.mockResolvedValue({ id: 1, gym_name: 'Gym X' });

      const result = await trainerGymService.assignTrainerToGym(10, 1, { id: 99, name: 'Admin' });

      expect(TrainerGyms.create).toHaveBeenCalledWith({ user_id: 10, gyms_id: 1 });
      expect(activityLogService.createLog).toHaveBeenCalled();
      expect(result.id).toBe(1);
    });

    test('should throw error if already assigned', async () => {
      TrainerGyms.findOne.mockResolvedValue({ id: 1 });
      await expect(trainerGymService.assignTrainerToGym(10, 1)).rejects.toThrow('เทรนเนอร์ท่านนี้ถูกเพิ่มเข้ายิมนี้อยู่แล้ว');
    });
  });
});
