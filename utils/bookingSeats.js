const { fn, col } = require("sequelize");
const { ClassesBooking } = require("../models/Associations");

/**
 * Seats a booking takes in its class.
 *  - Group: one per student (`capacity`).
 *  - Private: one per trainer (`private_trainers`) — a private class's seats
 *    are its standby trainers, not students.
 *  - Private bookings made before private_trainers existed (NULL) keep using
 *    `capacity`, so past private classes stay as full as they were.
 */
const bookingSeats = ({ capacity, private_trainers }) =>
  private_trainers ?? capacity;

// Same rule in SQL. Qualified by the model alias so it stays unambiguous when
// the query joins the schedule.
const SEATS_SQL = fn(
  "COALESCE",
  col("CLASSES_BOOKING.private_trainers"),
  col("CLASSES_BOOKING.capacity"),
);

/** Total seats taken by the bookings matching `where` */
const sumBookingSeats = async (where, { transaction, include } = {}) => {
  const row = await ClassesBooking.findOne({
    attributes: [[fn("SUM", SEATS_SQL), "seats"]],
    where,
    include,
    transaction,
    raw: true,
    subQuery: false,
  });
  return Number(row?.seats) || 0;
};

module.exports = { bookingSeats, sumBookingSeats };
