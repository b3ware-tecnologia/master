-- AlterEnum
ALTER TYPE "Role" ADD VALUE 'VIEWER';

-- AlterTable
ALTER TABLE "OutreachCampaign" ADD COLUMN     "playbookId" TEXT,
ADD COLUMN     "playbookRequired" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "CampaignPlaybook" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "instruction" TEXT NOT NULL,
    "interpretation" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignPlaybook_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Opportunity" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "campaignId" TEXT,
    "conversationId" TEXT,
    "sessionId" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'RESPONDED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '',
    "interest" TEXT,
    "productId" TEXT,
    "lastIntent" TEXT,
    "lastMessageId" TEXT,
    "handoffAt" TIMESTAMP(3),
    "humanAssignedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Opportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OpportunityTask" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'FOLLOWUP',
    "dueAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING_REVIEW',
    "sourceKey" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OpportunityTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DoNotContact" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "sourceMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DoNotContact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FinancialInstitution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FinancialInstitution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditProduct" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "institutionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditCondition" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "agreement" TEXT NOT NULL,
    "terms" JSONB NOT NULL,
    "disclosure" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 0,
    "publishedById" TEXT,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCondition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CommercialAIJob" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "membershipId" TEXT,
    "kind" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "result" JSONB,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "model" TEXT,
    "promptVersion" TEXT,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "errorCode" TEXT,
    "lockToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CommercialAIJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ChannelCadence" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "dailyLimit" INTEGER NOT NULL DEFAULT 20,
    "hourlyLimit" INTEGER NOT NULL DEFAULT 5,
    "newContactsLimit" INTEGER NOT NULL DEFAULT 10,
    "followUpLimit" INTEGER NOT NULL DEFAULT 5,
    "minIntervalSeconds" INTEGER NOT NULL DEFAULT 60,
    "days" INTEGER[] DEFAULT ARRAY[1, 2, 3, 4, 5]::INTEGER[],
    "startHour" INTEGER NOT NULL DEFAULT 9,
    "endHour" INTEGER NOT NULL DEFAULT 18,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChannelCadence_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignPlaybook_tenantId_status_idx" ON "CampaignPlaybook"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPlaybook_id_tenantId_key" ON "CampaignPlaybook"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sessionId_key" ON "Opportunity"("sessionId");

-- CreateIndex
CREATE INDEX "Opportunity_tenantId_stage_updatedAt_idx" ON "Opportunity"("tenantId", "stage", "updatedAt");

