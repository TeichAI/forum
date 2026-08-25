-- CreateEnum
CREATE TYPE "SpacePostingPolicy" AS ENUM ('OPEN', 'ANNOUNCEMENTS', 'ADMIN_ONLY');

-- AlterTable
ALTER TABLE "Category"
ADD COLUMN "postingPolicy" "SpacePostingPolicy" NOT NULL DEFAULT 'OPEN';
