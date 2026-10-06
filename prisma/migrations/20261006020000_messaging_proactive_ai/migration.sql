-- AlterEnum
ALTER TYPE "OutboundStatus" ADD VALUE 'DEAD_LETTER';

-- DropIndex
DROP INDEX "MessagingConnection_tenantId_key";

-- AlterTable
ALTER TABLE "MessagingConnection" ADD COLUMN     "circuitState" TEXT NOT NULL DEFAULT 'CLOSED',
ADD COLUMN     "consecutiveFailures" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "healthLockToken" TEXT,
ADD COLUMN     "healthStatus" TEXT NOT NULL DEFAULT 'UNCHECKED',
ADD COLUMN     "isDefault" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastInboundAt" TIMESTAMP(3),
ADD COLUMN     "lastOutboundAt" TIMESTAMP(3),
ADD COLUMN     "nextHealthAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "pausedUntil" TIMESTAMP(3);

-- Preserve the original connection selection when adding multiple connections.
UPDATE "MessagingConnection" SET "isDefault" = true;
CREATE UNIQUE INDEX "MessagingConnection_one_default_per_tenant" ON "MessagingConnection" ("tenantId") WHERE "isDefault" = true;

-- AlterTable
ALTER TABLE "ConversationMessage" ADD COLUMN     "deliveredAt" TIMESTAMP(3),
ADD COLUMN     "deliveryState" TEXT NOT NULL DEFAULT 'RECEIVED',
ADD COLUMN     "readAt" TIMESTAMP(3);
UPDATE "ConversationMessage" SET "deliveryState" = 'SENT' WHERE "direction" = 'OUTBOUND';
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_delivery_state" CHECK ("deliveryState" IN ('RECEIVED', 'SENT', 'DELIVERED', 'READ', 'FAILED'));

-- AlterTable
ALTER TABLE "OutboundDispatch" ADD COLUMN     "attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateTable
CREATE TABLE "MessagingReceipt" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockToken" TEXT,
    "lockedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingReceipt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessageDeliveryEvent" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessageDeliveryEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachCampaign" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "objective" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "maxContactsPerDay" INTEGER NOT NULL DEFAULT 10,
    "maxTurns" INTEGER NOT NULL DEFAULT 6,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "followUpHours" INTEGER,
    "createdById" TEXT NOT NULL,
    "authorizedById" TEXT,
    "authorizedMemberId" TEXT,
    "authorizedAt" TIMESTAMP(3),
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachSession" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "control" TEXT NOT NULL DEFAULT 'AI',
    "version" INTEGER NOT NULL DEFAULT 0,
    "handoffReason" TEXT,
    "lastSentAt" TIMESTAMP(3),
    "followUpQueued" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutreachSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OutreachTurn" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "fingerprint" TEXT,
    "model" TEXT,
    "promptVersion" TEXT,
    "message" TEXT,
    "result" JSONB,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "planId" TEXT,
    "errorCode" TEXT,
    "lockToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OutreachTurn_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MessagingReceipt_status_nextAttemptAt_idx" ON "MessagingReceipt"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "MessagingReceipt_tenantId_connectionId_createdAt_idx" ON "MessagingReceipt"("tenantId", "connectionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingReceipt_connectionId_eventKey_key" ON "MessagingReceipt"("connectionId", "eventKey");

-- CreateIndex
CREATE INDEX "MessageDeliveryEvent_tenantId_providerMessageId_idx" ON "MessageDeliveryEvent"("tenantId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageDeliveryEvent_connectionId_providerMessageId_state_key" ON "MessageDeliveryEvent"("connectionId", "providerMessageId", "state");

-- CreateIndex
CREATE INDEX "OutreachCampaign_status_startsAt_endsAt_idx" ON "OutreachCampaign"("status", "startsAt", "endsAt");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaign_id_tenantId_key" ON "OutreachCampaign"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachCampaign_tenantId_requestKey_key" ON "OutreachCampaign"("tenantId", "requestKey");

-- CreateIndex
CREATE INDEX "OutreachSession_tenantId_customerId_control_idx" ON "OutreachSession"("tenantId", "customerId", "control");

-- CreateIndex
CREATE INDEX "OutreachSession_tenantId_conversationId_idx" ON "OutreachSession"("tenantId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSession_id_tenantId_key" ON "OutreachSession"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachSession_campaignId_customerId_key" ON "OutreachSession"("campaignId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTurn_planId_key" ON "OutreachTurn"("planId");

-- CreateIndex
CREATE INDEX "OutreachTurn_status_createdAt_idx" ON "OutreachTurn"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutreachTurn_tenantId_planId_idx" ON "OutreachTurn"("tenantId", "planId");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTurn_sessionId_sourceKey_key" ON "OutreachTurn"("sessionId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutreachTurn_planId_tenantId_key" ON "OutreachTurn"("planId", "tenantId");

-- CreateIndex
CREATE INDEX "MessagingConnection_tenantId_isDefault_idx" ON "MessagingConnection"("tenantId", "isDefault");

-- CreateIndex
CREATE INDEX "MessagingConnection_enabled_nextHealthAt_idx" ON "MessagingConnection"("enabled", "nextHealthAt");

-- CreateIndex
CREATE INDEX "OutboundDispatch_status_nextAttemptAt_idx" ON "OutboundDispatch"("status", "nextAttemptAt");

-- AddForeignKey
ALTER TABLE "MessagingReceipt" ADD CONSTRAINT "MessagingReceipt_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessageDeliveryEvent" ADD CONSTRAINT "MessageDeliveryEvent_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_listId_tenantId_fkey" FOREIGN KEY ("listId", "tenantId") REFERENCES "CustomerList"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_authorizedById_fkey" FOREIGN KEY ("authorizedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_authorizedMemberId_tenantId_fkey" FOREIGN KEY ("authorizedMemberId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSession" ADD CONSTRAINT "OutreachSession_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSession" ADD CONSTRAINT "OutreachSession_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachSession" ADD CONSTRAINT "OutreachSession_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "OutreachCampaign"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachTurn" ADD CONSTRAINT "OutreachTurn_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "RelationshipPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutreachTurn" ADD CONSTRAINT "OutreachTurn_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "OutreachSession"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
