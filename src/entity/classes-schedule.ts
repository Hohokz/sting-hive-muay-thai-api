import { Column, Entity, PrimaryGeneratedColumn } from "typeorm";

@Entity()
export class ClassSchedule {

    @PrimaryGeneratedColumn("uuid")
    id!: string;

    @Column({type :"timestamp with time zone", name: "start_time"})
    startTime!: Date;

    @Column({type :"timestamp with time zone", name: "end_time"})
    endTime!: Date;

    @Column({type: "varchar", name: "gym_enum", length: 50})
    gymEnum!: string;

    @Column({type: "text", name: "description"})
    description!: string;

    @Column({type: "timestamp with time zone", name: "created_date", default: () => "CURRENT_TIMESTAMP"})
    createdDate!: Date;

    @Column({type: "timestamp with time zone", name: "updated_date", default: () => "CURRENT_TIMESTAMP"})
    updatedDate!: Date;

    @Column({type: "varchar", name: "created_by", length: 255})
    createdBy!: string;

    @Column({type: "varchar", name: "updated_by", length: 255})
    updatedBy!: string;
    
    @Column({type: "boolean", name: "is_active", default: true})
    isActive!: boolean;
}