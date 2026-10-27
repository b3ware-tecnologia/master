-- AlterTable
ALTER TABLE "MessagingConnection" ADD COLUMN     "lastConnectedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "OutreachSession" ADD COLUMN     "handedOffAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "CompanyAIIntegration" (
    "tenantId" TEXT NOT NULL,
    "encryptedKey" TEXT NOT NULL,
    "keySuffix" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CompanyAIIntegration_pkey" PRIMARY KEY ("tenantId")
);

-- AddForeignKey
ALTER TABLE "CompanyAIIntegration" ADD CONSTRAINT "CompanyAIIntegration_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

UPDATE "OutreachSession" SET "handedOffAt" = COALESCE("respondedAt", "updatedAt") WHERE "control" = 'HUMAN';
