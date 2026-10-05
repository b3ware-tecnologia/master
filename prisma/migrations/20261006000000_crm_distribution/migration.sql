-- CreateEnum
CREATE TYPE "CRMCaseStatus" AS ENUM ('NEW', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "CRMCase" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "conversationId" TEXT,
    "planId" TEXT,
    "createdById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "CRMCaseStatus" NOT NULL DEFAULT 'NEW',
    "version" INTEGER NOT NULL DEFAULT 0,
    "dueAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CRMCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CRMNote" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "inputHash" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CRMNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomerAssignment" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "assignedMembershipId" TEXT,
    "assignedById" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomerAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CRMCase_tenantId_status_dueAt_idx" ON "CRMCase"("tenantId", "status", "dueAt");

-- CreateIndex
CREATE INDEX "CRMCase_tenantId_customerId_idx" ON "CRMCase"("tenantId", "customerId");

-- CreateIndex
CREATE INDEX "CRMCase_tenantId_conversationId_idx" ON "CRMCase"("tenantId", "conversationId");

-- CreateIndex
CREATE UNIQUE INDEX "CRMCase_id_tenantId_key" ON "CRMCase"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "CRMCase_tenantId_requestKey_key" ON "CRMCase"("tenantId", "requestKey");

-- CreateIndex
CREATE INDEX "CRMNote_tenantId_caseId_createdAt_idx" ON "CRMNote"("tenantId", "caseId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CRMNote_tenantId_requestKey_key" ON "CRMNote"("tenantId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAssignment_customerId_key" ON "CustomerAssignment"("customerId");

-- CreateIndex
CREATE INDEX "CustomerAssignment_tenantId_teamId_idx" ON "CustomerAssignment"("tenantId", "teamId");

-- CreateIndex
CREATE INDEX "CustomerAssignment_tenantId_assignedMembershipId_idx" ON "CustomerAssignment"("tenantId", "assignedMembershipId");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerAssignment_customerId_tenantId_key" ON "CustomerAssignment"("customerId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_id_tenantId_key" ON "Membership"("id", "tenantId");

-- AddForeignKey
ALTER TABLE "CRMCase" ADD CONSTRAINT "CRMCase_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMCase" ADD CONSTRAINT "CRMCase_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMCase" ADD CONSTRAINT "CRMCase_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMCase" ADD CONSTRAINT "CRMCase_planId_tenantId_fkey" FOREIGN KEY ("planId", "tenantId") REFERENCES "RelationshipPlan"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMCase" ADD CONSTRAINT "CRMCase_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMNote" ADD CONSTRAINT "CRMNote_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMNote" ADD CONSTRAINT "CRMNote_caseId_tenantId_fkey" FOREIGN KEY ("caseId", "tenantId") REFERENCES "CRMCase"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CRMNote" ADD CONSTRAINT "CRMNote_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_customerId_tenantId_fkey" FOREIGN KEY ("customerId", "tenantId") REFERENCES "Customer"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_teamId_tenantId_fkey" FOREIGN KEY ("teamId", "tenantId") REFERENCES "Team"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_assignedMembershipId_tenantId_fkey" FOREIGN KEY ("assignedMembershipId", "tenantId") REFERENCES "Membership"("id", "tenantId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerAssignment" ADD CONSTRAINT "CustomerAssignment_assignedById_fkey" FOREIGN KEY ("assignedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
