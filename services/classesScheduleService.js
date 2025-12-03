// services/classesScheduleService.js

const { ClassesSchedule, ClassesCapacity, ClassesBooking } = require('../models/Associations'); 
const { Op, Sequelize  } = require('sequelize'); 

// =================================================================
// 1. HELPER / VALIDATION FUNCTIONS
// =================================================================

/**
 * ตรวจสอบความถูกต้องพื้นฐานของช่วงเวลา (Start ก่อน End) และ Capacity
 */
const _validateScheduleInput = (newStartTime, newEndTime, capacity) => {
    // ✅ Validate format HH:mm
    const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

    if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
        const error = new Error("Invalid time format. Use HH:mm (e.g. 09:00, 18:30)");
        error.status = 400;
        throw error;
    }

    // ✅ แปลงเวลาเป็น "นาที" เพื่อเอาไปเปรียบเทียบ
    const [startH, startM] = newStartTime.split(":").map(Number);
    const [endH, endM] = newEndTime.split(":").map(Number);

    const startMinutes = startH * 60 + startM;
    const endMinutes = endH * 60 + endM;

    // ✅ เช็กว่า end ต้องมากกว่า start
    if (endMinutes <= startMinutes) {
        const error = new Error(
            "Invalid time range: End time must be strictly after start time."
        );
        error.status = 400;
        throw error;
    }

    // ✅ Validate capacity
    if (capacity !== undefined && (typeof capacity !== 'number' || capacity <= 0)) {
        const error = new Error("Capacity must be a positive number.");
        error.status = 400;
        throw error;
    }
};


/**
 * ตรวจสอบว่าช่วงเวลาใหม่ทับซ้อนกับ Schedule ที่มีอยู่หรือไม่
 * ตรรกะการทับซ้อน: (Start1 < End2) AND (End1 > Start2)
 */
const _checkOverlapByGym = async (newStartTime,newEndTime,gymEnum,excludeId = null) => {
  // ✅ Validate format HH:mm
  const timeRegex = /^([01]\d|2[0-3]):([0-5]\d)$/;

  if (!timeRegex.test(newStartTime) || !timeRegex.test(newEndTime)) {
    const error = new Error(
      `Invalid time format: ${newStartTime} - ${newEndTime}`
    );
    error.status = 400;
    throw error;
  }

  const whereCondition = {
    gym_enum: gymEnum, // ✅ เช็คเฉพาะ Gym เดียวกันเท่านั้น
    [Op.and]: [
      // start เดิม < end ใหม่
      { start_time: { [Op.lt]: newEndTime } },

      // end เดิม > start ใหม่
      { end_time: { [Op.gt]: newStartTime } }
    ]
  };

  // ✅ กรณีแก้ไข (exclude ตัวเองออก)
  if (excludeId) {
    whereCondition.id = { [Op.not]: excludeId };
  }

  const existingOverlap = await ClassesSchedule.findOne({
    where: whereCondition
  });

  return existingOverlap; // null = ไม่ชน, object = ชน
};


// =================================================================
// 2. CORE SERVICE FUNCTIONS (CRUD)
// =================================================================

/**
 * [CREATE] สร้างรายการ Schedule ใหม่ พร้อม Capacity
 */
