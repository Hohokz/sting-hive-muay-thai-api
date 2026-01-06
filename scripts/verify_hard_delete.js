const userService = require("../services/userService");
const User = require("../models/User");

async function testHardDeleteUser() {
  console.log("Starting User Hard Deletion Verification Test...");

  const testUserData = {
    username: "testharddelete_" + Date.now(),
    password: "password123",
    name: "Test Hard Delete User",
    email: "testhard_" + Date.now() + "@example.com",
    role: "USER",
  };

  try {
    // 1. Create a test user
    console.log("Creating test user...");
    const newUser = await userService.createUser(testUserData, "admin_tester");
    console.log(`Test user created with ID: ${newUser.id}`);

    // 2. Call deleteUser (hard delete)
    console.log("Calling deleteUser...");
    await userService.deleteUser(newUser.id, "admin_tester");

    // 3. Verify user is gone
    const deletedUser = await User.findByPk(newUser.id);
    if (!deletedUser) {
      console.log(
        "✅ SUCCESS: User was permanently deleted from the database."
      );
    } else {
      console.error("❌ FAILURE: User still exists in the database.");
    }
  } catch (error) {
    console.error("❌ TEST FAILED:", error);
  } finally {
    process.exit();
  }
}

testHardDeleteUser();