-- CreateIndex
CREATE INDEX "Opportunity_tenantId_customerId_idx" ON "Opportunity"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "Opportunity_tenantId_conversationId_idx" ON "Opportunity"("tenantId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_sessionId_tenantId_key" ON "Opportunity"("sessionId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Opportunity_id_tenantId_key" ON "Opportunity"("id", "tenantId");

-- CreateIndex
CREATE INDEX "OpportunityTask_tenantId_status_dueAt_idx" ON "OpportunityTask"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE UNIQUE INDEX "OpportunityTask_opportunityId_sourceKey_key" ON "OpportunityTask"("opportunityId", "sourceKey");

-- CreateIndex
CREATE UNIQUE INDEX "DoNotContact_tenantId_phone_key" ON "DoNotContact"("tenantId", "phone");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInstitution_id_tenantId_key" ON "FinancialInstitution"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "FinancialInstitution_tenantId_name_key" ON "FinancialInstitution"("tenantId", "name");

-- CreateIndex
CREATE INDEX "CreditProduct_tenantId_status_idx" ON "CreditProduct"("tenantId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "CreditProduct_id_tenantId_key" ON "CreditProduct"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CreditCondition_tenantId_status_validFrom_validUntil_idx" ON "CreditCondition"("tenantId", "status", "validFrom", "validUntil");

-- CreateIndex
CREATE UNIQUE INDEX "CreditCondition_id_tenantId_key" ON "CreditCondition"("id", "tenantId");

-- CreateIndex
CREATE INDEX "CommercialAIJob_status_createdAt_idx" ON "CommercialAIJob"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CommercialAIJob_tenantId_requestKey_key" ON "CommercialAIJob"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelCadence_connectionId_key" ON "ChannelCadence"("connectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ChannelCadence_connectionId_tenantId_key" ON "ChannelCadence"("connectionId", "tenantId");

-- AddForeignKey
ALTER TABLE "OutreachCampaign" ADD CONSTRAINT "OutreachCampaign_playbookId_tenantId_fkey" FOREIGN KEY ("playbookId", "tenantId") REFERENCES "CampaignPlaybook"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CampaignPlaybook" ADD CONSTRAINT "CampaignPlaybook_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_campaignId_tenantId_fkey" FOREIGN KEY ("campaignId", "tenantId") REFERENCES "OutreachCampaign"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_sessionId_tenantId_fkey" FOREIGN KEY ("sessionId", "tenantId") REFERENCES "OutreachSession"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "CreditProduct"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OpportunityTask" ADD CONSTRAINT "OpportunityTask_opportunityId_tenantId_fkey" FOREIGN KEY ("opportunityId", "tenantId") REFERENCES "Opportunity"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DoNotContact" ADD CONSTRAINT "DoNotContact_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinancialInstitution" ADD CONSTRAINT "FinancialInstitution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditProduct" ADD CONSTRAINT "CreditProduct_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditProduct" ADD CONSTRAINT "CreditProduct_institutionId_tenantId_fkey" FOREIGN KEY ("institutionId", "tenantId") REFERENCES "FinancialInstitution"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCondition" ADD CONSTRAINT "CreditCondition_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditCondition" ADD CONSTRAINT "CreditCondition_productId_tenantId_fkey" FOREIGN KEY ("productId", "tenantId") REFERENCES "CreditProduct"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommercialAIJob" ADD CONSTRAINT "CommercialAIJob_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ChannelCadence" ADD CONSTRAINT "ChannelCadence_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Data integrity complements service authorization and optimistic concurrency.
ALTER TABLE "CampaignPlaybook" ADD CONSTRAINT "CampaignPlaybook_status_check" CHECK ("status" IN ('DRAFT','INTERPRETED','APPROVED') AND "version" >= 0);
ALTER TABLE "Opportunity" ADD CONSTRAINT "Opportunity_stage_check" CHECK ("stage" IN ('IMPORTED','SCHEDULED','FIRST_CONTACT_SENT','WAITING_CUSTOMER','RESPONDED','AI_CONVERSATION','FOLLOW_UP','QUALIFIED','INTEREST_IDENTIFIED','HUMAN_HANDOFF','NEGOTIATION','WON','LOST','NOT_INTERESTED','DO_NOT_CONTACT') AND "version" >= 0);
CREATE UNIQUE INDEX "Opportunity_inbound_conversation_unique" ON "Opportunity" ("tenantId", "conversationId") WHERE "sessionId" IS NULL AND "conversationId" IS NOT NULL;
ALTER TABLE "OpportunityTask" ADD CONSTRAINT "OpportunityTask_status_check" CHECK ("status" IN ('PENDING_REVIEW','SCHEDULED','QUEUED','COMPLETED','CANCELLED') AND "version" >= 0);
ALTER TABLE "DoNotContact" ADD CONSTRAINT "DoNotContact_phone_check" CHECK ("phone" ~ '^[1-9][0-9]{9,14}$');
ALTER TABLE "FinancialInstitution" ADD CONSTRAINT "FinancialInstitution_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED') AND "source" LIKE 'https://%');
ALTER TABLE "CreditProduct" ADD CONSTRAINT "CreditProduct_status_check" CHECK ("status" IN ('ACTIVE','ARCHIVED') AND "kind" IN ('NEW_LOAN','REFINANCING','PORTABILITY','PAYROLL_CARD','BENEFIT_CARD','OTHER'));
ALTER TABLE "CreditCondition" ADD CONSTRAINT "CreditCondition_validity_check" CHECK ("status" IN ('DRAFT','PUBLISHED','ARCHIVED') AND "version" >= 0 AND "validUntil" > "validFrom" AND "source" LIKE 'https://%');
ALTER TABLE "CommercialAIJob" ADD CONSTRAINT "CommercialAIJob_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CommercialAIJob" ADD CONSTRAINT "CommercialAIJob_state_check" CHECK ("kind" IN ('PLAYBOOK','TEST_AGENT','COPILOT') AND "status" IN ('QUEUED','WAITING_CONFIGURATION','RUNNING','COMPLETED','FAILED') AND "inputTokens" >= 0 AND "outputTokens" >= 0);
ALTER TABLE "ChannelCadence" ADD CONSTRAINT "ChannelCadence_limits_check" CHECK ("dailyLimit" BETWEEN 1 AND 10000 AND "hourlyLimit" BETWEEN 1 AND 1000 AND "hourlyLimit" <= "dailyLimit" AND "newContactsLimit" BETWEEN 0 AND 10000 AND "followUpLimit" BETWEEN 0 AND 10000 AND "minIntervalSeconds" BETWEEN 10 AND 86400 AND "startHour" BETWEEN 0 AND 23 AND "endHour" BETWEEN 1 AND 24 AND "endHour" > "startHour");
