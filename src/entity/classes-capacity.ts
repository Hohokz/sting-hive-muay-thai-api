import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class ClassesCapacity {
    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type :"uuid", name: "class_schedule_id", primary: true})
    classScheduleId!: string;

    @Column({type :"timestamp with time zone", name: "date"})
    date!: Date;

    @Column()
    capacity!: number;

    @Column({type: "timestamp with time zone", name: "created_date", default: () => "CURRENT_TIMESTAMP"})
    createdDate!: Date;

    @Column({type: "timestamp with time zone", name: "updated_date", default: () => "CURRENT_TIMESTAMP"})
    updatedDate!: Date;

    @Column({type: "varchar", name: "created_by", length: 255})
    createdBy!: string;
    
    @Column({type: "varchar", name: "updated_by", length: 255})
    updatedBy!: string;
}