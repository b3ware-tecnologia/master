-- CreateEnum
CREATE TYPE "CommunicationConsent" AS ENUM ('UNKNOWN', 'OPTED_IN', 'OPTED_OUT');

-- CreateTable
CREATE TABLE "CommunicationPreference" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "consent" "CommunicationConsent" NOT NULL DEFAULT 'UNKNOWN',
    "evidence" TEXT NOT NULL,
    "recordedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CommunicationPreference_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingPolicy" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "timeZone" TEXT NOT NULL,
    "startHour" INTEGER NOT NULL,
    "endHour" INTEGER NOT NULL,
    "minIntervalMinutes" INTEGER NOT NULL,
    "enabledChannels" "CommunicationChannel"[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MessagingGovernanceCheck" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "evaluatedById" TEXT NOT NULL,
    "eligible" BOOLEAN NOT NULL,
    "reasons" TEXT[],
    "policyUpdatedAt" TIMESTAMP(3),
    "consentUpdatedAt" TIMESTAMP(3),
    "planUpdatedAt" TIMESTAMP(3) NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MessagingGovernanceCheck_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "CommunicationPreference_tenantId_customerId_channel_key" ON "CommunicationPreference"("tenantId", "customerId", "channel");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingPolicy_tenantId_key" ON "MessagingPolicy"("tenantId");

-- CreateIndex
CREATE INDEX "MessagingGovernanceCheck_tenantId_planId_evaluatedAt_idx" ON "MessagingGovernanceCheck"("tenantId", "planId", "evaluatedAt");

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CommunicationPreference" ADD CONSTRAINT "CommunicationPreference_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingPolicy" ADD CONSTRAINT "MessagingPolicy_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingGovernanceCheck" ADD CONSTRAINT "MessagingGovernanceCheck_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingGovernanceCheck" ADD CONSTRAINT "MessagingGovernanceCheck_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "RelationshipPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MessagingGovernanceCheck" ADD CONSTRAINT "MessagingGovernanceCheck_evaluatedById_fkey" FOREIGN KEY ("evaluatedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
