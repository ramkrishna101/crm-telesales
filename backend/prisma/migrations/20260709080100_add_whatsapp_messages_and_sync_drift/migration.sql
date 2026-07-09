-- DropIndex
DROP INDEX IF EXISTS "campaigns_deletedAt_idx";

-- DropIndex
DROP INDEX IF EXISTS "users_deletedAt_idx";

-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "users" ALTER COLUMN "status" SET DEFAULT 'offline';

-- AlterTable
ALTER TABLE "whatsapp_phone_slots" ADD COLUMN "hidePhone" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" TEXT NOT NULL,
    "slotId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "jid" TEXT NOT NULL,
    "fromMe" BOOLEAN NOT NULL DEFAULT false,
    "text" TEXT,
    "mediaType" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "whatsapp_messages_slotId_jid_idx" ON "whatsapp_messages"("slotId", "jid");

-- CreateIndex
CREATE INDEX "whatsapp_messages_slotId_timestamp_idx" ON "whatsapp_messages"("slotId", "timestamp");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_slotId_messageId_key" ON "whatsapp_messages"("slotId", "messageId");

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "whatsapp_phone_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;
