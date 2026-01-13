const trainerGymService = require("./services/trainerGymService");
const { sequelize } = require("./config/db");

async function test() {
  try {
    console.log("--- 1. Testing Available Users (Role USER) ---");
    const users = await trainerGymService.getAvailableUsersForTrainer();
    console.log("Available Users Count:", users.length);
    
    if (users.length === 0) {
      console.log("No users with role USER found. Please create one for full testing.");
      process.exit(0);
    }

    const testUserId = users[0].id;
    const testGymId = 1; // STING CLUB

    console.log(`--- 2. Assigning User ${testUserId} (${users[0].name}) to Gym ${testGymId} ---`);
    try {
      const result = await trainerGymService.assignTrainerToGym(testUserId, testGymId);
      console.log("Assign Success:", JSON.stringify(result, null, 2));
    } catch (e) {
      console.log("Assign Note (Maybe already assigned?):", e.message);
    }

    console.log(`--- 3. Fetching Trainers for Gym ${testGymId} ---`);
    const trainers = await trainerGymService.getTrainersByGym(testGymId);
    console.log(`Trainers in Gym ${testGymId}:`, trainers.map(u => u.name));

    console.log(`--- 4. Removing User ${testUserId} from Gym ${testGymId} ---`);
    const removeResult = await trainerGymService.removeTrainerFromGym(testUserId, testGymId);
    console.log("Remove Success:", removeResult);

    console.log("--- Verification Complete ---");
    process.exit(0);
  } catch (error) {
    console.error("Test Failed:", error.message);
    process.exit(1);
  }
}

test();
