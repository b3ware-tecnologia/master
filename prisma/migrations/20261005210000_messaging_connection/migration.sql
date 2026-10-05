-- CreateTable
CREATE TABLE "MessagingConnection" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "instanceName" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'EVOLUTION',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "lastState" TEXT NOT NULL DEFAULT 'UNCHECKED',
    "lastCheckedAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MessagingConnection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_tenantId_key" ON "MessagingConnection"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "MessagingConnection_instanceName_key" ON "MessagingConnection"("instanceName");

-- AddForeignKey
ALTER TABLE "MessagingConnection" ADD CONSTRAINT "MessagingConnection_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
