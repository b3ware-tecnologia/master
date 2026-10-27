import {operationalTenantScope} from "@/lib/company-mode";
import {runtimeAIConfiguration} from "@/integrations/openai-credential";
import {randomUUID} from "node:crypto";
import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {ConflictError,NotFoundError} from "@/domain/errors";
import {AIUnavailable} from "@/domain/conversation-ai";
import {dispatchCandidateSchema,dispatchRouteOrder,validateDispatchRanking,type DispatchCandidate} from "@/domain/dispatch";
import {fixedRelationshipPlaybook} from "@/domain/relationship-persona";
import {ensureFixedApproach} from "@/services/fixed-approach-service";
import {outreachScore} from "@/domain/commercial";
import {roleCapabilities,roleAccessScope} from "@/domain/access";
import {authorizeCRMActor,type CRMActor} from "@/services/crm-service";
import {commercialActorId} from "@/services/commercial-service";
import {configuredAIModel} from "@/integrations/ai-gateway";
import {rankDispatchCandidates} from "@/integrations/dispatch-planner";
import {recordEvent} from "@/services/events";
import {assertTestHooksAllowed} from "@/services/test-hooks";

export async function prepareDispatchRoute(actor:CRMActor,campaignId:string){
  return db.$transaction(async tx=>{
    await authorizeCRMActor(tx,actor,"plans.manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-campaign:${campaignId}`},0))`;
    const campaign=await tx.outreachCampaign.findFirst({where:{id:campaignId,tenantId:actor.tenantId},include:{playbook:true}});
    if(!campaign)throw new NotFoundError();
    if(campaign.status!=="DRAFT")throw new ConflictError("A rota só pode ser preparada antes de iniciar a rotina.");
    const fixed = await ensureFixedApproach(tx,actor.tenantId,commercialActorId(actor));
    if(campaign.playbookId!==fixed.id)await tx.outreachCampaign.update({where:{id:campaign.id},data:{playbookId:fixed.id}});
    if(await tx.outreachSession.count({where:{campaignId}}))throw new ConflictError("Esta rotina já possui contatos iniciados.");
    const old=await tx.dispatchRoute.findUnique({where:{campaignId}});
    if(old&&["QUEUED","RUNNING"].includes(old.status))throw new ConflictError("A rota já está sendo preparada.");
    const members=await tx.customerListMember.findMany({where:{tenantId:actor.tenantId,listId:campaign.listId},take:10001,orderBy:{id:"asc"},include:{customer:{include:{identifiers:{where:{type:"PHONE"}},facts:{where:{verification:"CONFIRMED",key:{in:["creditAnalysis","analise_credito","creditScore","margem_disponivel","produto_interesse","necessidade_credito"]}},take:12,orderBy:{id:"asc"}}}}}});
    if(members.length>10000)throw new ConflictError("Divida esta lista em rotinas de até 10 mil contatos.");
    const dnc=new Set((await tx.doNotContact.findMany({where:{tenantId:actor.tenantId},select:{phone:true}})).map(v=>v.phone));
    const optedOut=new Set((await tx.communicationPreference.findMany({where:{tenantId:actor.tenantId,channel:"WHATSAPP",consent:"OPTED_OUT"},select:{customerId:true}})).map(v=>v.customerId));
    const candidates:DispatchCandidate[]=[];
    for(const {customer:c} of members){
      const phones=c.identifiers.filter(v=>["IMPORTED","CONFIRMED"].includes(v.verification)&&/^[1-9]\d{9,14}$/.test(v.normalizedValue));
      if(c.status!=="ACTIVE"||phones.length!==1||dnc.has(phones[0].normalizedValue)||optedOut.has(c.id))continue;
      const score=outreachScore({validPhone:true,confirmedPhone:phones[0].verification==="CONFIRMED",hasName:!!c.fullName,previousRelationship:false,responded:!!c.lastInboundAt,lastContactAt:c.lastContactAt});
      candidates.push({id:c.id,operationalScore:score.score,facts:c.facts.map(f=>({id:f.id,key:f.key,value:f.value.slice(0,300).replace(/\b\d{11,}\b/g,"[dado omitido]")}))});
    }
    if(!candidates.length)throw new ConflictError("Nenhum contato com telefone válido disponível nesta lista. Confira os contatos e pedidos de não contato.");
    const data={status:(await runtimeAIConfiguration()).configured?"QUEUED":"WAITING_CONFIGURATION",requestedById:commercialActorId(actor),membershipId:"context" in actor?actor.context.membershipId:null,candidates,ranked:[],cursor:0,total:members.length,excluded:members.length-candidates.length,errorCode:null,lockToken:null,startedAt:null,completedAt:null};
    const route=await tx.dispatchRoute.upsert({where:{campaignId},create:{...data,tenantId:actor.tenantId,campaignId},update:{...data,version:{increment:1}}});
    await recordEvent(tx,{tenantId:actor.tenantId,actorUserId:commercialActorId(actor),action:"DISPATCH_ROUTE_REQUESTED",entityType:"DispatchRoute",entityId:route.id,metadata:{candidates:candidates.length,excluded:data.excluded}});
    return {id:route.id,status:route.status};
  },{timeout:30000});
}

export async function processDispatchPlanningBatch(generator?:typeof rankDispatchCandidates){
  assertTestHooksAllowed(!!generator);if(!(await runtimeAIConfiguration()).configured)return 0;
  await db.dispatchRoute.updateMany({where:{...(await operationalTenantScope()),status:"RUNNING",startedAt:{lt:new Date(Date.now()-180000)}},data:{status:"FAILED",lockToken:null,errorCode:"WORKER_INTERRUPTED"}});
  const jobs=await db.dispatchRoute.findMany({where:{...(await operationalTenantScope()),status:"QUEUED",campaign:{status:"DRAFT"}},take:2,orderBy:{updatedAt:"asc"}});let processed=0;
  for(const job of jobs){const token=randomUUID();
    if(!(await db.dispatchRoute.updateMany({where:{...(await operationalTenantScope()),id:job.id,status:"QUEUED",version:job.version,cursor:job.cursor},data:{status:"RUNNING",lockToken:token,startedAt:new Date(),model:configuredAIModel()}})).count)continue;
    try{
      const member=job.membershipId?await db.membership.findUniqueOrThrow({where:{id:job.membershipId}}):null;
      const actor:CRMActor=member?{tenantId:job.tenantId,context:{tenantId:job.tenantId,userId:job.requestedById,membershipId:member.id,role:member.role,accessScope:roleAccessScope[member.role],capabilities:roleCapabilities[member.role]}}:{tenantId:job.tenantId,platformUserId:job.requestedById};
      const campaign=await db.$transaction(async tx=>{await authorizeCRMActor(tx,actor,"plans.manage");return tx.outreachCampaign.findFirstOrThrow({where:{id:job.campaignId,tenantId:job.tenantId,status:"DRAFT"}});});
      const all=z.array(dispatchCandidateSchema).max(10000).parse(job.candidates);const batch=all.slice(job.cursor,job.cursor+50);
      const result=validateDispatchRanking({priorities:await (generator??rankDispatchCandidates)(batch,fixedRelationshipPlaybook.objective)},batch);
      const ranked=[...z.array(z.unknown()).parse(job.ranked),...result];const cursor=job.cursor+batch.length;
      await db.$transaction(async tx=>{
        await authorizeCRMActor(tx,actor,"plans.manage");
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`outreach-campaign:${campaign.id}`},0))`;
        if(!await tx.outreachCampaign.findFirst({where:{id:campaign.id,tenantId:job.tenantId,status:"DRAFT",version:campaign.version}}))throw new ConflictError("CAMPAIGN_CHANGED");
        await tx.dispatchRoute.updateMany({where:{id:job.id,status:"RUNNING",lockToken:token,version:job.version,cursor:job.cursor},data:{ranked:ranked as Prisma.InputJsonValue,cursor,status:cursor===all.length?"READY":"QUEUED",lockToken:null,completedAt:cursor===all.length?new Date():null}});
      });processed++;
    }catch(e){await db.dispatchRoute.updateMany({where:{...(await operationalTenantScope()),id:job.id,lockToken:token},data:{status:"FAILED",lockToken:null,errorCode:e instanceof AIUnavailable?e.code:"ACCESS_OR_CONTEXT_CHANGED"}});}
  }return processed;
}

export async function getDispatchDetail(actor:CRMActor,id:string){
  return db.$transaction(async tx=>{
    await authorizeCRMActor(tx,actor,"plans.manage");
    const campaign=await tx.outreachCampaign.findFirst({where:{id,tenantId:actor.tenantId},include:{dispatchRoute:true,list:{select:{name:true}},connection:{select:{instanceName:true}}}});if(!campaign)throw new NotFoundError();
    const [started,sent,_delivered,responses,handedOff,failed]=await Promise.all([
      tx.outreachSession.count({where:{campaignId:id}}),
      tx.outreachSession.count({where:{campaignId:id,lastSentAt:{not:null}}}),
      Promise.resolve(0),
      tx.outreachSession.count({where:{campaignId:id,respondedAt:{not:null}}}),
      tx.outreachSession.count({where:{campaignId:id,control:"HUMAN"}}),
      tx.outreachSession.count({where:{campaignId:id,turns:{some:{status:"FAILED"}}}}),
    ]);
    const initialTurns=await tx.outreachTurn.findMany({where:{tenantId:actor.tenantId,kind:"INITIAL",session:{campaignId:id},plan:{outboundDispatch:{status:"ACCEPTED",providerMessageId:{not:null}}}},select:{sessionId:true,plan:{select:{outboundDispatch:{select:{connectionId:true,providerMessageId:true}}}}}});
    const deliveries=initialTurns.length?await tx.messageDeliveryEvent.findMany({where:{tenantId:actor.tenantId,state:{in:["DELIVERED","READ"]},OR:initialTurns.map(t=>({connectionId:t.plan!.outboundDispatch!.connectionId,providerMessageId:t.plan!.outboundDispatch!.providerMessageId!}))},select:{connectionId:true,providerMessageId:true}}):[];
    const keys=new Set(deliveries.map(d=>`${d.connectionId}:${d.providerMessageId}`));
    const deliveredContacts=new Set(initialTurns.filter(t=>keys.has(`${t.plan!.outboundDispatch!.connectionId}:${t.plan!.outboundDispatch!.providerMessageId}`)).map(t=>t.sessionId)).size;
    void _delivered;
    const route=campaign.dispatchRoute;
    const ordered=route?dispatchRouteOrder(route.ranked):[];
    const preview=route?z.array(z.object({id:z.string(),priority:z.number(),reason:z.string()})).parse(route.ranked).sort((a,b)=>b.priority-a.priority||a.id.localeCompare(b.id)).slice(0,50):[];
    const customers=await tx.customer.findMany({where:{tenantId:actor.tenantId,id:{in:preview.map(v=>v.id)}},select:{id:true,fullName:true}});
    return {campaign:{id:campaign.id,name:campaign.name,status:campaign.status,version:campaign.version,list:campaign.list,connection:campaign.connection,startsAt:campaign.startsAt,endsAt:campaign.endsAt},route:route?{status:route.status,processed:route.cursor,total:route.total,eligible:z.array(z.unknown()).parse(route.candidates).length,excluded:route.excluded,model:route.model,completedAt:route.completedAt,errorCode:route.errorCode}:null,counts:{started,sent,delivered:deliveredContacts,responses,handedOff,failed,total:route?.total??await tx.customerListMember.count({where:{listId:campaign.listId,tenantId:actor.tenantId}})},preview:preview.map(v=>({...v,name:customers.find(c=>c.id===v.id)?.fullName??"Contato indisponível",position:ordered.indexOf(v.id)+1}))};
  });
}
