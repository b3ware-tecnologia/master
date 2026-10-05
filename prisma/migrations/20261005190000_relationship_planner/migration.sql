-- CreateEnum
CREATE TYPE "RelationshipPlanStatus" AS ENUM ('DRAFT', 'APPROVED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "CommunicationChannel" AS ENUM ('WHATSAPP', 'EMAIL', 'PHONE');

-- CreateTable
CREATE TABLE "RelationshipPlan" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "approvedById" TEXT,
    "requestKey" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "channel" "CommunicationChannel" NOT NULL,
    "scheduledAt" TIMESTAMP(3) NOT NULL,
    "status" "RelationshipPlanStatus" NOT NULL DEFAULT 'DRAFT',
    "approvedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RelationshipPlan_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RelationshipPlan_tenantId_status_scheduledAt_idx" ON "RelationshipPlan"("tenantId", "status", "scheduledAt");

-- CreateIndex
CREATE INDEX "RelationshipPlan_tenantId_customerId_idx" ON "RelationshipPlan"("tenantId", "customerId");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipPlan_tenantId_requestKey_key" ON "RelationshipPlan"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "RelationshipPlan_id_tenantId_key" ON "RelationshipPlan"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "RelationshipPlan" ADD CONSTRAINT "RelationshipPlan_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipPlan" ADD CONSTRAINT "RelationshipPlan_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipPlan" ADD CONSTRAINT "RelationshipPlan_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RelationshipPlan" ADD CONSTRAINT "RelationshipPlan_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
