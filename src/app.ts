import "reflect-metadata";
import { AppDataSource } from "./data-source";
import express from 'express'; 
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import swaggerOptions from './swagger.config';
import { Users } from "./entity/users"; 
import { faker } from '@faker-js/faker';
import { UserRole, UserRoleValue } from "./constants/user-role-enum";

const PORT = 3000;
const app = express();
app.use(express.json());

function createRandomUser(): Users {
    const user = new Users();
    // ใช้ faker ในการสร้างข้อมูลที่ดูสมจริง
    user.username = faker.internet.username();
    user.password = faker.internet.password({ length: 15 }); // รหัสผ่านสุ่ม 15 ตัว
    user.email = faker.internet.email();
    user.phone = faker.phone.number({ style: "human" });
    const roleValues = Object.values(UserRoleValue) as UserRole[];
    user.role = faker.helpers.arrayElement(roleValues); 
    user.isActive = faker.datatype.boolean();
    return user;
}

const swaggerSpec = swaggerJsdoc(swaggerOptions);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));

app.get('/', (req, res) => {
    res.redirect('/api-docs'); // ให้ Redirect ไปหน้าเอกสาร Swagger
});

async function initializeApp() {
    try {
        await AppDataSource.initialize();
        console.log("✅ Data Source has been initialized and connected to PostgreSQL!");

        const userRepository = AppDataSource.getRepository(Users);
        await userRepository.clear();

        const newUser = createRandomUser();
        await userRepository.save(newUser);
        console.log("✅ New user has been created and saved:", newUser);

        app.listen(PORT, () => {
            console.log(`🚀 Server has started on http://localhost:${PORT}`);
            console.log("Waiting for incoming requests...");
        });

    } catch (error) {
        console.error("❌ Error during Data Source initialization:", error);
    }
}
initializeApp();