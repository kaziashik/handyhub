/*
  Warnings:

  - You are about to drop the column `avatarUrl` on the `users` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "users" DROP COLUMN "avatarUrl",
ADD COLUMN     "imagePublicId" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "imageUrl" TEXT NOT NULL DEFAULT '';
