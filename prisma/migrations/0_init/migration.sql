-- CreateTable
CREATE TABLE "car_state" (
    "id" SERIAL NOT NULL,
    "car_id" INTEGER,
    "time" TIMESTAMP(6),
    "state_of_charge" INTEGER,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "gear" INTEGER,
    "speed" DOUBLE PRECISION,

    CONSTRAINT "car_state_pkey" PRIMARY KEY ("id")
);

