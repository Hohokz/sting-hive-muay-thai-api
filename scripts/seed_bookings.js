const { connectDB, sequelize } = require('../config/db');
const { ClassesSchedule, ClassesBooking } = require('../models/Associations');

// --- Helper Data (เหมือนเดิม) ---
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

const STATUSES = ['SUCCEED', 'SUCCEED', 'SUCCEED', 'PENDING', 'CANCELED'];

// --- Main Seeding Logic ---
const seedBookingsOnly = async () => {
    try {
        await connectDB();
        console.log('🌱 Starting database seeding (Bookings only)...');

        // 1. ดึง Schedules ที่มีอยู่ทั้งหมดในระบบ
        const existingSchedules = await ClassesSchedule.findAll({
            where: { is_active: true }
        });

        if (existingSchedules.length === 0) {
            console.error('❌ No schedules found in database. Please create schedules first.');
            return;
        }

        const today = new Date();
        const startDate = new Date(today);
        startDate.setDate(today.getDate() - 7); 
        const endDate = new Date(today);
        endDate.setDate(today.getDate() + 14);

        let totalBookings = 0;

        // 2. วนลูปตามวันที่
        for (let d = new Date(startDate); d <= endDate; d.setDate(d.getDate() + 1)) {
            const dateStr = d.toISOString().split('T')[0];
            console.log(`Processing date: ${dateStr}`);

            // 3. สำหรับแต่ละวัน ให้วนลูปใช้ Schedules ที่มีอยู่จริง
            for (const schedule of existingSchedules) {
                
                // สุ่ม 70% ว่า Schedule นี้ในวันนี้จะมีคนจองไหม
                if (Math.random() > 0.3) {
                    const numBookings = getRandomInt(1, 10); // สมมติจอง 1-10 คนต่อคลาส
                    
                    const bookingsToCreate = [];
                    for (let i = 0; i < numBookings; i++) {
                        const user = generateRandomUser();
                        bookingsToCreate.push({
                            classes_schedule_id: schedule.id,
                            client_name: user.name,
                            client_email: user.email,
                            client_phone: user.phone,
                            booking_status: getRandomElement(STATUSES),
                            capacity: 1,
                            is_private: schedule.is_private_class || false,
                            date_booking: dateStr,
                            created_by: 'Seeder_V2',
                            updated_by: 'Seeder_V2'
                        });
                    }

                    // ใช้ bulkCreate เพื่อประสิทธิภาพที่ดีกว่าหากจองเยอะ
                    await ClassesBooking.bulkCreate(bookingsToCreate);
                    totalBookings += bookingsToCreate.length;
                }
            }
        }

        console.log(`✅ Seeding Complete! Created ${totalBookings} bookings using existing schedules.`);

    } catch (error) {
        console.error('❌ Error seeding:', error);
    } finally {
        await sequelize.close();
    }
};

seedBookingsOnly();