const createSchedule = async (scheduleData) => {
    const { start_time, end_time, gym_enum, description, user, capacity, is_private_class } = scheduleData;
    console.log("Creating schedule with data:", scheduleData);
    _validateScheduleInput(start_time, end_time, capacity);
    
    const existingOverlap = await _checkOverlapByGym(start_time, end_time, gym_enum);

    if (existingOverlap) {
        const error = new Error("Time conflict: A schedule already exists in this time slot.");
        error.status = 409; // Conflict
        throw error;
    }

    // ใช้ Transaction เพื่อให้มั่นใจว่าทั้ง Schedule และ Capacity ถูกสร้างพร้อมกัน
    const transaction = await ClassesSchedule.sequelize.transaction();

    try {
        // 1. สร้าง Schedule Master
        const newSchedule = await ClassesSchedule.create({
            start_time: start_time,
            end_time: end_time,
            gym_enum,
            description,
            is_private_class: is_private_class || false,
            created_by: user || 'API_CALL'
        }, { transaction });

        // 2. สร้าง Capacity ผูกกับ Schedule
        await ClassesCapacity.create({
            classes_id: newSchedule.id,
            capacity: capacity,
            created_by: user || 'API_CALL',
        }, { transaction });
        
        await transaction.commit();
        
        // ดึงข้อมูลพร้อม Capacity กลับไป
        return await ClassesSchedule.findByPk(newSchedule.id, {
            include: [{ model: ClassesCapacity, as: 'capacity_data' }]
        });
        
    } catch (error) {
        await transaction.rollback();
        console.error("[DB Error] Failed to create schedule and capacity:", error); 
        throw new Error("Internal server error during schedule creation.");
    }
};

const getSchedulesById = async (id) => {
  if(!id){
    const error = new Error("Schedule ID is required.");
    error.status = 400;
    throw error;
  }
  const whereCondition = { id };
  return await ClassesSchedule.findOne({
    where: whereCondition,
    include: [{ model: ClassesCapacity, as: 'capacity_data' }]
  });
};

/**
 * [READ] ดึงข้อมูล Schedule ทั้งหมด หรือตามช่วงเวลา พร้อม Capacity
 */
const getSchedules = async (startDate, endDate) => {
    const whereCondition = {};

    if (startDate && endDate) {
        const start = new Date(startDate);
        const end = new Date(endDate);

        if (isNaN(start.getTime()) || isNaN(end.getTime())) {
             const error = new Error("Invalid date format for filtering.");
             error.status = 400;
             throw error;
        }

        // ค้นหา Schedule ที่ start_time หรือ end_time อยู่ในช่วงที่กำหนด
        whereCondition[Op.or] = [
            { start_time: { [Op.between]: [start, end] } },
            { end_time: { [Op.between]: [start, end] } }
        ];
    }
    
    try {
        return await ClassesSchedule.findAll({
            where: whereCondition,
            order: [['start_time', 'ASC']],
            include: [{ model: ClassesCapacity, as: 'capacity_data' }] // ดึง Capacity มาด้วย
        });
    } catch (error) {
        console.error("[DB Error] Failed to retrieve schedules:", error);
        throw new Error("Internal server error during schedule retrieval.");
    }
};

const getAvailableSchedulesByBookingDate = async (date, gymEnum, isPrivateClass) => {
  try {
    const whereSchedule = {};
    if (gymEnum) {
      whereSchedule.gym_enum = gymEnum;
    }
    if (isPrivateClass !== undefined) {
      whereSchedule.is_private_class = isPrivateClass;
    }

    const schedules = await ClassesSchedule.findAll({
      where: whereSchedule,

      include: [
        // ✅ Capacity ของ Schedule (hasOne → ไม่มี separate)
        {
          model: ClassesCapacity,
          as: "capacity_data",
          required: true,
          attributes: ["id", "capacity"]
        },

        // ✅ เอายอดจองจาก ClassesBooking
        {
          model: ClassesBooking,
          as: "bookings",
          required: false,
          attributes: [],
          where: {
            booking_status: "SUCCEED",
            [Op.and]: Sequelize.where(
              Sequelize.fn("DATE", Sequelize.col("bookings.date_booking")),
              date
            )
          }
        }
      ],

      // ✅ เอาเฉพาะฟิลด์ที่ต้องใช้
      attributes: [
        "id",
        "start_time",
        "end_time",
        [
          Sequelize.fn(
            "COALESCE",
            Sequelize.fn("SUM", Sequelize.col("bookings.capacity")),
            0
          ),
          "booking_count"
        ]
      ],

      group: [
        "CLASSES_SCHEDULE.id",
        "capacity_data.id",
        "capacity_data.capacity"
      ],

      // ✅ ถ้า booking รวม >= capacity → ไม่แสดง
      having: Sequelize.literal(
        `COALESCE(SUM("bookings"."capacity"), 0) < "capacity_data"."capacity"`
      ),

      order: [["start_time", "ASC"]]
    });

    return schedules;
  } catch (error) {
    console.error(
      "[SUPABASE DB ERROR] getAvailableSchedulesByBookingDate:",
      error
    );
    throw error;
  }
};




