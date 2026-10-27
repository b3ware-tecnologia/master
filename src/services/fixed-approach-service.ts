import type {Prisma} from "@prisma/client";
import {fixedRelationshipPlaybook,fixedRelationshipVersion,relationshipPersonaInstructions} from "@/domain/relationship-persona";
import {recordEvent} from "@/services/events";
export async function ensureFixedApproach(tx:Prisma.TransactionClient,tenantId:string,userId:string){
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`fixed-approach:${tenantId}:${fixedRelationshipVersion}`},0))`;
  const existing=await tx.campaignPlaybook.findUnique({where:{tenantId_systemPolicyVersion:{tenantId,systemPolicyVersion:fixedRelationshipVersion}}});
  if(existing)return existing;
  const item=await tx.campaignPlaybook.create({data:{tenantId,name:"Abordagem padrão de relacionamento",systemPolicyVersion:fixedRelationshipVersion,instruction:relationshipPersonaInstructions,interpretation:fixedRelationshipPlaybook,status:"APPROVED",version:1,createdById:userId,approvedById:userId,approvedAt:new Date()}});
  await recordEvent(tx,{tenantId,actorUserId:userId,action:"FIXED_APPROACH_INSTALLED",entityType:"CampaignPlaybook",entityId:item.id,metadata:{version:fixedRelationshipVersion}});return item;
}
