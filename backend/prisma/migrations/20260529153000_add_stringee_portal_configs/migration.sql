ALTER TABLE "users"
ADD COLUMN "stringeePortalConfigId" TEXT;

CREATE TABLE "stringee_portal_configs" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "portalName" TEXT NOT NULL,
  "apiSidEnc" TEXT NOT NULL,
  "apiSecretEnc" TEXT NOT NULL,
  "tenant" TEXT NOT NULL,
  "adminEmailEnc" TEXT NOT NULL,
  "adminPasswordEnc" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "stringee_portal_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "stringee_portal_configs_branchId_idx" ON "stringee_portal_configs"("branchId");
CREATE UNIQUE INDEX "stringee_portal_configs_branchId_portalName_key" ON "stringee_portal_configs"("branchId", "portalName");

ALTER TABLE "stringee_portal_configs"
ADD CONSTRAINT "stringee_portal_configs_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "users"
ADD CONSTRAINT "users_stringeePortalConfigId_fkey"
FOREIGN KEY ("stringeePortalConfigId") REFERENCES "stringee_portal_configs"("id") ON DELETE SET NULL ON UPDATE CASCADE;
