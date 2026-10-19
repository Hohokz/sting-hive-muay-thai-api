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

  describe('private classes: seats are trainers (private_trainers)', () => {
    const privateSchedule = { id: 1, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: true };
    const groupSchedule = { ...privateSchedule, is_private_class: false };
    const base = {
      classes_schedule_id: 1,
      client_name: 'Test Customer',
      client_email: 'test@example.com',
      date_booking: '2026-12-01',
      is_private: true
    };
    const admin = { id: 1, name: 'Admin', role: 'ADMIN' };
    // `free` trainers left on standby in the class
    const standby = (free) =>
      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10, currentBookingCount: 10 - free, isCloseGym: false, isClassClosed: false
      });
    const created = () => ClassesBooking.create.mock.calls[0][0];

    beforeEach(() => {
      getSchedulesById.mockResolvedValue(privateSchedule);
      ClassesBooking.create.mockResolvedValue({ id: 99 });
    });

    describe('createBooking', () => {
      test('5 students with 3 trainers takes 3 seats, not 5', async () => {
        standby(3);
        await classesBookingService.createBooking({ ...base, capacity: 5, private_trainers: 3 });
        expect(created()).toMatchObject({ capacity: 5, private_trainers: 3, multipleStudents: true });
      });

      test('needs as many standby trainers as it books', async () => {
        standby(2);
        await expect(
          classesBookingService.createBooking({ ...base, capacity: 5, private_trainers: 3 })
        ).rejects.toThrow('คุณต้องการ 3');
      });

      test('multipleStudents is derived from the counts, whatever the client says', async () => {
        standby(5);
        await classesBookingService.createBooking({
          ...base, capacity: 2, private_trainers: 2, multiple_students: true
        });
        expect(created().multipleStudents).toBe(false);
      });

      test.each([
        ['more trainers than students', 2, 3],
        ['a trainer with 3 students', 3, 1],
        ['zero trainers', 1, 0],
        ['fractional trainers', 2, 1.5],
        ['trainers sent as a string', 2, '2'],
        ['negative trainers', 1, -1]
      ])('rejects %s', async (_, capacity, private_trainers) => {
        standby(10);
        await expect(
          classesBookingService.createBooking({ ...base, capacity, private_trainers }, admin)
        ).rejects.toMatchObject({ status: 400 });
        expect(ClassesBooking.create).not.toHaveBeenCalled();
      });

      test('customers: at most 5 students', async () => {
        standby(10);
        await expect(
          classesBookingService.createBooking({ ...base, capacity: 6, private_trainers: 3 })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('customers: at most 3 trainers', async () => {
        standby(10);
        await expect(
          classesBookingService.createBooking({ ...base, capacity: 4, private_trainers: 4 })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('admins: no 5-student / 3-trainer cap, only the 1:2 rule and the seats', async () => {
        standby(4);
        await classesBookingService.createBooking({ ...base, capacity: 8, private_trainers: 4 }, admin);
        expect(created()).toMatchObject({ capacity: 8, private_trainers: 4 });
      });

      test('an older client without private_trainers still books, taking `capacity` seats', async () => {
        standby(2);
        await expect(
          classesBookingService.createBooking({ ...base, capacity: 3, multiple_students: true })
        ).rejects.toThrow('คุณต้องการ 3');

        standby(3);
        await classesBookingService.createBooking({ ...base, capacity: 3, multiple_students: true });
        expect(created()).toMatchObject({ private_trainers: null, multipleStudents: true });
      });

      test('a group booking can’t carry private_trainers', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);
        standby(10);
        await expect(
          classesBookingService.createBooking({ ...base, is_private: false, capacity: 2, private_trainers: 1 })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('a group booking stores private_trainers as null and multipleStudents false', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);
        standby(10);
        await classesBookingService.createBooking({
          ...base, is_private: false, capacity: 4, multiple_students: true
        });
        expect(created()).toMatchObject({ private_trainers: null, multipleStudents: false });
      });
    });

    describe('updateBooking', () => {
      const mockBooking = (fields) => ({
        id: 5,
        classes_schedule_id: 1,
        date_booking: '2026-12-01',
        private_trainers: null,
        update: jest.fn().mockImplementation(async (data) => ({ id: 5, ...data })),
        ...fields
      });

      test('legacy booking (4 students, no trainers → 4 seats) edited to 4 students / 2 trainers frees 2 seats, no check', async () => {
        const booking = mockBooking({ capacity: 4 });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        standby(0);

        await classesBookingService.updateBooking(5, { ...base, capacity: 4, private_trainers: 2 });

        expect(getScheduleRealtimeAvailability).not.toHaveBeenCalled();
        expect(booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ private_trainers: 2, multipleStudents: true }),
          expect.any(Object)
        );
      });

      test('more students with the same trainers needs no seat check (seats unchanged)', async () => {
        const booking = mockBooking({ capacity: 2, private_trainers: 2 });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        standby(0);

        await classesBookingService.updateBooking(5, { ...base, capacity: 4, private_trainers: 2 });
        expect(getScheduleRealtimeAvailability).not.toHaveBeenCalled();
      });

      test('adding a trainer is checked, with its own trainers counted as free', async () => {
        const booking = mockBooking({ capacity: 2, private_trainers: 1 });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        // class of 3: ours 1 + others 2 → only 1 free for us → 2 trainers fits, 3 doesn't
        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 3, currentBookingCount: 3, isCloseGym: false, isClassClosed: false
        });

        await expect(
          classesBookingService.updateBooking(5, { ...base, capacity: 3, private_trainers: 3 }, admin)
        ).rejects.toThrow('ที่นั่งไม่พอ');

        getScheduleRealtimeAvailability.mockResolvedValue({
          maxCapacity: 3, currentBookingCount: 2, isCloseGym: false, isClassClosed: false
        });
        await classesBookingService.updateBooking(5, { ...base, capacity: 2, private_trainers: 2 });
        expect(booking.update).toHaveBeenCalled();
      });

      test('an older client (no private_trainers) keeps the stored trainer count', async () => {
        const booking = mockBooking({ capacity: 4, private_trainers: 2 });
        ClassesBooking.findByPk.mockResolvedValue(booking);

        await classesBookingService.updateBooking(5, { ...base, capacity: 3, client_phone: '0800000000' });

        expect(booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ capacity: 3, private_trainers: 2 }),
          expect.any(Object)
        );
      });

      test('an older client: stored count no longer fits the new students → falls back to capacity seats', async () => {
        const booking = mockBooking({ capacity: 2, private_trainers: 2 });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        standby(5);

        await classesBookingService.updateBooking(5, { ...base, capacity: 1 });

        expect(booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ capacity: 1, private_trainers: null }),
          expect.any(Object)
        );
      });

      test('moving a private booking to a group class drops private_trainers', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);
        const booking = mockBooking({ capacity: 2, private_trainers: 1 });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        standby(10);

        await classesBookingService.updateBooking(5, { ...base, is_private: false, capacity: 2 });

        expect(booking.update).toHaveBeenCalledWith(
          expect.objectContaining({ private_trainers: null, multipleStudents: false }),
          expect.any(Object)
        );
      });
    });
  });

  describe('switching class type on update (group ⇄ private)', () => {
    const PRIVATE_ID = 'sched-private';
    const GROUP_ID = 'sched-group';
    const privateSchedule = { id: PRIVATE_ID, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: true };
    const groupSchedule = { id: GROUP_ID, gyms_id: 1, gym_enum: 'STING_CLUB', is_private_class: false };
    const base = {
      client_name: 'Test Customer',
      client_email: 'test@example.com',
      date_booking: '2026-12-01'
    };
    const admin = { id: 1, name: 'Admin', role: 'ADMIN' };
    const free = (n) =>
      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10, currentBookingCount: 10 - n, isCloseGym: false, isClassClosed: false
      });
    const mockBooking = (fields) => ({
      id: 5,
      date_booking: '2026-12-01',
      private_trainers: null,
      update: jest.fn().mockImplementation(async (data) => ({ id: 5, ...data })),
      ...fields
    });
    const saved = (booking) => booking.update.mock.calls[0]?.[0];

    beforeEach(() => {
      getSchedulesById.mockImplementation(async (id) => (id === PRIVATE_ID ? privateSchedule : groupSchedule));
    });

    describe('group → private', () => {
      test('4 students moving to private with 2 trainers needs 2 standby trainers, not 4 seats', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 4, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(2);

        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 4, private_trainers: 2
        });

        expect(getScheduleRealtimeAvailability).toHaveBeenCalledWith(PRIVATE_ID, expect.anything(), expect.anything());
        expect(saved(booking)).toMatchObject({
          classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 4, private_trainers: 2, multipleStudents: true
        });
      });

      test('its group seats are not counted as free in the private class (different class)', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 4, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(1);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 4, private_trainers: 2
          })
        ).rejects.toThrow('คุณต้องการ 2');
        expect(booking.update).not.toHaveBeenCalled();
      });

      test('a customer can’t bring a 6-person group into a private class', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 6, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(10);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 6, private_trainers: 3
          })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('an admin can (6 students / 3 trainers)', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 6, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(3);

        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 6, private_trainers: 3
        }, admin);
        expect(saved(booking)).toMatchObject({ capacity: 6, private_trainers: 3 });
      });

      test('an older client (no private_trainers) moving to private takes `capacity` seats', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 3, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(2);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 3
          })
        ).rejects.toThrow('คุณต้องการ 3');
      });

      test('says private but keeps the group class → rejected (class type comes from the schedule)', async () => {
        const booking = mockBooking({ classes_schedule_id: GROUP_ID, capacity: 2, is_private: false });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(10);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: GROUP_ID, is_private: true, capacity: 2, private_trainers: 1
          })
        ).rejects.toMatchObject({ status: 400 });
        expect(booking.update).not.toHaveBeenCalled();
      });
    });

    describe('private → group', () => {
      test('5 students / 2 trainers moving to group needs 5 seats there, not 2', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 5, private_trainers: 2, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(4);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 5
          })
        ).rejects.toThrow('คุณต้องการ 5');
      });

      test('fits → saved as a plain group booking (no trainers, no multipleStudents)', async () => {
        const booking = mockBooking({
          classes_schedule_id: PRIVATE_ID, capacity: 3, private_trainers: 2, is_private: true,
          multipleStudents: true, trainer: 'Kru Cha'
        });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(5);

        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 3, trainer: null
        });

        expect(saved(booking)).toMatchObject({
          is_private: false, capacity: 3, private_trainers: null, multipleStudents: false, trainer: ''
        });
      });

      test('still sending the trainer names → rejected', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 2, private_trainers: 1, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(5);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 2, trainer: 'Kru Cha'
          })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('still sending private_trainers → rejected', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 2, private_trainers: 1, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(5);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 2, private_trainers: 1
          })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('an older client (no private_trainers key) moving to group is fine — the stored count is dropped', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 2, private_trainers: 2, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(5);

        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 2
        });

        expect(saved(booking)).toMatchObject({ private_trainers: null, multipleStudents: false });
      });

      test('says group but keeps the private class → rejected', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 2, private_trainers: 1, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);
        free(5);

        await expect(
          classesBookingService.updateBooking(5, {
            ...base, classes_schedule_id: PRIVATE_ID, is_private: false, capacity: 2
          })
        ).rejects.toMatchObject({ status: 400 });
        expect(booking.update).not.toHaveBeenCalled();
      });
    });

    describe('edge cases', () => {
      test('private_trainers: 0 on a group booking is not "empty" → rejected', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);
        free(10);
        await expect(
          classesBookingService.createBooking({
            ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 2, private_trainers: 0
          })
        ).rejects.toMatchObject({ status: 400 });
      });

      test('private_trainers: null on a group booking is fine', async () => {
        getSchedulesById.mockResolvedValue(groupSchedule);
        ClassesBooking.create.mockResolvedValue({ id: 1 });
        free(10);
        await classesBookingService.createBooking({
          ...base, classes_schedule_id: GROUP_ID, is_private: false, capacity: 2, private_trainers: null
        });
        expect(ClassesBooking.create.mock.calls[0][0].private_trainers).toBeNull();
      });

      test('1 student / 1 trainer → 1 seat, not multiple students', async () => {
        ClassesBooking.create.mockResolvedValue({ id: 1 });
        free(1);
        await classesBookingService.createBooking({
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 1, private_trainers: 1
        });
        expect(ClassesBooking.create.mock.calls[0][0]).toMatchObject({ private_trainers: 1, multipleStudents: false });
      });

      test('exactly 2 students per trainer at the customer max (5 / 3) is allowed', async () => {
        ClassesBooking.create.mockResolvedValue({ id: 1 });
        free(3);
        await classesBookingService.createBooking({
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 5, private_trainers: 3
        });
        expect(ClassesBooking.create).toHaveBeenCalled();
      });

      test('the same private booking edited twice in a row keeps its seat math (no drift)', async () => {
        const booking = mockBooking({ classes_schedule_id: PRIVATE_ID, capacity: 4, private_trainers: 2, is_private: true });
        ClassesBooking.findByPk.mockResolvedValue(booking);

        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 4, private_trainers: 2
        });
        await classesBookingService.updateBooking(5, {
          ...base, classes_schedule_id: PRIVATE_ID, is_private: true, capacity: 3, private_trainers: 2
        });

        expect(getScheduleRealtimeAvailability).not.toHaveBeenCalled();
        expect(booking.update).toHaveBeenCalledTimes(2);
      });
    });
  });

  describe('updateBookingStatus – restoring a canceled booking re-takes its seats', () => {
    const canceled = (fields) => ({
      id: 9,
      booking_status: 'CANCELED',
      classes_schedule_id: 'sched-private',
      date_booking: '2026-12-01',
      private_trainers: null,
      update: jest.fn().mockResolvedValue({ id: 9 }),
      ...fields
    });
    const free = (n) =>
      getScheduleRealtimeAvailability.mockResolvedValue({
        maxCapacity: 10, currentBookingCount: 10 - n, isCloseGym: false, isClassClosed: false
      });

    test('private 5 students / 2 trainers needs 2 standby trainers', async () => {
      ClassesBooking.findByPk.mockResolvedValue(canceled({ capacity: 5, private_trainers: 2 }));
      free(2);
      await classesBookingService.updateBookingStatus(9, 'SUCCEED', { name: 'Admin' });

      free(1);
      ClassesBooking.findByPk.mockResolvedValue(canceled({ capacity: 5, private_trainers: 2 }));
      await expect(
        classesBookingService.updateBookingStatus(9, 'SUCCEED', { name: 'Admin' })
      ).rejects.toThrow('คุณต้องการ 2');
    });

    test('old private booking without a trainer count needs its students as seats', async () => {
      ClassesBooking.findByPk.mockResolvedValue(canceled({ capacity: 3 }));
      free(2);
      await expect(
        classesBookingService.updateBookingStatus(9, 'SUCCEED', { name: 'Admin' })
      ).rejects.toThrow('คุณต้องการ 3');
    });
  });

  describe('updateBookingTrainer – several trainers on one booking', () => {
    const booking = (fields) => ({
      id: 7,
      is_private: true,
      capacity: 4,
      private_trainers: 2,
      trainer: 'Kru Cha',
      client_name: 'Somchai',
      update: jest.fn().mockResolvedValue({}),
      ...fields
    });
    const savedTrainer = (b) => b.update.mock.calls[0][0].trainer;

    test('saves two trainers on a 2-trainer booking', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await classesBookingService.updateBookingTrainer(7, 'Kru Cha, Kru Bank');
      expect(savedTrainer(b)).toBe('Kru Cha, Kru Bank');
    });

    test('normalizes spacing and stray commas', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await classesBookingService.updateBookingTrainer(7, ' Kru Cha ,,Kru Bank , ');
      expect(savedTrainer(b)).toBe('Kru Cha, Kru Bank');
    });

    test('more names than trainers booked → rejected', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await expect(
        classesBookingService.updateBookingTrainer(7, 'A, B, C')
      ).rejects.toMatchObject({ status: 400 });
      expect(b.update).not.toHaveBeenCalled();
    });

    test('the same trainer twice → rejected', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await expect(
        classesBookingService.updateBookingTrainer(7, 'Kru Cha, Kru Cha')
      ).rejects.toMatchObject({ status: 400 });
    });

    test('older booking without a trainer count: up to one per student', async () => {
      const b = booking({ capacity: 3, private_trainers: null });
      ClassesBooking.findByPk.mockResolvedValue(b);
      await classesBookingService.updateBookingTrainer(7, 'A, B, C');
      expect(savedTrainer(b)).toBe('A, B, C');

      const b2 = booking({ capacity: 3, private_trainers: null });
      ClassesBooking.findByPk.mockResolvedValue(b2);
      await expect(
        classesBookingService.updateBookingTrainer(7, 'A, B, C, D')
      ).rejects.toMatchObject({ status: 400 });
    });

    test('clearing all trainers saves an empty field', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await classesBookingService.updateBookingTrainer(7, '');
      expect(savedTrainer(b)).toBe('');
    });

    test('a group booking still can’t get a trainer', async () => {
      const b = booking({ is_private: false, private_trainers: null });
      ClassesBooking.findByPk.mockResolvedValue(b);
      await expect(
        classesBookingService.updateBookingTrainer(7, 'Kru Cha')
      ).rejects.toMatchObject({ status: 400 });
    });

    test('the activity log records the normalized names', async () => {
      const b = booking();
      ClassesBooking.findByPk.mockResolvedValue(b);
      await classesBookingService.updateBookingTrainer(7, 'Kru Cha ,Kru Bank');
      expect(activityLogService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'UPDATE_TRAINER',
          details: expect.objectContaining({ old_trainer: 'Kru Cha', new_trainer: 'Kru Cha, Kru Bank' })
        })
      );
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
