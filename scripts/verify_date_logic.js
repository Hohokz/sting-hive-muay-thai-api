const date_booking_past = "2026-01-05"; // Yesterday
const date_booking_today = "2026-01-06"; // Today
const date_booking_future = "2026-01-07"; // Tomorrow

function checkDate(date_booking) {
  const today = new Date("2026-01-06T17:26:24"); // Mocking current time from user info
  today.setHours(0, 0, 0, 0);

  const bookingDateObj = new Date(date_booking);
  bookingDateObj.setHours(0, 0, 0, 0);

  console.log(`Checking date: ${date_booking}`);
  console.log(`- today (start of day): ${today.toISOString()}`);
  console.log(`- bookingDateObj: ${bookingDateObj.toISOString()}`);

  if (bookingDateObj < today) {
    console.log("Result: ERROR - Cannot book for a past date.");
    return true;
  } else {
    console.log("Result: SUCCESS - Date is valid (today or future).");
    return false;
  }
}

console.log("--- Testing Past Date ---");
checkDate(date_booking_past);

console.log("\n--- Testing Today ---");
checkDate(date_booking_today);

console.log("\n--- Testing Future Date ---");
checkDate(date_booking_future);
