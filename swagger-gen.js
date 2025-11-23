const swaggerAutogen = require('swagger-autogen')();

const doc = {
  info: {
    title: 'Sting Hive Muay Thai API',
    description: 'Auto-generated documentation',
  },
  host: 'localhost:3000',
  schemes: ['http'],
  // กำหนด Definition Object ไว้ตรงนี้ (เพื่อให้ Response สวยๆ)
  definitions: {
    ClassesSchedule: {
      $start_time: "2025-12-01T10:00:00.000Z",
      $end_time: "2025-12-01T11:00:00.000Z",
      $gym_enum: "STING_HIVE",
      $capacity: 15
    },
    ClassesBooking: {
      $classes_schedule_id: "uuid-v4",
      $client_name: "John Doe",
      client_email: "john@email.com"
    }
  }
};

const outputFile = './swagger-output.json'; // ไฟล์ที่จะถูกสร้าง
const endpointsFiles = ['./server.js']; // ไฟล์เริ่มต้นของ Server (มันจะไล่ require ไปเอง)

/* NOTE: ถ้าคุณอยากให้มันรัน Server ต่อเลยหลังจากเจนเสร็จ ให้ใช้บรรทัดล่าง */
swaggerAutogen(outputFile, endpointsFiles, doc).then(() => {
    console.log('✅ Swagger Documentation Generated!');
    // require('./server.js'); // ถ้าอยากให้รัน server ต่อเลยเปิดบรรทัดนี้
});