/**
 * [UPDATE] อัปเดตรายการ Schedule ที่มีอยู่ พร้อม Capacity
 */
const updateSchedule = async (id, updateData) => {
    const schedule = await ClassesSchedule.findByPk(id, {
        include: [{ model: ClassesCapacity, as: 'capacity_data' }]
    });

    if (!schedule) {
        const error = new Error(`Schedule with ID ${id} not found.`);
        error.status = 404; // Not Found
        throw error;
    }
    
    const newStartTime = new Date(updateData.start_time || schedule.start_time);
    const newEndTime = new Date(updateData.end_time || schedule.end_time);
    const currentCapacity = schedule.capacity_data ? schedule.capacity_data.capacity : 0;
    const newCapacity = updateData.capacity !== undefined ? updateData.capacity : currentCapacity;

    // ตรวจสอบความถูกต้องของ Input
    _validateScheduleInput(newStartTime, newEndTime, newCapacity);

    // ตรวจสอบการทับซ้อน โดยยกเว้น ID ของ Schedule ที่กำลังอัปเดต
    const existingOverlap = await _checkOverlap(newStartTime, newEndTime, id);

    if (existingOverlap) {
        const error = new Error("Time conflict: The updated time slot overlaps with an existing schedule.");
        error.status = 409; // Conflict
        throw error;
    }
    
    const transaction = await ClassesSchedule.sequelize.transaction();

    try {
        // 1. อัปเดต Schedule Master
        await schedule.update({
            ...updateData,
            start_time: newStartTime,
            end_time: newEndTime,
            updated_by: updateData.user || 'API_CALL'
        }, { transaction });
        
        // 2. อัปเดต Capacity ถ้ามีการส่งค่า capacity มา
        if (updateData.capacity !== undefined) {
            await ClassesCapacity.update({
                capacity: updateData.capacity,
                updated_by: updateData.user || 'API_CALL'
            }, {
                where: { classes_id: id },
                transaction
            });
        }
        
        await transaction.commit();
        
        // ดึงข้อมูลล่าสุดกลับไป
        return await ClassesSchedule.findByPk(id, {
            include: [{ model: ClassesCapacity, as: 'capacity_data' }]
        });
        
    } catch (error) {
        await transaction.rollback();
        if (error.status) throw error; 
        
        console.error("[DB Error] Failed to update schedule and capacity:", error);
        throw new Error("Internal server error during schedule update.");
    }
};

/**
 * [DELETE] ลบรายการ Schedule ที่มีอยู่
 */
const deleteSchedule = async (id) => {
    
    // *TODO: ก่อนลบ ควรตรวจสอบว่ามี ClassesBooking ผูกอยู่กับ Schedule นี้หรือไม่
    
    try {
        const deletedCount = await ClassesSchedule.destroy({
            where: { id }
        });

        if (deletedCount === 0) {
            const error = new Error(`Schedule with ID ${id} not found.`);
            error.status = 404; // Not Found
            throw error;
        }
        
        return { message: `Schedule ID ${id} deleted successfully.` };
    } catch (error) {
        if (error.status) throw error; 
        
        console.error("[DB Error] Failed to delete schedule:", error);
        
        // จัดการ Foreign Key Constraint Error (ถ้ามี Booking ผูกอยู่)
        if (error.name === 'SequelizeForeignKeyConstraintError') {
             const fkError = new Error("Cannot delete schedule: It is currently linked to existing bookings. Please delete related bookings first.");
             fkError.status = 409;
             throw fkError;
        }
        throw new Error("Internal server error during schedule deletion.");
    }
};

// =================================================================
// 3. EXPORTS
// =================================================================

module.exports = {
    createSchedule,
    getSchedules,
    getSchedulesById,
    updateSchedule,
    deleteSchedule,
    getAvailableSchedulesByBookingDate
};