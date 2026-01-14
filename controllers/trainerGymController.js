const trainerGymService = require("../services/trainerGymService");

const getTrainersByGym = async (req, res) => {
  try {
    const { gymId } = req.params;
    const { date, classes_schedule_id } = req.query;
    const trainers = await trainerGymService.getTrainersByGym(gymId, { date, classes_schedule_id });
    res.status(200).json({ success: true, data: trainers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAvailableUsersForTrainer = async (req, res) => {
  try {
    const users = await trainerGymService.getAvailableUsersForTrainer();
    res.status(200).json({ success: true, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const assignTrainerToGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.assignTrainerToGym(userId, gymId, req.user);
    res.status(201).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const removeTrainerFromGym = async (req, res) => {
  try {
    const { userId, gymId } = req.body;
    const result = await trainerGymService.removeTrainerFromGym(userId, gymId, req.user);
    res.status(200).json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getTrainersByGym,
  getAvailableUsersForTrainer,
  assignTrainerToGym,
  removeTrainerFromGym,
};
