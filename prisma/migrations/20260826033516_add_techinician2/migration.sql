/*
  Warnings:

  - You are about to drop the column `isVerified` on the `users` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "technician_profiles" DROP CONSTRAINT "technician_profiles_userId_fkey";

-- AlterTable
ALTER TABLE "users" DROP COLUMN "isVerified";

-- AddForeignKey
ALTER TABLE "technician_profiles" ADD CONSTRAINT "technician_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
