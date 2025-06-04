/*
  Warnings:

  - Made the column `car_id` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `time` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `state_of_charge` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `latitude` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `longitude` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `gear` on table `car_state` required. This step will fail if there are existing NULL values in that column.
  - Made the column `speed` on table `car_state` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "car_state" ALTER COLUMN "car_id" SET NOT NULL,
ALTER COLUMN "time" SET NOT NULL,
ALTER COLUMN "state_of_charge" SET NOT NULL,
ALTER COLUMN "latitude" SET NOT NULL,
ALTER COLUMN "longitude" SET NOT NULL,
ALTER COLUMN "gear" SET NOT NULL,
ALTER COLUMN "speed" SET NOT NULL;

-- CreateIndex
CREATE INDEX "car_state_car_id_idx" ON "car_state"("car_id");
