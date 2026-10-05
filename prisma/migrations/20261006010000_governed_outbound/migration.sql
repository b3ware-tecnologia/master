-- CreateEnum
CREATE TYPE "OutboundStatus" AS ENUM ('QUEUED', 'SENDING', 'ACCEPTED', 'BLOCKED', 'UNCERTAIN', 'CANCELLED');

-- CreateTable
CREATE TABLE "OutboundDispatch" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "connectionId" TEXT NOT NULL,
    "recipientIdentifierId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestedMembershipId" TEXT,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "snapshotHash" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "status" "OutboundStatus" NOT NULL DEFAULT 'QUEUED',
    "version" INTEGER NOT NULL DEFAULT 0,
    "reasons" TEXT[],
    "claimToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "providerMessageId" TEXT,
    "reconciledMessageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OutboundDispatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "OutboundDispatch_planId_key" ON "OutboundDispatch"("planId");

-- CreateIndex
CREATE INDEX "OutboundDispatch_status_createdAt_idx" ON "OutboundDispatch"("status", "createdAt");

-- CreateIndex
CREATE INDEX "OutboundDispatch_tenantId_customerId_status_idx" ON "OutboundDispatch"("tenantId", "customerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundDispatch_tenantId_requestKey_key" ON "OutboundDispatch"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundDispatch_planId_tenantId_key" ON "OutboundDispatch"("planId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "OutboundDispatch_connectionId_providerMessageId_key" ON "OutboundDispatch"("connectionId", "providerMessageId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerIdentifier_id_tenantId_key" ON "CustomerIdentifier"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "RelationshipPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_connectionId_tenantId_fkey" FOREIGN KEY ("connectionId", "tenantId") REFERENCES "MessagingConnection"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_recipientIdentifierId_tenantId_fkey" FOREIGN KEY ("recipientIdentifierId", "tenantId") REFERENCES "CustomerIdentifier"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OutboundDispatch" ADD CONSTRAINT "OutboundDispatch_requestedMembershipId_tenantId_fkey" FOREIGN KEY ("requestedMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;
