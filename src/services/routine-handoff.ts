import type {OutreachSession} from "@prisma/client";
import {db} from "@/lib/db";
import {assignCustomer,type CRMActor} from "@/services/crm-service";
export async function assignRoutineHandoff(actor:CRMActor,session:OutreachSession){
  const campaign=await db.outreachCampaign.findUniqueOrThrow({where:{id:session.campaignId}});
  if(!campaign.handoffTeamId)return;
  const current=await db.customerAssignment.findUnique({where:{customerId:session.customerId}});
  if(current?.assignedMembershipId)return;
  const members=await db.membership.findMany({where:{tenantId:session.tenantId,role:"CONSULTANT",status:"ACTIVE",...(campaign.handoffMembershipId?{id:campaign.handoffMembershipId}:{}),user:{status:"ACTIVE",teamMembers:{some:{tenantId:session.tenantId,teamId:campaign.handoffTeamId,team:{status:"ACTIVE"}}}}},orderBy:{id:"asc"},select:{id:true,_count:{select:{customerAssignments:true}}}});
  const selected=members.sort((a,b)=>a._count.customerAssignments-b._count.customerAssignments||a.id.localeCompare(b.id))[0];
  if(!selected)return;
  await assignCustomer(actor,session.customerId,{teamId:campaign.handoffTeamId,assignedMembershipId:selected.id,expectedVersion:current?.version??null});
}
