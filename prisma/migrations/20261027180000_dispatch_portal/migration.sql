-- AlterTable
ALTER TABLE "MessagingConnection" ADD COLUMN     "displayName" TEXT,
ADD COLUMN     "displayPhone" TEXT;

-- AlterTable
ALTER TABLE "OutreachCampaign" ADD COLUMN     "connectionIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "handoffMembershipId" TEXT,
ADD COLUMN     "handoffTeamId" TEXT,
ADD COLUMN     "routeRequired" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "OutreachSession" ADD COLUMN     "connectionId" TEXT,
ADD COLUMN     "respondedAt" TIMESTAMP(3),
ADD COLUMN     "webChatActive" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DispatchRoute" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "campaignId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "requestedById" TEXT NOT NULL,
    "membershipId" TEXT,
    "candidates" JSONB NOT NULL,
    "ranked" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "excluded" INTEGER NOT NULL DEFAULT 0,
    "cursor" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 0,
    "lockToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "model" TEXT,
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DispatchRoute_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HumanReply" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HumanReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebChat" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "requestedAt" TIMESTAMP(3),
    "processedAt" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "lockToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebChat_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WebChatMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "actorId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WebChatMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DispatchRoute_campaignId_key" ON "DispatchRoute"("campaignId");

-- CreateIndex
CREATE INDEX "DispatchRoute_status_updatedAt_idx" ON "DispatchRoute"("status", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchRoute_campaignId_tenantId_key" ON "DispatchRoute"("campaignId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchRoute_id_tenantId_key" ON "DispatchRoute"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanReply_planId_key" ON "HumanReply"("planId");

-- CreateIndex
CREATE INDEX "HumanReply_tenantId_conversationId_idx" ON "HumanReply"("tenantId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "HumanReply_tenantId_requestKey_key" ON "HumanReply"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "WebChat_sessionId_key" ON "WebChat"("sessionId");

-- CreateIndex
CREATE UNIQUE INDEX "WebChat_tokenHash_key" ON "WebChat"("tokenHash");

-- CreateIndex
CREATE INDEX "WebChat_status_requestedAt_idx" ON "WebChat"("status", "requestedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebChat_sessionId_tenantId_key" ON "WebChat"("sessionId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "WebChat_id_tenantId_key" ON "WebChat"("id", "tenantId");

-- CreateIndex
CREATE INDEX "WebChatMessage_tenantId_chatId_createdAt_idx" ON "WebChatMessage"("tenantId", "chatId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "WebChatMessage_chatId_requestKey_key" ON "WebChatMessage"("chatId", "requestKey");

-- AddForeignKey
ALTER TABLE "OutreachSession" ADD CONSTRAINT "OutreachSession_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchRoute" ADD CONSTRAINT "DispatchRoute_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "OutreachCampaign"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReply" ADD CONSTRAINT "HumanReply_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HumanReply" ADD CONSTRAINT "HumanReply_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "RelationshipPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebChat" ADD CONSTRAINT "WebChat_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "OutreachSession"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WebChatMessage" ADD CONSTRAINT "WebChatMessage_chatId_tenantId_fkey" FOREIGN KEY ("chatId", "tenantId") REFERENCES "WebChat"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

