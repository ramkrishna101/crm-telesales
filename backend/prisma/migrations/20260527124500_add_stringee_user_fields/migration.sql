ALTER TABLE "users"
ADD COLUMN "stringeeEmail" TEXT,
ADD COLUMN "stringeeAccountId" TEXT;

CREATE UNIQUE INDEX "users_stringeeEmail_key" ON "users"("stringeeEmail");
CREATE UNIQUE INDEX "users_stringeeAccountId_key" ON "users"("stringeeAccountId");