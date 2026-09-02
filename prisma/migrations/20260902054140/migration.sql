/*
  Warnings:

  - You are about to drop the column `sstatus` on the `appointments` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "appointments" DROP COLUMN "sstatus",
ADD COLUMN     "status" "AppointmentStatus" NOT NULL DEFAULT 'PENDING';
