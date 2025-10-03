import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class ClassesBooking {

    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type :"uuid", name: "class_schedule_id"})
    classScheduleId!: string;

    @Column({type :"uuid", name: "payment_id"})
    paymentId!: string;

    @Column({type: "varchar", name: "client_name", length: 255})
    clientName!: string;

    @Column({type: "varchar", name: "client_email", length: 255})
    clientEmail!: string;

    @Column({type: "varchar", name: "client_phone", length: 20})
    clientPhone!: string;

    @Column({type: "varchar", name: "booking_status", length: 20})
    bookingStatus!: string;

    @Column()
    capacity!: number;

    @Column({type : "varchar", name: "admin_note", length: 255})
    adminNote!: string;

    @Column({type: "boolean", name: "is_private", default: true})
    isPrivate!: boolean;

    @Column({type: "timestamp with time zone", name: "created_date", default: () => "CURRENT_TIMESTAMP"})
    createdDate!: Date;

    @Column({type: "timestamp with time zone", name: "updated_date", default: () => "CURRENT_TIMESTAMP"})
    updatedDate!: Date;

    @Column({type: "varchar", name: "created_by", length: 255})
    createdBy!: string;
    
    @Column({type: "varchar", name: "updated_by", length: 255})
    updatedBy!: string;
}