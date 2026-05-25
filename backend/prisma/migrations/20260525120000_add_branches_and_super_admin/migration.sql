-- CreateEnum
CREATE TYPE "BranchStatus" AS ENUM ('active', 'inactive');

-- Create branch table first so existing data can be backfilled safely.
CREATE TABLE "branches" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "BranchStatus" NOT NULL DEFAULT 'active',
    "branchAdminId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "branches_code_key" ON "branches"("code");

-- CreateIndex
CREATE UNIQUE INDEX "branches_branchAdminId_key" ON "branches"("branchAdminId");

-- Create a default branch for all existing production data.
INSERT INTO "branches" ("id", "name", "code", "status")
VALUES ('primary-branch', 'Primary', 'primary', 'active');

-- Promote the existing admin role to super_admin and introduce branch_admin.
ALTER TYPE "Role" RENAME TO "Role_old";

CREATE TYPE "Role" AS ENUM ('super_admin', 'branch_admin', 'supervisor', 'agent');

ALTER TABLE "users"
ALTER COLUMN "role" TYPE "Role"
USING (
  CASE "role"::text
    WHEN 'admin' THEN 'super_admin'
    WHEN 'supervisor' THEN 'supervisor'
    WHEN 'agent' THEN 'agent'
  END
)::"Role";

DROP TYPE "Role_old";

-- Add branch ownership columns.
ALTER TABLE "users" ADD COLUMN "branchId" TEXT;
ALTER TABLE "teams" ADD COLUMN "branchId" TEXT;
ALTER TABLE "campaigns" ADD COLUMN "branchId" TEXT;
ALTER TABLE "leads" ADD COLUMN "branchId" TEXT;

-- Backfill existing records into the default branch.
UPDATE "users"
SET "branchId" = 'primary-branch'
WHERE "branchId" IS NULL;

UPDATE "teams"
SET "branchId" = 'primary-branch'
WHERE "branchId" IS NULL;

UPDATE "campaigns"
SET "branchId" = 'primary-branch'
WHERE "branchId" IS NULL;

UPDATE "leads" AS l
SET "branchId" = COALESCE(c."branchId", 'primary-branch')
FROM "campaigns" AS c
WHERE l."campaignId" = c."id"
  AND l."branchId" IS NULL;

ALTER TABLE "teams" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "campaigns" ALTER COLUMN "branchId" SET NOT NULL;
ALTER TABLE "leads" ALTER COLUMN "branchId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "leads_branchId_idx" ON "leads"("branchId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teams" ADD CONSTRAINT "teams_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "branches" ADD CONSTRAINT "branches_branchAdminId_fkey" FOREIGN KEY ("branchAdminId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;