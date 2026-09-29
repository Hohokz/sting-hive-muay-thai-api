const dayjs = require('dayjs');
const { Op } = require('sequelize');
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

const mockTransaction = {
  commit: jest.fn(),
  rollback: jest.fn(),
  LOCK: { UPDATE: 'UPDATE' }
};

jest.mock('../../models/Associations', () => ({
  Gyms: { findByPk: jest.fn(), findOne: jest.fn() },
  ClassesSchedule: {
    findByPk: jest.fn(),
    findAll: jest.fn(),
    update: jest.fn()
  },
  ClassesCapacity: {
    findOne: jest.fn(),
    update: jest.fn()
  },
  ClassesBooking: { sum: jest.fn() },
  ClassesBookingInAdvance: {
    findAll: jest.fn(),
    findOne: jest.fn(),
    findByPk: jest.fn(),
    create: jest.fn(),
    sequelize: { transaction: jest.fn() }
  }
}));

jest.mock('../../services/activityLogService', () => ({ createLog: jest.fn() }));
jest.mock('../../utils/cacheUtility', () => ({ get: jest.fn(), set: jest.fn(), clearByPrefix: jest.fn() }));

// Dates relative to "now", so a config is in effect / expired / in the future
// regardless of when the suite runs.
const daysFromNow = (n) => dayjs().add(n, 'day').startOf('day').toDate();
const activeRange = () => ({ start_date: daysFromNow(-1), end_date: daysFromNow(1) });
const expiredRange = () => ({ start_date: daysFromNow(-5), end_date: daysFromNow(-2) });

/** A config row as Sequelize would return it: fields plus update/destroy/toJSON. */
const makeConfig = (fields) => {
  const config = { id: 'adv-1', ...fields };
  config.update = jest.fn(async (data) => Object.assign(config, data));
  config.destroy = jest.fn();
  config.toJSON = () => ({ ...config });
  return config;
};

const admin = { id: 1, name: 'Admin' };

