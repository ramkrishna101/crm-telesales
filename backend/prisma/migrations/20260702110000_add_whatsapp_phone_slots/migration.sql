CREATE TABLE "whatsapp_phone_slots" (
  "id" TEXT NOT NULL,
  "branchId" TEXT NOT NULL,
  "displayName" TEXT NOT NULL,
  "e164" TEXT,
  "status" TEXT NOT NULL DEFAULT 'idle',
  "assignedToId" TEXT,
  "lastSeenAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_phone_slots_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_phone_slots_assignedToId_key" ON "whatsapp_phone_slots"("assignedToId");
CREATE INDEX "whatsapp_phone_slots_branchId_idx" ON "whatsapp_phone_slots"("branchId");
CREATE INDEX "whatsapp_phone_slots_status_idx" ON "whatsapp_phone_slots"("status");

CREATE TABLE "whatsapp_sessions" (
  "id" TEXT NOT NULL,
  "slotId" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'created',
  "qrPayload" TEXT,
  "qrExpiresAt" TIMESTAMP(3),
  "lastHeartbeatAt" TIMESTAMP(3),
  "reconnectCount" INTEGER NOT NULL DEFAULT 0,
  "authBlobEnc" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "whatsapp_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_sessions_slotId_key" ON "whatsapp_sessions"("slotId");
CREATE INDEX "whatsapp_sessions_state_idx" ON "whatsapp_sessions"("state");

ALTER TABLE "whatsapp_phone_slots"
ADD CONSTRAINT "whatsapp_phone_slots_branchId_fkey"
FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "whatsapp_phone_slots"
ADD CONSTRAINT "whatsapp_phone_slots_assignedToId_fkey"
FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "whatsapp_sessions"
ADD CONSTRAINT "whatsapp_sessions_slotId_fkey"
FOREIGN KEY ("slotId") REFERENCES "whatsapp_phone_slots"("id") ON DELETE CASCADE ON UPDATE CASCADE;