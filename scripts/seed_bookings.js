const { connectDB, sequelize } = require('../config/db');
const { ClassesSchedule, ClassesBooking, ClassesCapacity } = require('../models/Associations');

// --- Helper Data ---
const firstNames = ['Somchai', 'Somsak', 'Malee', 'Suda', 'John', 'Jane', 'Michael', 'Emily', 'David', 'Sarah', 'Tony', 'Steve', 'Natasha', 'Bruce', 'Peter'];
const lastNames = ['Jaidee', 'Rakthai', 'Smith', 'Doe', 'Johnson', 'Brown', 'Stark', 'Rogers', 'Romanoff', 'Banner', 'Parker'];
const domains = ['gmail.com', 'hotmail.com', 'yahoo.com', 'outlook.com', 'example.com'];

const getRandomElement = (arr) => arr[Math.floor(Math.random() * arr.length)];
const getRandomInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

const generateRandomUser = () => {
    const fn = getRandomElement(firstNames);
    const ln = getRandomElement(lastNames);
    return {
        name: `${fn} ${ln}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${getRandomElement(domains)}`,
        phone: `08${getRandomInt(0, 9)}${getRandomInt(1000000, 9999999)}`
    };
};

const TIME_SLOTS = ['09:00:00', '10:30:00', '13:00:00', '15:00:00', '17:30:00', '19:00:00'];
const CLASSES_TYPES = ['STING_CLUB', 'STING_HIVE'];
const STATUSES = ['SUCCEED', 'SUCCEED', 'SUCCEED', 'PENDING', 'CANCELED']; // Weighted towards SUCCEED

// --- Main Seeding Logic ---
const seedBookings = async () => {
    try {
        await connectDB();
        console.log('🌱 Starting database seeding...');

        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 7); // Start 7 days ago
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 14); // End 14 days from now

        let totalSchedules = 0;
        let totalBookings = 0;

        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            console.log(`Processing date: ${dateStr}`);

            // For each time slot
            for (const timeSlot of TIME_SLOTS) {
                // 70% chance to have a class at this slot
                if (Math.random() > 0.3) {
                    
                    const endTimeParts = timeSlot.split(':');
                    const hour = parseInt(endTimeParts[0]);
                    const minute = parseInt(endTimeParts[1]);
                    // Assuming class lasts 1 hour or 1.5 hours randomly
                    const durationMinutes = Math.random() > 0.5 ? 60 : 90;
                    
                    let endHour = hour + Math.floor((minute + durationMinutes) / 60);
                    let endMinute = (minute + durationMinutes) % 60;
                    const endTime = `${String(endHour).padStart(2, '0')}:${String(endMinute).padStart(2, '0')}:00`;

                    // Find or Create Schedule
                    let schedule = await ClassesSchedule.findOne({
                        where: {
                            start_time: timeSlot,
                            // Ideally check date too if schedule was date-specific, but schema implies daily recurring or similar?
                            // Wait, ClassesSchedule doesn't seem to have a 'date' field in the schema I saw earlier! 
                            // It only has 'start_time', 'end_time', 'gym_enum'.
                            // This implies schedules are templates? 
                            // Let me re-read ClassesBooking. It has `date_booking`.
                            // Ah, ClassesSchedule is likely a template for "Class at 15:00".
                            // If so, I shouldn't create duplicates for the same time/gym if they exist.
                            // However, if I want to simulate valid schedules for specific days, 
                            // maybe the app uses `active` schedules?
                            // Let's assume Unique(start_time, gym_enum) effectively.
                            // I will randomize gym_enum.
                            gym_enum: getRandomElement(CLASSES_TYPES)
                        }
                    });

                    if (!schedule) {
                        schedule = await ClassesSchedule.create({
                            start_time: timeSlot,
                            end_time: endTime,
                            gym_enum: getRandomElement(CLASSES_TYPES),
                            description: 'Seeded Class',
                            is_active: true,
                            is_private_class: false
                        });
                        
                         await ClassesCapacity.create({
                            classes_id: schedule.id,
                            capacity: 20 // Standard capacity
                        });
                        totalSchedules++;
                    }

                    // Now create Bookings for this Schedule ON THIS DATE
                    // Random number of bookings (0 to 15)
                    const numBookings = getRandomInt(0, 15);
                    
                    for (let i = 0; i < numBookings; i++) {
                        const user = generateRandomUser();
                        await ClassesBooking.create({
                            classes_schedule_id: schedule.id,
                            client_name: user.name,
                            client_email: user.email,
                            client_phone: user.phone,
                            booking_status: getRandomElement(STATUSES),
                            capacity: 1,
                            is_private: false,
                            date_booking: dateStr, // Assigning the specific date
                            created_by: 'Seeder',
                            updated_by: 'Seeder'
                        });
                        totalBookings++;
                    }
                }
            }
        }

        console.log(`✅ Seeding Complete! Created ${totalSchedules} new schedules (if any) and ${totalBookings} bookings.`);

    } catch (error) {
        console.error('❌ Error seeding:', error);
    } finally {
        await sequelize.close();
    }
};

seedBookings();
