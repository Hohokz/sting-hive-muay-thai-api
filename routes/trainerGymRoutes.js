const express = require("express");
const router = express.Router();
const trainerGymController = require("../controllers/trainerGymController");
const { authenticateToken, authorizeRole } = require("../middlewares/authMiddleware");

// Trainer-gym management is admin-only (matches the frontend's
// /admin/trainers route, which is gated adminOnly: true).
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
