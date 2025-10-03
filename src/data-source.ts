import "reflect-metadata";
import { DataSource } from "typeorm";
import * as dotenv from 'dotenv';

dotenv.config();

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value) throw new Error(`Environment variable ${name} is required.`);
    return value;
}

export const AppDataSource = new DataSource({
    type: requireEnv("DB_TYPE") as "postgres",
    host: requireEnv("DB_HOST"),
    port: parseInt(requireEnv("DB_PORT"), 10),
    username: requireEnv("DB_USERNAME"),
    password: requireEnv("DB_PASSWORD"),
    database: requireEnv("DB_DATABASE"),
    synchronize: true,
    logging: false,
    entities: ["src/entity/*.ts"],
    subscribers: [],
    migrations: [],
});
