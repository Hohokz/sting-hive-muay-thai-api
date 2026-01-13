const express = require("express");
const router = express.Router();
const trainerGymController = require("../controllers/trainerGymController");
// const { authenticateToken, isAdmin } = require("../middlewares/authMiddleware"); // สมมติว่ามี middleware นี้

// ✅ ดึงรายชื่อ User ทั้งหมดที่มีสิทธิ์เป็นเทรนเนอร์ (Role USER)
router.get("/available-users", trainerGymController.getAvailableUsersForTrainer);

// ✅ ดึงรายชื่อเทรนเนอร์ในแต่ละยิม
router.get("/:gymId", trainerGymController.getTrainersByGym);

// ✅ มอบหมายเทรนเนอร์เข้ายิม
router.post("/assign", trainerGymController.assignTrainerToGym);

// ✅ ถอดถอนเทรนเนอร์ออกจากยิม
router.post("/remove", trainerGymController.removeTrainerFromGym); // ใช้ POST แทน DELETE เพื่อความสะดวกในการส่ง body บางเคส

module.exports = router;
