const express = require("express");
const router = express.Router();
const userController = require("../controllers/userController");
const {
  authenticateToken,
  authorizeRole,
} = require("../middlewares/authMiddleware");

// All routes require authentication and ADMIN role
router.use(authenticateToken);
router.use(authorizeRole(["ADMIN", "USER"]));

// CRUD Routes
router.get("/", userController.getUsers);
router.get("/justUsers", userController.getAllJustUsers);
router.get("/:id", userController.getUser);
router.post("/", userController.createUser);
router.put("/:id", userController.updateUser);
router.delete("/:id", userController.deleteUser);

module.exports = router;
