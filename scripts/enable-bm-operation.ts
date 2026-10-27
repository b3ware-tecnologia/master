import assert from "node:assert/strict";
import {db} from "@/lib/db";
import {recordEvent} from "@/services/events";
async function main(){
  assert.equal(process.env.RAILWAY_PROJECT_ID,"aaead46d-3d45-4146-ae6d-ce6174222723");assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME,"production");assert.equal(process.env.ENABLE_BM_OPERATION,"true");
  const email=process.env.BM_OWNER_EMAIL?.trim().toLowerCase();assert(email&&email==="erico.andrade@b3ware.com.br");
  const result=await db.$transaction(async tx=>{
    const tenant=await tx.tenant.findUniqueOrThrow({where:{slug:"bm-credito"}});assert.equal(tenant.status,"ACTIVE");
    const owner=await tx.user.findUniqueOrThrow({where:{email}});assert.equal(owner.status,"ACTIVE");assert(owner.passwordHash);
    const membership=await tx.membership.findUniqueOrThrow({where:{userId_tenantId:{userId:owner.id,tenantId:tenant.id}}});assert.equal(membership.status,"ACTIVE");assert(["PLATFORM_ADMIN","TENANT_MASTER"].includes(membership.role));
    if(membership.role!=="TENANT_MASTER"){await tx.membership.update({where:{id:membership.id},data:{role:"TENANT_MASTER"}});await recordEvent(tx,{tenantId:tenant.id,actorUserId:owner.id,action:"BM_COMPANY_OWNER_ENABLED",entityType:"Membership",entityId:membership.id,metadata:{previousRole:membership.role,role:"TENANT_MASTER",reason:"Operação de uma empresa solicitada pelo proprietário"}});}
    let team=await tx.team.findFirst({where:{tenantId:tenant.id,status:"ACTIVE"},orderBy:{createdAt:"asc"}});if(!team)team=await tx.team.create({data:{tenantId:tenant.id,name:"Atendimento BM Crédito"}});
    await tx.messagingPolicy.upsert({where:{tenantId:tenant.id},create:{tenantId:tenant.id,timeZone:"America/Sao_Paulo",startHour:9,endHour:18,minIntervalMinutes:1440,enabledChannels:["WHATSAPP"]},update:{}});
    await tx.messagingConnection.updateMany({where:{tenantId:tenant.id,displayName:null},data:{displayName:"Atendimento BM Crédito"}});
    return {tenantId:tenant.id,ownerRole:"TENANT_MASTER",activeTeam:true,passwordPreserved:true,contacts:await tx.customer.count({where:{tenantId:tenant.id}}),activeCampaigns:await tx.outreachCampaign.count({where:{tenantId:tenant.id,status:"ACTIVE"}})};
  });console.log(JSON.stringify({result:"PASS",...result}));
}
void main().catch(()=>{console.error("BM_OPERATION_ENABLE_FAILED");process.exitCode=1;}).finally(()=>db.$disconnect());
