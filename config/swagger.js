// config/swagger.js

const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.0', // เวอร์ชัน OpenAPI
    info: {
      title: 'Sting Hive Muay Thai API',
      version: '1.0.0',
      description: 'API Documentation for Sting Hive Muay Thai Management System',
      contact: {
        name: 'Sting Hive Dev Team',
      },
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Development Server',
      },
      // {
      //   url: 'https://api.stinghive.com',
      //   description: 'Production Server',
      // }
    ],
    components: {
      schemas: {
        // คุณสามารถ define global schemas ที่นี่ หรือจะไป define ใน route ก็ได้
      }
    }
  },
  // ระบุไฟล์ที่จะให้ Swagger ไปอ่านคอมเมนต์ (@swagger)
  apis: ['./routes/*.js'], 
};

const swaggerSpec = swaggerJsdoc(options);

module.exports = swaggerSpec;