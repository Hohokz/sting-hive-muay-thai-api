-- public.class_schedule definition

-- Drop table

-- DROP TABLE public.class_schedule;

CREATE TABLE public.class_schedule (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	start_time timestamptz NOT NULL,
	end_time timestamptz NOT NULL,
	gym_enum varchar(50) NOT NULL,
	description text NOT NULL,
	created_date timestamptz DEFAULT now() NOT NULL,
	updated_date timestamptz DEFAULT now() NOT NULL,
	created_by varchar(255) NOT NULL,
	updated_by varchar(255) NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	CONSTRAINT "PK_544546bcb6f727f6e820b856522" PRIMARY KEY (id)
);


-- public.classes_booking definition

-- Drop table

-- DROP TABLE public.classes_booking;

CREATE TABLE public.classes_booking (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	payment_id uuid NOT NULL,
	capacity int4 NOT NULL,
	class_schedule_id uuid NOT NULL,
	client_phone varchar(20) NOT NULL,
	is_private bool DEFAULT true NOT NULL,
	client_name varchar(255) NOT NULL,
	client_email varchar(255) NOT NULL,
	booking_status varchar(20) NOT NULL,
	admin_note varchar(255) NOT NULL,
	created_date timestamptz DEFAULT now() NOT NULL,
	updated_date timestamptz DEFAULT now() NOT NULL,
	created_by varchar(255) NOT NULL,
	updated_by varchar(255) NOT NULL,
	CONSTRAINT classes_booking_pkey PRIMARY KEY (id)
);


-- public.classes_capacity definition

-- Drop table

-- DROP TABLE public.classes_capacity;

CREATE TABLE public.classes_capacity (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	capacity int4 NOT NULL,
	class_schedule_id uuid NOT NULL,
	"date" timestamptz NOT NULL,
	created_date timestamptz DEFAULT now() NOT NULL,
	updated_date timestamptz DEFAULT now() NOT NULL,
	created_by varchar(255) NOT NULL,
	updated_by varchar(255) NOT NULL,
	CONSTRAINT classes_capacity_pkey PRIMARY KEY (id, class_schedule_id)
);


-- public.classes_schedule definition

-- Drop table

-- DROP TABLE public.classes_schedule;

CREATE TABLE public.classes_schedule (
	id uuid NOT NULL,
	start_time timestamp NOT NULL,
	end_time timestamp NOT NULL,
	gym_enum varchar(50) NULL,
	description text NULL,
	created_date timestamp DEFAULT CURRENT_TIMESTAMP NULL,
	updated_date timestamp NULL,
	created_by text NULL,
	updated_by text NULL,
	is_active bool DEFAULT true NULL,
	CONSTRAINT classes_schedule_gym_enum_check CHECK (((gym_enum)::text = ANY ((ARRAY['STING_CLUB'::character varying, 'STING_HIVE'::character varying])::text[]))),
	CONSTRAINT classes_schedule_pkey PRIMARY KEY (id)
);


-- public.payment definition

-- Drop table

-- DROP TABLE public.payment;

CREATE TABLE public.payment (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	class_schedule_id uuid NOT NULL,
	payment_status varchar(20) NOT NULL,
	payment_method varchar(20) NOT NULL,
	amount numeric(10, 2) NOT NULL,
	payment_date timestamptz DEFAULT now() NOT NULL,
	attachment varchar(255) NOT NULL,
	CONSTRAINT "PK_5bb432b45aadae83c847ee2ac58" PRIMARY KEY (id, class_schedule_id)
);


-- public.users definition

-- Drop table

-- DROP TABLE public.users;

CREATE TABLE public.users (
	id uuid DEFAULT uuid_generate_v4() NOT NULL,
	"role" varchar(50) NOT NULL,
	is_active bool DEFAULT true NOT NULL,
	phone varchar(100) NOT NULL,
	username varchar(50) NOT NULL,
	"password" varchar(255) NOT NULL,
	email varchar(100) NOT NULL,
	CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE (email),
	CONSTRAINT "UQ_fe0bb3f6520ee0469504521e710" UNIQUE (username),
	CONSTRAINT users_pkey PRIMARY KEY (id)
);


-- public.payments definition

-- Drop table

-- DROP TABLE public.payments;

CREATE TABLE public.payments (
	id uuid NOT NULL,
	classes_booking_id uuid NULL,
	amount numeric(10, 2) NOT NULL,
	payment_method varchar(50) NULL,
	payment_status varchar(50) NULL,
	attachment text NULL,
	CONSTRAINT payments_payment_method_check CHECK (((payment_method)::text = ANY ((ARRAY['UNPAY'::character varying, 'PAID'::character varying])::text[]))),
	CONSTRAINT payments_payment_status_check CHECK (((payment_status)::text = ANY ((ARRAY['PENDING'::character varying, 'PAID'::character varying, 'CANCEL'::character varying, 'ERROR'::character varying])::text[]))),
	CONSTRAINT payments_pkey PRIMARY KEY (id),
	CONSTRAINT payments_classes_booking_id_fkey FOREIGN KEY (classes_booking_id) REFERENCES public.classes_booking(id)
);