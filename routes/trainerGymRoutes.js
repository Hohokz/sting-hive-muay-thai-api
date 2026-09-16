const express = require("express");
const router = express.Router();
const trainerGymController = require("../controllers/trainerGymController");
const { authenticateToken, authorizeRole } = require("../middlewares/authMiddleware");

// Public: id/name only (no email/phone) — used by the customer booking
// flow's private-class trainer picker (new booking + self-service edit,
// neither of which requires login). Registered before the auth gate below
// so this one route stays reachable without a token.
router.get("/public/:gymId", trainerGymController.getPublicTrainersByGym);

// Everything else here is trainer-gym *management* — admin-only (matches
// the frontend's /admin/trainers route, which is gated adminOnly: true).
router.use(authenticateToken);
router.use(authorizeRole(["ADMIN"]));

// Returns all users eligible to be a trainer (role USER)
router.get("/available-users", trainerGymController.getAvailableUsersForTrainer);

// Returns the trainers assigned to a gym
router.get("/:gymId", trainerGymController.getTrainersByGym);

// Assigns a trainer to a gym
router.post("/assign", trainerGymController.assignTrainerToGym);

// Unassigns a trainer from a gym (POST instead of DELETE to simplify sending a body)
router.post("/remove", trainerGymController.removeTrainerFromGym);

module.exports = router;
