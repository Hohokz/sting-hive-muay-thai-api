// สมมติว่าไฟล์นี้จะถูกเรียกใช้หลังจากการกำหนดโมเดลทั้งหมด
const { sequelize } = require('../config/db'); 

// -----------------------------------------------------------
// 1. IMPORT โมเดลทั้งหมด (ต้องแน่ใจว่าได้ Import โมเดลอย่างถูกต้อง)
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
// 2. กำหนดความสัมพันธ์ (Define Associations)
// -----------------------------------------------------------

// A. ClassesSchedule <-> ClassesCapacity (One-to-One)
// Schedule หนึ่งรายการ มี Capacity หนึ่งรายการ
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
// Schedule หนึ่งรายการ สามารถมีการจองหลายรายการ
ClassesSchedule.hasMany(ClassesBooking, {
    foreignKey: 'classes_schedule_id',
    as: 'bookings'
});
ClassesBooking.belongsTo(ClassesSchedule, {
    foreignKey: 'classes_schedule_id',
    as: 'schedule'
});

// B. ClassesSchedule <-> ClassesBookingInAdvance (One-to-Many)
// Schedule หนึ่งรายการ สามารถมีการจองหลายรายการ
ClassesSchedule.hasMany(ClassesBookingInAdvance, {
    foreignKey: 'classes_schedule_id',
    as: 'bookings_in_advance'
});
ClassesBookingInAdvance.belongsTo(ClassesSchedule, {
    foreignKey: 'classes_schedule_id',
    as: 'schedule'
});

// C. ClassesBooking <-> Payment (One-to-One)
// การจองหนึ่งรายการ ผูกกับการชำระเงินหนึ่งรายการ
ClassesBooking.hasOne(Payment, { 
    foreignKey: 'booking_id', 
    as: 'payment_detail', 
    onDelete: 'CASCADE' 
});
Payment.belongsTo(ClassesBooking, { 
    foreignKey: 'booking_id', 
    as: 'booking' 
});


// D. User <-> ClassesBooking (One-to-Many)
// User (ลูกค้า) หนึ่งคน สามารถจองได้หลายรายการ (ถ้าคุณมีคอลัมน์ user_id ใน ClassesBooking)
// สมมติว่า ClassesBooking มีคอลัมน์ 'user_id'
// User.hasMany(ClassesBooking, { foreignKey: 'user_id', as: 'user_bookings' });
// ClassesBooking.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// E. User <-> ActivityLog (One-to-Many)
User.hasMany(ActivityLog, {
    foreignKey: 'user_id',
    as: 'activity_logs'
});
ActivityLog.belongsTo(User, {
    foreignKey: 'user_id',
    as: 'user'
});

// F. User <-> Gyms (Many-to-Many via TrainerGyms)
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
// 3. EXPORT โมเดลทั้งหมด
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