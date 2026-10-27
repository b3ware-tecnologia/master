import {operationalCompanySlug,singleCompanyMode} from "@/lib/company-mode";
import {decryptIntegrationSecret} from "@/lib/integration-secret";
export async function openAICredential(){
  if(singleCompanyMode()){
    const {db}=await import("@/lib/db");
    const configuration=await db.companyAIIntegration.findFirst({where:{tenant:{slug:operationalCompanySlug(),status:"ACTIVE"}}});
    if(configuration?.encryptedKey){if(!configuration.verifiedAt)return null;try{return decryptIntegrationSecret(configuration.encryptedKey,configuration.tenantId);}catch{return null;}}
  }
  return process.env.OPENAI_API_KEY?.trim()||null;
}
export async function runtimeAIConfiguration(){return {configured:!!await openAICredential(),model:"gpt-6-luna" as const};}
