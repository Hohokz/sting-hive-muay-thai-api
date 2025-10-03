import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class Payment {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type :"uuid", name: "class_schedule_id", primary: true})
    classScheduleId!: string;

    @Column({type :"varchar", name: "payment_status", length: 20})
    paymentStatus!: string

    @Column({type :"varchar", name: "payment_method", length: 20})
    paymentMethod!: string

    @Column({type :"numeric", name: "amount", precision: 10, scale: 2})
    amount!: number;

    @Column({type: "timestamp with time zone", name: "payment_date", default: () => "CURRENT_TIMESTAMP"})
    paymentDate!: Date;
    
    @Column({type: "varchar", name: "attachment", length: 255})
    attachment!: string;

}