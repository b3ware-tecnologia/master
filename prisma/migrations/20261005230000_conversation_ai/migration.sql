-- CreateEnum
CREATE TYPE "AIExecutionStatus" AS ENUM ('QUEUED', 'RUNNING', 'COMPLETED', 'FAILED');

-- CreateTable
CREATE TABLE "AIExecution" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requesterRole" "Role" NOT NULL,
    "model" TEXT NOT NULL,
    "promptVersion" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "input" JSONB NOT NULL,
    "status" "AIExecutionStatus" NOT NULL DEFAULT 'QUEUED',
    "result" JSONB,
    "errorCode" TEXT,
    "lockToken" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIExecution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIUsage" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "inputTokens" INTEGER NOT NULL,
    "outputTokens" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AIDecision" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "executionId" TEXT NOT NULL,
    "reviewedById" TEXT NOT NULL,
    "timelineId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AIDecision_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AIExecution_status_createdAt_idx" ON "AIExecution"("status", "createdAt");

-- CreateIndex
CREATE INDEX "AIExecution_tenantId_conversationId_createdAt_idx" ON "AIExecution"("tenantId", "conversationId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "AIExecution_id_tenantId_key" ON "AIExecution"("id", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsage_executionId_key" ON "AIUsage"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "AIUsage_executionId_tenantId_key" ON "AIUsage"("executionId", "tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "AIDecision_executionId_key" ON "AIDecision"("executionId");

-- CreateIndex
CREATE UNIQUE INDEX "AIDecision_executionId_tenantId_key" ON "AIDecision"("executionId", "tenantId");

-- AddForeignKey
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_conversationId_tenantId_fkey" FOREIGN KEY ("conversationId", "tenantId") REFERENCES "Conversation"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIExecution" ADD CONSTRAINT "AIExecution_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIUsage" ADD CONSTRAINT "AIUsage_executionId_tenantId_fkey" FOREIGN KEY ("executionId", "tenantId") REFERENCES "AIExecution"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIDecision" ADD CONSTRAINT "AIDecision_executionId_tenantId_fkey" FOREIGN KEY ("executionId", "tenantId") REFERENCES "AIExecution"("id", "tenantId") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AIDecision" ADD CONSTRAINT "AIDecision_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

