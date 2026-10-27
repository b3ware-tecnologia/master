-- AlterTable
ALTER TABLE "OutreachSession" ADD COLUMN     "personaName" TEXT NOT NULL DEFAULT 'Vanessa';

-- AlterTable
ALTER TABLE "CampaignPlaybook" ADD COLUMN     "systemPolicyVersion" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "CampaignPlaybook_tenantId_systemPolicyVersion_key" ON "CampaignPlaybook"("tenantId", "systemPolicyVersion");

