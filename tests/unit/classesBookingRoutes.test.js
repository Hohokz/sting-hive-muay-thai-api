jest.mock("../../services/classesBookingService");

const router = require("../../routes/classesBookingRoutes");
const { authenticateToken } = require("../../middlewares/authMiddleware");
const bookingController = require("../../controllers/classesBookingController");
const classesBookingService = require("../../services/classesBookingService");

const handlersFor = (method, path) => {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method],
  );
  if (!layer) throw new Error(`No route ${method.toUpperCase()} ${path}`);
  return layer.route.stack.map((s) => s.handle);
};

const mockRes = () => {
  const res = {};
  res.status = jest.fn(() => res);
  res.json = jest.fn(() => res);
  return res;
};

describe("booking routes auth", () => {
  test.each([
    ["get", "/trainers"],
    ["get", "/:name"],
    ["put", "/updateBookingTrainer/:id"],
    ["put", "/updateBookingNote/:id"],
    ["patch", "/:id/note"],
    ["get", "/:id/payment"],
    ["put", "/:id/payment"],
    ["put", "/payment-entry/:entryId"],
    ["delete", "/payment-entry/:entryId"],
  ])("%s %s requires a token", (method, path) => {
    expect(handlersFor(method, path)).toContain(authenticateToken);
  });

  test.each([
    ["get", "/"],
    ["post", "/"],
    ["put", "/:id"],
    ["patch", "/:id/cancel"],
  ])("%s %s stays public for customers", (method, path) => {
    expect(handlersFor(method, path)).not.toContain(authenticateToken);
  });
});

describe("getBookings anonymous filter", () => {
  beforeEach(() => {
    classesBookingService.getBookings.mockResolvedValue([]);
  });

  test("rejects an anonymous unfiltered listing with 400", async () => {
    const res = mockRes();
    await bookingController.getBookings({ query: {} }, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(classesBookingService.getBookings).not.toHaveBeenCalled();
  });

  test.each([
    [{ classes_booking_id: "abc" }],
    [{ client_email: "a@b.com" }],
  ])("allows an anonymous lookup by %o", async (query) => {
    const res = mockRes();
    await bookingController.getBookings({ query }, res);

    expect(res.status).toHaveBeenCalledWith(200);
  });

  test("allows staff to list without filters", async () => {
    const res = mockRes();
    await bookingController.getBookings(
      { query: {}, user: { role: "ADMIN" } },
      res,
    );

    expect(res.status).toHaveBeenCalledWith(200);
  });
});
