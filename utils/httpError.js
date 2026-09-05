/**
 * Shared error-response helper for controllers.
 *
 * If `error.status` was set deliberately (a business error thrown on purpose,
 * e.g. "booking not found" -> 404), respond with that status and the error's
 * own message — it's safe to show to the client.
 * Otherwise this is an unexpected/internal error: log it server-side and
 * respond 500 with a generic fallback message instead of leaking internals.
 */
const sendError = (res, error, fallbackMessage) => {
  if (error?.status) {
    return res.status(error.status).json({
      success: false,
      message: error.message || fallbackMessage,
    });
  }

  console.error(fallbackMessage, error);
  return res.status(500).json({
    success: false,
    message: fallbackMessage,
  });
};

module.exports = { sendError };
