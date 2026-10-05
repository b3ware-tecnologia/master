-- CreateEnum
CREATE TYPE "MessageDirection" AS ENUM ('INBOUND', 'OUTBOUND');

-- CreateEnum
CREATE TYPE "MessageKind" AS ENUM ('TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'DOCUMENT', 'OTHER');

-- AlterTable
ALTER TABLE "MessagingConnection" ADD COLUMN     "webhookConfiguredAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "remoteJid" TEXT NOT NULL,
    "displayName" TEXT,
    "customerId" TEXT,
    "lastMessageAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Conversation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ConversationMessage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "providerMessageId" TEXT NOT NULL,
    "direction" "MessageDirection" NOT NULL,
    "kind" "MessageKind" NOT NULL,
    "text" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConversationMessage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Conversation_tenantId_lastMessageAt_idx" ON "Conversation"("tenantId", "lastMessageAt");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_id_tenantId_key" ON "Conversation"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Conversation_connectionId_remoteJid_key" ON "Conversation"("connectionId", "remoteJid");

-- CreateIndex
CREATE INDEX "ConversationMessage_tenantId_conversationId_occurredAt_id_idx" ON "ConversationMessage"("tenantId", "conversationId", "occurredAt", "id");

-- CreateIndex
CREATE UNIQUE INDEX "ConversationMessage_connectionId_providerMessageId_key" ON "ConversationMessage"("connectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_id_tenantId_key" ON "MessagingConnection"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Conversation" ADD CONSTRAINT "Conversation_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ConversationMessage" ADD CONSTRAINT "ConversationMessage_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