describe('Booking in advance', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    ClassesBookingInAdvance.sequelize.transaction.mockResolvedValue(mockTransaction);
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    console.error.mockRestore();
    console.log.mockRestore();
  });

  // ===============================================================
  // getScheduleRealtimeAvailability — how configs affect a given day
  // ===============================================================
  describe('getScheduleRealtimeAvailability', () => {
    beforeEach(() => {
      ClassesSchedule.findByPk.mockResolvedValue({ id: 's1', gyms_id: 1 });
    });

    test('returns gym closed when a whole-gym closure covers the date', async () => {
      ClassesBookingInAdvance.findOne.mockResolvedValueOnce({ id: 'c1', is_close_gym: true });

      const result = await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-01');

      expect(result).toMatchObject({ isCloseGym: true, isClassClosed: true, availableSeats: 0 });
      expect(ClassesBooking.sum).not.toHaveBeenCalled();
    });

    test('returns class closed when a schedule-level closure covers the date', async () => {
      ClassesBookingInAdvance.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'c2', is_close_gym: true, classes_schedule_id: 's1' });

      const result = await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-01');

      expect(result).toMatchObject({ isCloseGym: false, isClassClosed: true, maxCapacity: 0 });
    });

    test('uses the advance capacity instead of the standard capacity', async () => {
      ClassesBookingInAdvance.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'c3', is_close_gym: false, capacity: 5 });
      ClassesBooking.sum.mockResolvedValue(2);

      const result = await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-01');

      expect(result).toMatchObject({ maxCapacity: 5, currentBookingCount: 2, availableSeats: 3 });
      expect(ClassesCapacity.findOne).not.toHaveBeenCalled();
    });

    test('falls back to the standard capacity when no config covers the date', async () => {
      ClassesBookingInAdvance.findOne.mockResolvedValue(null);
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 10 });
      ClassesBooking.sum.mockResolvedValue(4);

      const result = await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-01');

      expect(result).toMatchObject({ maxCapacity: 10, currentBookingCount: 4, availableSeats: 6 });
    });

    test('never reports negative seats when overbooked', async () => {
      ClassesBookingInAdvance.findOne
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce({ id: 'c4', is_close_gym: false, capacity: 3 });
      ClassesBooking.sum.mockResolvedValue(5);

      const result = await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-01');

      expect(result.availableSeats).toBe(0);
    });

    test('matches configs by calendar date, inclusive of both ends', async () => {
      ClassesBookingInAdvance.findOne.mockResolvedValue(null);
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 10 });
      ClassesBooking.sum.mockResolvedValue(0);

      await classesScheduleService.getScheduleRealtimeAvailability('s1', '2026-10-05');

      // Form dates ("2026-10-05") are stored as midnight UTC of that day, so a
      // config ending 2026-10-05 must still match a 2026-10-05 booking.
      const where = ClassesBookingInAdvance.findOne.mock.calls[1][0].where;
      const storedEndDate = new Date('2026-10-05');
      expect(where.start_date[Op.lte]).toEqual(storedEndDate);
      expect(where.end_date[Op.gte]).toEqual(storedEndDate);
    });

    test('reads Date/ISO input as a Thai calendar date', async () => {
      ClassesBookingInAdvance.findOne.mockResolvedValue(null);
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 10 });
      ClassesBooking.sum.mockResolvedValue(0);

      // 2026-10-04T18:00Z is 01:00 on 5 Oct in Thailand
      await classesScheduleService.getScheduleRealtimeAvailability('s1', new Date('2026-10-04T18:00:00Z'));

      const where = ClassesBookingInAdvance.findOne.mock.calls[1][0].where;
      expect(where.end_date[Op.gte]).toEqual(new Date('2026-10-05'));
    });

    test('throws 404 when the schedule does not exist', async () => {
      ClassesSchedule.findByPk.mockResolvedValue(null);

      await expect(
        classesScheduleService.getScheduleRealtimeAvailability('missing', '2026-10-01')
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ===============================================================
  // getAdvancedSchedules
  // ===============================================================
  describe('getAdvancedSchedules', () => {
    test('splits configs into gym closures and capacity adjustments', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([
        makeConfig({ id: 'g1', is_close_gym: true, gyms_id: 1, classes_schedule_id: null }),
        makeConfig({
          id: 'g2',
          is_close_gym: true,
          gyms_id: 1,
          classes_schedule_id: 's1',
          schedule: { start_time: '09:00', end_time: '10:00' }
        }),
        makeConfig({
          id: 'c1',
          is_close_gym: false,
          classes_schedule_id: 's2',
          capacity: 4,
          schedule: { start_time: '18:00', end_time: '19:00', gym_enum: 'STING_CLUB' }
        })
      ]);

      const result = await classesScheduleService.getAdvancedSchedules();

      expect(result.gym_closures).toHaveLength(2);
      expect(result.gym_closures[0]).toMatchObject({ rule_type: 'GYM_CLOSED', description: 'ปิดยิม (ทั้งวัน)' });
      expect(result.gym_closures[1]).toMatchObject({
        rule_type: 'CLASS_CLOSED',
        schedule_id: 's1',
        description: 'ปิดคลาส: 09:00-10:00'
      });
      expect(result.capacity_adjustments).toEqual([
        expect.objectContaining({
          id: 'c1',
          schedule_id: 's2',
          gym_enum: 'STING_CLUB',
          rule_type: 'CAPACITY',
          time_slot: '18:00 - 19:00',
          capacity: 4,
          new_capacity: 4
        })
      ]);
    });

    test('filters to configs overlapping the requested range', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([]);

      await classesScheduleService.getAdvancedSchedules({ start_date: '2026-10-01', end_date: '2026-10-31' });

      const where = ClassesBookingInAdvance.findAll.mock.calls[0][0].where;
      expect(where.start_date[Op.lte]).toEqual(new Date('2026-10-31'));
      expect(where.end_date[Op.gte]).toEqual(new Date('2026-10-01'));
    });
  });

  // ===============================================================
  // getGymClosedDates — booking calendar
  // ===============================================================
  describe('getGymClosedDates', () => {
    const query = { gym_enum: 'STING_HIVE', start_date: '2026-10-01', end_date: '2026-10-31' };

    beforeEach(() => {
      cacheUtil.get.mockReturnValue(undefined);
      Gyms.findOne.mockResolvedValue({ id: 2 });
    });

    test('expands each closure into its calendar dates, inclusive', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([
        { start_date: new Date('2026-10-03'), end_date: new Date('2026-10-05') },
        { start_date: new Date('2026-10-13'), end_date: new Date('2026-10-13') }
      ]);

      const dates = await classesScheduleService.getGymClosedDates(query);

      expect(dates).toEqual(['2026-10-03', '2026-10-04', '2026-10-05', '2026-10-13']);
    });

    test('clips closures to the requested range and de-duplicates overlaps', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([
        { start_date: new Date('2026-09-28'), end_date: new Date('2026-10-02') },
        { start_date: new Date('2026-10-02'), end_date: new Date('2026-10-02') },
        { start_date: new Date('2026-10-30'), end_date: new Date('2026-11-04') }
      ]);

      const dates = await classesScheduleService.getGymClosedDates(query);

      expect(dates).toEqual(['2026-10-01', '2026-10-02', '2026-10-30', '2026-10-31']);
    });

    test('only queries whole-gym closures for that gym within the range', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([]);

      await classesScheduleService.getGymClosedDates(query);

      expect(Gyms.findOne).toHaveBeenCalledWith(expect.objectContaining({ where: { gym_enum: 'STING_HIVE' } }));
      const { where } = ClassesBookingInAdvance.findAll.mock.calls[0][0];
      expect(where).toMatchObject({ gyms_id: 2, is_close_gym: true, classes_schedule_id: null });
      expect(where.start_date[Op.lte]).toEqual(new Date('2026-10-31'));
      expect(where.end_date[Op.gte]).toEqual(new Date('2026-10-01'));
    });

    test('caches under the availability prefix, which rule changes clear', async () => {
      ClassesBookingInAdvance.findAll.mockResolvedValue([]);

      await classesScheduleService.getGymClosedDates(query);

      expect(cacheUtil.set.mock.calls[0][0]).toMatch(/^availability:/);
    });

    test('returns the cached result without querying', async () => {
      cacheUtil.get.mockReturnValue(['2026-10-03']);

      const dates = await classesScheduleService.getGymClosedDates(query);

      expect(dates).toEqual(['2026-10-03']);
      expect(ClassesBookingInAdvance.findAll).not.toHaveBeenCalled();
    });

    test.each([
      [{ ...query, gym_enum: 'NOPE' }],
      [{ ...query, start_date: '01/10/2026' }],
      [{ ...query, end_date: undefined }],
      [{ ...query, start_date: '2026-10-31', end_date: '2026-10-01' }],
      [{ ...query, end_date: '2028-01-01' }]
    ])('throws 400 for invalid input %#', async (badQuery) => {
      await expect(classesScheduleService.getGymClosedDates(badQuery)).rejects.toMatchObject({ status: 400 });
      expect(ClassesBookingInAdvance.findAll).not.toHaveBeenCalled();
    });
  });

  // ===============================================================
  // createAdvancedSchedule
  // ===============================================================
  describe('createAdvancedSchedule', () => {
    beforeEach(() => {
      ClassesSchedule.findByPk.mockResolvedValue({ id: 's1', gyms_id: 1 });
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 10 });
      Gyms.findByPk.mockResolvedValue({ id: 1, gym_name: 'Sting Club', gym_enum: 'STING_CLUB' });
      ClassesBooking.sum.mockResolvedValue(0);
      ClassesBookingInAdvance.create.mockImplementation(async (data) => makeConfig(data));
    });

    test('creates a capacity override and snapshots the standard capacity', async () => {
      const result = await classesScheduleService.createAdvancedSchedule(
        { schedule_id: 's1', capacity: 5, ...activeRange() },
        admin
      );

      expect(ClassesBookingInAdvance.create).toHaveBeenCalledWith(
        expect.objectContaining({
          classes_schedule_id: 's1',
          capacity: 5,
          old_capasity: 10,
          gyms_id: 1,
          is_close_gym: false,
          created_by: 'Admin'
        }),
        { transaction: mockTransaction }
      );
      expect(result.warningMessage).toBeNull();
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'CREATE_ADVANCED', service: 'SCHEDULE' }),
        { transaction: mockTransaction }
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('availability');
    });

    test('does not overwrite the standard capacity (regression: override leaked into the normal schedule)', async () => {
      await classesScheduleService.createAdvancedSchedule(
        { schedule_id: 's1', capacity: 5, ...activeRange() },
        admin
      );

      expect(ClassesCapacity.update).not.toHaveBeenCalled();
    });

    test('returns a warning when existing bookings exceed the new capacity', async () => {
      ClassesBooking.sum.mockResolvedValue(8);

      const result = await classesScheduleService.createAdvancedSchedule(
        { schedule_id: 's1', capacity: 5, ...activeRange() },
        admin
      );

      expect(result.warningMessage).toContain('(8)');
      expect(result.warningMessage).toContain('(5)');
      expect(mockTransaction.commit).toHaveBeenCalled();
    });

    test('creates a whole-gym closure without touching the normal schedule', async () => {
      await classesScheduleService.createAdvancedSchedule(
        { gyms_id: 1, is_close_gym: true, ...activeRange() },
        admin
      );

      expect(ClassesBookingInAdvance.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_close_gym: true, classes_schedule_id: null, capacity: null, gyms_id: 1 }),
        { transaction: mockTransaction }
      );
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ details: expect.objectContaining({ rule_type: 'GYM_CLOSED' }) }),
        { transaction: mockTransaction }
      );
      // regression: closures used to flip is_active on every class of the gym
      expect(ClassesSchedule.update).not.toHaveBeenCalled();
    });

    test('closes a single class, taking the gym from the schedule', async () => {
      await classesScheduleService.createAdvancedSchedule(
        { schedule_id: 's1', is_close_gym: true, ...activeRange() },
        admin
      );

      expect(ClassesBookingInAdvance.create).toHaveBeenCalledWith(
        expect.objectContaining({ is_close_gym: true, classes_schedule_id: 's1', capacity: null, gyms_id: 1 }),
        { transaction: mockTransaction }
      );
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ details: expect.objectContaining({ rule_type: 'CLASS_CLOSED' }) }),
        { transaction: mockTransaction }
      );
      expect(ClassesBooking.sum).not.toHaveBeenCalled();
      expect(ClassesSchedule.update).not.toHaveBeenCalled();
    });

    test('throws 400 for a capacity override without a class', async () => {
      await expect(
        classesScheduleService.createAdvancedSchedule({ gyms_id: 1, capacity: 5, ...activeRange() }, admin)
      ).rejects.toMatchObject({ status: 400 });
      expect(ClassesBookingInAdvance.create).not.toHaveBeenCalled();
    });

    test.each([undefined, -1, 2.5, NaN])('throws 400 for an invalid capacity (%p)', async (capacity) => {
      await expect(
        classesScheduleService.createAdvancedSchedule({ schedule_id: 's1', capacity, ...activeRange() }, admin)
      ).rejects.toMatchObject({ status: 400 });
      expect(ClassesBookingInAdvance.create).not.toHaveBeenCalled();
    });

    test('throws 400 for a gym closure without gyms_id', async () => {
      await expect(
        classesScheduleService.createAdvancedSchedule({ is_close_gym: true, ...activeRange() }, admin)
      ).rejects.toMatchObject({ status: 400 });
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    test('throws 404 when the schedule does not exist', async () => {
      ClassesSchedule.findByPk.mockResolvedValue(null);

      await expect(
        classesScheduleService.createAdvancedSchedule({ schedule_id: 'missing', capacity: 5, ...activeRange() }, admin)
      ).rejects.toMatchObject({ status: 404 });
      expect(ClassesBookingInAdvance.create).not.toHaveBeenCalled();
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    test('throws 404 when the gym does not exist', async () => {
      Gyms.findByPk.mockResolvedValue(null);

      await expect(
        classesScheduleService.createAdvancedSchedule({ gyms_id: 99, is_close_gym: true, ...activeRange() }, admin)
      ).rejects.toMatchObject({ status: 404 });
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // updateAdvancedSchedule
  // ===============================================================
  describe('updateAdvancedSchedule', () => {
    beforeEach(() => {
      ClassesSchedule.findByPk.mockResolvedValue({ id: 's1', gyms_id: 1 });
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 10 });
      ClassesBooking.sum.mockResolvedValue(0);
    });

    test('updates the capacity without touching the standard capacity', async () => {
      const config = makeConfig({
        is_close_gym: false,
        classes_schedule_id: 's1',
        gyms_id: 1,
        capacity: 5,
        old_capasity: 10,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      const result = await classesScheduleService.updateAdvancedSchedule('adv-1', { capacity: 7 }, admin);

      expect(result.capacity).toBe(7);
      expect(config.update).toHaveBeenCalledWith(
        expect.objectContaining({ capacity: 7, updated_by: 'Admin' }),
        { transaction: mockTransaction }
      );
      expect(ClassesCapacity.update).not.toHaveBeenCalled();
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'UPDATE_ADVANCED' }),
        { transaction: mockTransaction }
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('availability');
    });

    test('skips the availability re-check when nothing relevant changed', async () => {
      const config = makeConfig({
        is_close_gym: false,
        classes_schedule_id: 's1',
        gyms_id: 1,
        capacity: 5,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.updateAdvancedSchedule('adv-1', {}, admin);

      expect(ClassesBooking.sum).not.toHaveBeenCalled();
    });

    test('turns a gym closure into a capacity override', async () => {
      const config = makeConfig({
        is_close_gym: true,
        classes_schedule_id: null,
        gyms_id: 1,
        capacity: null,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.updateAdvancedSchedule(
        'adv-1',
        { is_close_gym: false, schedule_id: 's1', capacity: 5 },
        admin
      );

      expect(config).toMatchObject({ is_close_gym: false, classes_schedule_id: 's1', capacity: 5 });
      expect(ClassesSchedule.update).not.toHaveBeenCalled();
    });

    test('turns a class closure into a whole-gym closure when schedule_id is cleared', async () => {
      const config = makeConfig({
        is_close_gym: true,
        classes_schedule_id: 's1',
        gyms_id: 1,
        capacity: null,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.updateAdvancedSchedule('adv-1', { schedule_id: null }, admin);

      expect(config.classes_schedule_id).toBeNull();
      expect(config.is_close_gym).toBe(true);
    });

    test('keeps the class when schedule_id is not sent', async () => {
      const config = makeConfig({
        is_close_gym: true,
        classes_schedule_id: 's1',
        gyms_id: 1,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.updateAdvancedSchedule('adv-1', { end_date: daysFromNow(3) }, admin);

      expect(config.classes_schedule_id).toBe('s1');
    });

    test('clears the capacity when a capacity override becomes a class closure', async () => {
      const config = makeConfig({
        is_close_gym: false,
        classes_schedule_id: 's1',
        gyms_id: 1,
        capacity: 5,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.updateAdvancedSchedule('adv-1', { is_close_gym: true }, admin);

      expect(config).toMatchObject({ is_close_gym: true, classes_schedule_id: 's1', capacity: null });
    });

    test('throws 404 when the config does not exist', async () => {
      ClassesBookingInAdvance.findByPk.mockResolvedValue(null);

      await expect(
        classesScheduleService.updateAdvancedSchedule('missing', { capacity: 5 }, admin)
      ).rejects.toMatchObject({ status: 404 });
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });

    test('throws 400 when a capacity override has no schedule', async () => {
      const config = makeConfig({
        is_close_gym: true,
        classes_schedule_id: null,
        gyms_id: 1,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await expect(
        classesScheduleService.updateAdvancedSchedule('adv-1', { is_close_gym: false }, admin)
      ).rejects.toMatchObject({ status: 400 });
      expect(config.update).not.toHaveBeenCalled();
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // deleteAdvancedSchedule
  // ===============================================================
  describe('deleteAdvancedSchedule', () => {
    beforeEach(() => {
      Gyms.findByPk.mockResolvedValue({ id: 1, gym_name: 'Sting Club', gym_enum: 'STING_CLUB' });
    });

    test('deletes an active capacity override without touching the standard capacity', async () => {
      const config = makeConfig({
        is_close_gym: false,
        classes_schedule_id: 's1',
        gyms_id: 1,
        capacity: 5,
        old_capasity: 10,
        ...activeRange()
      });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      const result = await classesScheduleService.deleteAdvancedSchedule('adv-1', admin);

      expect(ClassesCapacity.update).not.toHaveBeenCalled();
      expect(config.destroy).toHaveBeenCalledWith({ transaction: mockTransaction });
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DELETE_ADVANCED' })
      );
      expect(mockTransaction.commit).toHaveBeenCalled();
      expect(cacheUtil.clearByPrefix).toHaveBeenCalledWith('availability');
      expect(result.message).toBeDefined();
    });

    test('deletes an active gym closure without touching the normal schedule', async () => {
      const config = makeConfig({ is_close_gym: true, gyms_id: 1, classes_schedule_id: null, ...activeRange() });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);

      await classesScheduleService.deleteAdvancedSchedule('adv-1', admin);

      expect(ClassesSchedule.update).not.toHaveBeenCalled();
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({ details: expect.objectContaining({ rule_type: 'GYM_CLOSED' }) })
      );
      expect(config.destroy).toHaveBeenCalled();
    });

    test('throws 404 when the config does not exist', async () => {
      ClassesBookingInAdvance.findByPk.mockResolvedValue(null);

      await expect(
        classesScheduleService.deleteAdvancedSchedule('missing', admin)
      ).rejects.toMatchObject({ status: 404 });
      expect(mockTransaction.rollback).toHaveBeenCalled();
    });
  });

  // ===============================================================
  // Expiry — a config left in place past its end date
  // ===============================================================
  describe('expired config that was never deleted', () => {
    test('availability falls back to the standard capacity once the config no longer covers the date', async () => {
      // Past end_date the date-range query no longer matches the config.
      ClassesSchedule.findByPk.mockResolvedValue({ id: 's1', gyms_id: 1 });
      ClassesBookingInAdvance.findOne.mockResolvedValue(null);
      ClassesCapacity.findOne.mockResolvedValue({ capacity: 12 });
      ClassesBooking.sum.mockResolvedValue(0);

      const result = await classesScheduleService.getScheduleRealtimeAvailability(
        's1',
        dayjs().format('YYYY-MM-DD')
      );

      expect(result.maxCapacity).toBe(12);
    });

    test('deleting an expired config later changes nothing', async () => {
      const config = makeConfig({ is_close_gym: true, gyms_id: 1, ...expiredRange() });
      ClassesBookingInAdvance.findByPk.mockResolvedValue(config);
      Gyms.findByPk.mockResolvedValue(null);

      await classesScheduleService.deleteAdvancedSchedule('adv-1', admin);

      expect(ClassesSchedule.update).not.toHaveBeenCalled();
      expect(ClassesCapacity.update).not.toHaveBeenCalled();
      expect(config.destroy).toHaveBeenCalled();
    });
  });
});
