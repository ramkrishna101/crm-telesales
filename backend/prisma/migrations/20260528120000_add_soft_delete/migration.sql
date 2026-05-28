-- Soft delete columns for users and campaigns
ALTER TABLE "users" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "campaigns" ADD COLUMN "deletedAt" TIMESTAMP(3);

CREATE INDEX "users_deletedAt_idx" ON "users"("deletedAt");
CREATE INDEX "campaigns_deletedAt_idx" ON "campaigns"("deletedAt");
