const classesScheduleService = require("../../services/classesScheduleService");
const {
  ClassesSchedule,
  ClassesBookingInAdvance,
} = require("../../models/Associations");
const { sumBookingSeatsBySchedule } = require("../../utils/bookingSeats");

jest.mock("../../utils/bookingSeats", () => ({
  sumBookingSeats: jest.fn(),
  sumBookingSeatsBySchedule: jest.fn(),
  bookingSeats: jest.fn(),
}));

jest.mock("../../models/Associations", () => ({
  ClassesSchedule: { findAll: jest.fn() },
  ClassesCapacity: {},
  ClassesBooking: {},
  ClassesBookingInAdvance: { findAll: jest.fn() },
}));

jest.mock("../../services/activityLogService", () => ({ createLog: jest.fn() }));
jest.mock("../../utils/cacheUtility", () => ({
  get: jest.fn(),
  set: jest.fn(),
  clearByPrefix: jest.fn(),
}));

const schedule = (id, gyms_id, capacity) => ({
  id,
  gyms_id,
  gym_enum: gyms_id === 1 ? "STING_CLUB" : "STING_HIVE",
  start_time: "09:00",
  end_time: "10:00",
  capacity_data: { id: `cap-${id}`, capacity },
});

// The two ClassesBookingInAdvance.findAll calls run in a fixed order:
// gym-wide closures first, then per-schedule configs.
const mockInAdvance = ({ gymClosures = [], configs = [] }) => {
  ClassesBookingInAdvance.findAll
    .mockResolvedValueOnce(gymClosures)
    .mockResolvedValueOnce(configs);
};

describe("getAvailableSchedulesByBookingDate (batched)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    sumBookingSeatsBySchedule.mockResolvedValue(new Map());
  });

  test("uses standard capacity minus booked seats", async () => {
    ClassesSchedule.findAll.mockResolvedValue([schedule("s1", 1, 10)]);
    mockInAdvance({});
    sumBookingSeatsBySchedule.mockResolvedValue(new Map([["s1", 4]]));

    const [s1] = await classesScheduleService.getAvailableSchedulesByBookingDate(
      "2026-11-06",
      "STING_CLUB",
      false,
    );

    expect(s1).toMatchObject({
      capacity_data: { id: "cap-s1", capacity: 10 },
      booking_count: 4,
      available_seats: 6,
      is_full: false,
      is_closed: false,
    });
  });

  test("hides schedules of a gym closed that day", async () => {
    ClassesSchedule.findAll.mockResolvedValue([
      schedule("s1", 1, 10),
      schedule("s2", 2, 10),
    ]);
    mockInAdvance({ gymClosures: [{ gyms_id: 1 }] });

    const result = await classesScheduleService.getAvailableSchedulesByBookingDate(
      "2026-11-06",
    );

    expect(result.map((s) => s.id)).toEqual(["s2"]);
  });

  test("a class-level closure shows as closed and full", async () => {
    ClassesSchedule.findAll.mockResolvedValue([schedule("s1", 1, 10)]);
    mockInAdvance({
      configs: [{ classes_schedule_id: "s1", is_close_gym: true, capacity: 5 }],
    });
    sumBookingSeatsBySchedule.mockResolvedValue(new Map([["s1", 3]]));

    const [s1] = await classesScheduleService.getAvailableSchedulesByBookingDate(
      "2026-11-06",
    );

    expect(s1).toMatchObject({
      capacity_data: { capacity: 0 },
      booking_count: 0,
      available_seats: 0,
      is_full: true,
      is_closed: true,
    });
  });

  test("the newest advance config overrides standard capacity", async () => {
    ClassesSchedule.findAll.mockResolvedValue([schedule("s1", 1, 10)]);
    // Already sorted newest-first by the query
    mockInAdvance({
      configs: [
        { classes_schedule_id: "s1", is_close_gym: false, capacity: 3 },
        { classes_schedule_id: "s1", is_close_gym: false, capacity: 20 },
      ],
    });
    sumBookingSeatsBySchedule.mockResolvedValue(new Map([["s1", 3]]));

    const [s1] = await classesScheduleService.getAvailableSchedulesByBookingDate(
      "2026-11-06",
    );

    expect(s1).toMatchObject({
      capacity_data: { capacity: 3 },
      available_seats: 0,
      is_full: true,
      is_closed: false,
    });
  });

  test("makes no further queries when there are no schedules", async () => {
    ClassesSchedule.findAll.mockResolvedValue([]);

    const result = await classesScheduleService.getAvailableSchedulesByBookingDate(
      "2026-11-06",
    );

    expect(result).toEqual([]);
    expect(ClassesBookingInAdvance.findAll).not.toHaveBeenCalled();
  });
});
