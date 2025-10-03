import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Users {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type: "varchar", name: "username", length: 50, unique: true})
    username!: string;

    @Column({type: "varchar", name: "password", length: 255})
    password!: string;

    @Column({type: "varchar", name: "email", length: 100, unique: true})
    email!: string;

    @Column({type: "varchar", name: "phone", length: 100})
    phone!: string;

    @Column({type: "varchar", name: "role", length: 50})
    role!: string
    
    @Column({type: "boolean", name: "is_active", default: true})
    isActive!: boolean;
}