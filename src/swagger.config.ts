const swaggerDefinition = {
    openapi: '3.0.0', // หรือ '3.1.0'
    info: {
        title: 'STING HIVE MUAY THAI API SWAGGER', // ชื่อ API ของคุณ
        version: '1.0.0',
        description: 'API สำหรับจัดการระบบการจองและตารางเวลา (Booking/Schedule)',
        contact: {
            name: 'APIWAT SINGHARACH', // คุณเป็นโปรแกรมเมอร์
            email: 'hohokz@hotmail.com',
        },
    },
    servers: [
        {
            url: 'http://localhost:3000', // URL หลักของ Server
            description: 'Development Server',
        },
    ],
};

const options = {
    swaggerDefinition,
    // ระบุว่าให้ไปอ่าน JSDoc Comments จากไฟล์ไหนบ้าง
    // * ต้องตรงกับไฟล์ที่คุณเขียน Route Logic หรือ Model Schema
    apis: ['./src/routes/*.ts', './src/entity/*.ts'], // ตัวอย่างเช่น ไปอ่านจากไฟล์ Route ทั้งหมด และ Entity (Model)
};

export default options;