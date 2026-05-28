-- Add soft-delete to leads and teams
ALTER TABLE "leads" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "teams" ADD COLUMN "deletedAt" TIMESTAMP(3);
CREATE INDEX "leads_deletedAt_idx" ON "leads"("deletedAt");
CREATE INDEX "teams_deletedAt_idx" ON "teams"("deletedAt");
