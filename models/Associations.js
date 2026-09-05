// This file is expected to be required after all models are defined.
const { sequelize } = require('../config/db');

// -----------------------------------------------------------
// 1. IMPORT all models (make sure every model is imported correctly)
// -----------------------------------------------------------
const User = require('./User');
const Gyms = require('./Gyms');
const ClassesSchedule = require('./ClassesSchedule');
const ClassesCapacity = require('./ClassesCapacity')(sequelize);
const ClassesBooking = require('./ClassesBooking');
const ClassesBookingInAdvance = require('./ClassesBookingInAdvance');
const Payment = require('./Payment');
const ActivityLog = require('./ActivityLog');
const TrainerGyms = require('./TrainerGyms');



// -----------------------------------------------------------
// 2. Define associations
// -----------------------------------------------------------

// A. ClassesSchedule <-> ClassesCapacity (One-to-One)
// One schedule has one capacity record
ClassesSchedule.hasOne(ClassesCapacity, {
    foreignKey: 'classes_id',
    as: 'capacity_data',
    onDelete: 'CASCADE'
});
ClassesCapacity.belongsTo(ClassesSchedule, {
    foreignKey: 'classes_id',
    as: 'schedule'
});

Gyms.hasMany(ClassesSchedule, {
    foreignKey: 'gyms_id',
    as: 'schedules'
});
ClassesSchedule.belongsTo(Gyms, {
    foreignKey: 'gyms_id',
    as: 'gyms'
});

Gyms.hasMany(ClassesBooking, {
    foreignKey: 'gyms_id',
    as: 'bookings'
});
ClassesBooking.belongsTo(Gyms, {
    foreignKey: 'gyms_id',
    as: 'gyms'
});

// B. ClassesSchedule <-> ClassesBooking (One-to-Many)
// One schedule can have many bookings
ClassesSchedule.hasMany(ClassesBooking, {
    foreignKey: 'classes_schedule_id',
    as: 'bookings'
});
ClassesBooking.belongsTo(ClassesSchedule, {
    foreignKey: 'classes_schedule_id',
    as: 'schedule'
});

// C. ClassesSchedule <-> ClassesBookingInAdvance (One-to-Many)
// One schedule can have many advance-booking configs
ClassesSchedule.hasMany(ClassesBookingInAdvance, {
    foreignKey: 'classes_schedule_id',
    as: 'bookings_in_advance'
});
ClassesBookingInAdvance.belongsTo(ClassesSchedule, {
    foreignKey: 'classes_schedule_id',
    as: 'schedule'
});

// D. ClassesBooking <-> Payment (One-to-One)
// One booking is tied to one payment record
ClassesBooking.hasOne(Payment, {
    foreignKey: 'booking_id',
    as: 'payment_detail',
    onDelete: 'CASCADE'
});
Payment.belongsTo(ClassesBooking, {
    foreignKey: 'booking_id',
    as: 'booking'
});


// E. User <-> ClassesBooking (One-to-Many)
// Not wired up: ClassesBooking has no user_id column today, so a customer's
// bookings can't be joined back to a User row. Would need a migration to add
// the FK before this association could be enabled.
// User.hasMany(ClassesBooking, { foreignKey: 'user_id', as: 'user_bookings' });
// ClassesBooking.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// F. User <-> ActivityLog (One-to-Many)
User.hasMany(ActivityLog, {
    foreignKey: 'user_id',
    as: 'activity_logs'
});
ActivityLog.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

// G. User <-> Gyms (Many-to-Many via TrainerGyms)
User.belongsToMany(Gyms, {
    through: TrainerGyms,
    foreignKey: 'user_id',
    otherKey: 'gyms_id',
    as: 'gyms'
});

Gyms.belongsToMany(User, {
    through: TrainerGyms,
    foreignKey: 'gyms_id',
    otherKey: 'user_id',
    as: 'trainers'
});

TrainerGyms.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
TrainerGyms.belongsTo(Gyms, { foreignKey: 'gyms_id', as: 'gym' });



// -----------------------------------------------------------
// 3. EXPORT all models
// -----------------------------------------------------------

module.exports = {
    User,
    Gyms,
    ClassesSchedule,
    ClassesCapacity,
    ClassesBooking,
    ClassesBookingInAdvance,
    Payment,
    ActivityLog,
    TrainerGyms,
};
