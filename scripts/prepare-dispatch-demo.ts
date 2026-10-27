import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import {db} from "@/lib/db";
import {createOpaqueToken,hashPassword} from "@/lib/auth/crypto";
import {ensureWebChatInvite} from "@/services/web-chat-service";
async function main(){
  assert.equal(process.env.RAILWAY_ENVIRONMENT_NAME,"staging");assert.equal(process.env.RAILWAY_PROJECT_ID,"ef26eb2e-9425-471c-a647-65d93c0b1b8a");assert.equal(process.env.CREATE_DISPATCH_DEMO,"true");assert.notEqual(process.env.WHATSAPP_OUTBOUND_ENABLED,"true");assert.notEqual(process.env.AI_OUTREACH_ENABLED,"true");
  const tenant=await db.tenant.findUniqueOrThrow({where:{slug:"demonstracao-crm-staging"}});assert.equal(tenant.name,"Demonstração CRM — dados fictícios");
  const master=await db.membership.findFirstOrThrow({where:{tenantId:tenant.id,role:"TENANT_MASTER",status:"ACTIVE"}});
  const team=await db.team.findFirstOrThrow({where:{tenantId:tenant.id,status:"ACTIVE"}});
  const playbook=await db.campaignPlaybook.findFirstOrThrow({where:{tenantId:tenant.id,status:"APPROVED"}});
  const prepared=await db.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('dispatch-demo-20261027',0))`;
    let campaign=await tx.outreachCampaign.findUnique({where:{tenantId_requestKey:{tenantId:tenant.id,requestKey:"b1d3f9cc-b68c-4afb-a242-765cae28c715"}}});
    if(!campaign){
      const connection=await tx.messagingConnection.create({data:{tenantId:tenant.id,instanceName:`demo_disabled_${randomUUID().replaceAll("-","")}`,displayName:"Demonstração — origem WhatsApp indisponível",enabled:false,lastState:"DISABLED"}});
      const list=await tx.customerList.create({data:{tenantId:tenant.id,name:"Demonstração do disparador — contatos fictícios"}});
      const contacts=[];
      for(const [i,name] of ["Helena","Rafael","Bianca"].entries()){
        const c=await tx.customer.create({data:{tenantId:tenant.id,fullName:`${name} — contato fictício`,displayName:name}});contacts.push(c);
        const phone=`1555599988${i}`;await tx.customerIdentifier.create({data:{tenantId:tenant.id,customerId:c.id,type:"PHONE",normalizedValue:phone,verification:"CONFIRMED"}});
        await tx.customerListMember.create({data:{tenantId:tenant.id,listId:list.id,customerId:c.id}});
        await tx.doNotContact.upsert({where:{tenantId_phone:{tenantId:tenant.id,phone}},create:{tenantId:tenant.id,phone,reason:"Número fictício de demonstração; nunca contatar pelo WhatsApp.",source:"DISPATCH_DEMO"},update:{}});
      }
      campaign=await tx.outreachCampaign.create({data:{tenantId:tenant.id,listId:list.id,connectionId:connection.id,connectionIds:[connection.id],name:"Demonstração — continuidade do atendimento",objective:"Demonstração fictícia do atendimento, sem envio externo.",status:"PAUSED",startsAt:new Date(),endsAt:new Date(Date.now()+30*86400000),maxContactsPerDay:1,maxTurns:3,createdById:master.userId,authorizedById:master.userId,authorizedMemberId:master.id,authorizedAt:new Date(),requestKey:"b1d3f9cc-b68c-4afb-a242-765cae28c715",inputHash:"SYNTHETIC_DEMO",playbookId:playbook.id,playbookRequired:true,routeRequired:true,handoffTeamId:team.id}});
      await tx.dispatchRoute.create({data:{tenantId:tenant.id,campaignId:campaign.id,requestedById:master.userId,membershipId:master.id,status:"READY",total:contacts.length,cursor:contacts.length,model:"SIMULATED",completedAt:new Date(),candidates:contacts.map(c=>({id:c.id,operationalScore:0,facts:[]})),ranked:contacts.map((c,i)=>({id:c.id,priority:90-i*10,reason:"Ordem fictícia para demonstração da interface. Não houve análise por IA.",evidenceIds:[]}))}});
      await tx.outreachSession.create({data:{tenantId:tenant.id,campaignId:campaign.id,customerId:contacts[0].id,connectionId:connection.id,control:"HUMAN",handoffReason:"ASSUMED_BY_TEAM",webChatActive:true,respondedAt:new Date()}});
    }
    const session=await tx.outreachSession.findFirstOrThrow({where:{campaignId:campaign.id}});
    const invitation=await ensureWebChatInvite(tx,tenant.id,session.id,"Oi, sou a Vanessa da BM Crédito. Este é um atendimento de demonstração, com dados fictícios.");
    await tx.webChatMessage.upsert({where:{chatId_requestKey:{chatId:invitation.chatId,requestKey:"demo-customer"}},create:{tenantId:tenant.id,chatId:invitation.chatId,role:"CUSTOMER",text:"Olá! Quero continuar a conversa por aqui.",requestKey:"demo-customer"},update:{}});
    await tx.webChat.update({where:{id:invitation.chatId},data:{requestedAt:new Date()}});
    await tx.opportunity.upsert({where:{sessionId:session.id},create:{tenantId:tenant.id,sessionId:session.id,campaignId:campaign.id,customerId:session.customerId,stage:"HUMAN_HANDOFF",summary:"Atendimento fictício pelo chat web, com WhatsApp de origem indisponível."},update:{}});
    return {...invitation,campaignId:campaign.id};
  });
  const password=createOpaqueToken();const operatorPassword=createOpaqueToken();
  const visual=await db.user.create({data:{name:"Verificação temporária do portal",email:`visual-${randomUUID()}@example.invalid`,status:"ACTIVE",passwordHash:await hashPassword(password)}});
  await db.membership.create({data:{tenantId:tenant.id,userId:visual.id,role:"TENANT_MASTER",status:"ACTIVE"}});
  const operator=await db.user.create({data:{name:"Verificação temporária do Admin Center",email:`visual-admin-${randomUUID()}@example.invalid`,status:"ACTIVE",passwordHash:await hashPassword(operatorPassword)}});
  await db.membership.create({data:{tenantId:tenant.id,userId:operator.id,role:"PLATFORM_ADMIN",status:"ACTIVE"}});
  await writeFile("/tmp/bm-focused-portal-qa.json",JSON.stringify({tenantId:tenant.id,userId:visual.id,email:visual.email,password,operatorId:operator.id,operatorEmail:operator.email,operatorPassword,publicChatUrl:prepared.url,campaignId:prepared.campaignId,url:process.env.APP_URL}),{mode:0o600});
  console.log(JSON.stringify({result:"PASS",tenantId:tenant.id,demoOnly:true,routeModel:"SIMULATED",whatsappDisabled:true,realMessagesSent:0}));
}
void main().catch(()=>{console.error("DISPATCH_DEMO_PREPARATION_FAILED");process.exitCode=1;}).finally(()=>db.$disconnect());
