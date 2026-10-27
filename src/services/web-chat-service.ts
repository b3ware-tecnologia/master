import {createHmac,randomUUID,timingSafeEqual} from "node:crypto";
import {z} from "zod";
import type {Prisma} from "@prisma/client";
import {db} from "@/lib/db";
import {hashToken} from "@/lib/auth/crypto";
import {ConflictError,NotFoundError} from "@/domain/errors";
import {AIUnavailable} from "@/domain/conversation-ai";
import {authorizeCRMActor,type CRMActor} from "@/services/crm-service";
import {customerScope} from "@/services/customer-scope";
import {commercialActorId,currentCreditKnowledge} from "@/services/commercial-service";
import {campaignActor} from "@/services/outreach-authority";
import {aiConfiguration} from "@/integrations/ai-gateway";
import {structuredCommercialResponse,validateConciergeDecision,type ConciergeInput} from "@/integrations/credit-concierge";
import {fixedRelationshipPlaybook} from "@/domain/relationship-persona";
import {assertTestHooksAllowed} from "@/services/test-hooks";
import {lockMessagingTarget,lockCRMCustomer} from "@/services/messaging-locks";
import {registerDoNotContact} from "@/services/commercial-events";
import {recordEvent} from "@/services/events";
function invitationKey(id:string){const secret=process.env.WEB_CHAT_SECRET||process.env.AUTH_SECRET||process.env.EVOLUTION_WEBHOOK_SECRET;if(!secret||secret.length<32)throw new ConflictError("Configure a chave segura do chat web.");return createHmac("sha256",secret).update(`bm-web-chat:v1:${id}`).digest("base64url");}
export async function ensureWebChatInvite(tx:Prisma.TransactionClient,tenantId:string,sessionId:string,opening?:string){
  let chat=await tx.webChat.findUnique({where:{sessionId}});
  if(!chat){const id=randomUUID();chat=await tx.webChat.create({data:{id,tenantId,sessionId,tokenHash:hashToken(invitationKey(id)),expiresAt:new Date(Date.now()+30*86400000)}});}
  if(opening)await tx.webChatMessage.upsert({where:{chatId_requestKey:{chatId:chat.id,requestKey:"opening"}},create:{tenantId,chatId:chat.id,role:"AI",text:opening,requestKey:"opening"},update:{}});
  if(chat.tenantId!==tenantId||chat.expiresAt<=new Date())throw new ConflictError("Convite indisponível.");
  if(hashToken(invitationKey(chat.id))!==chat.tokenHash)throw new ConflictError("A chave do convite foi alterada. Reemita o convite.");
  const url=new URL(`/chat/${chat.id}`,process.env.APP_URL);if(url.protocol!=="https:"&&process.env.NODE_ENV==="production")throw new ConflictError("O chat requer HTTPS.");url.hash=`key=${invitationKey(chat.id)}`;
  return {chatId:chat.id,url:url.toString()};
}
async function publicChat(tx:Prisma.TransactionClient,id:string,key:string){
  if(!/^[A-Za-z0-9_-]{43}$/.test(key))throw new NotFoundError();
  const chat=await tx.webChat.findFirst({where:{id,expiresAt:{gt:new Date()},session:{customer:{status:"ACTIVE"},campaign:{connection:{tenant:{status:"ACTIVE"}}}}},include:{session:{include:{customer:{select:{id:true,fullName:true,identifiers:{where:{type:"PHONE"},take:1}}},campaign:{include:{playbook:true}}}}}});
  if(!chat||!timingSafeEqual(Buffer.from(hashToken(key)),Buffer.from(chat.tokenHash)))throw new NotFoundError();
  return chat;
}
export async function readPublicWebChat(id:string,key:string){return db.$transaction(async tx=>{const chat=await publicChat(tx,id,key);const phone=chat.session.customer.identifiers[0]?.normalizedValue;const org=await tx.tenant.findUniqueOrThrow({where:{id:chat.tenantId},select:{name:true,slug:true}});return {organizationName:org.slug==="demonstracao-crm-staging"?"BM Crédito":org.name,agentName:chat.session.personaName,firstName:chat.session.customer.fullName.split(" ")[0],phone:phone?`•••• ${phone.slice(-4)}`:null,control:chat.session.control,status:chat.status,messages:(await tx.webChatMessage.findMany({where:{chatId:id,tenantId:chat.tenantId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:200,select:{id:true,role:true,text:true,createdAt:true}})).reverse()};});}
const messageInput=z.strictObject({message:z.string().trim().min(1).max(2000),requestKey:z.uuid()});
export async function postPublicWebChat(id:string,key:string,value:unknown){const input=messageInput.parse(value);return db.$transaction(async tx=>{
  const before=await publicChat(tx,id,key);await lockMessagingTarget(tx,before.tenantId,before.session.customerId);const chat=await publicChat(tx,id,key);
  const previous=await tx.webChatMessage.findUnique({where:{chatId_requestKey:{chatId:id,requestKey:input.requestKey}}});if(previous){if(previous.role!=="CUSTOMER"||previous.text!==input.message)throw new ConflictError("Solicitação já usada.");return {id:previous.id};}
  if(await tx.webChatMessage.count({where:{chatId:id,createdAt:{gte:new Date(Date.now()-60000)},role:"CUSTOMER"}})>=12)throw new ConflictError("Aguarde um momento antes de enviar outra mensagem.");
  const stored=await tx.webChatMessage.create({data:{tenantId:chat.tenantId,chatId:id,role:"CUSTOMER",text:input.message,requestKey:input.requestKey}});
  await tx.opportunity.upsert({where:{sessionId:chat.sessionId},create:{tenantId:chat.tenantId,customerId:chat.session.customerId,campaignId:chat.session.campaignId,sessionId:chat.sessionId,conversationId:chat.session.conversationId,stage:"RESPONDED",summary:"Resposta recebida pelo chat web."},update:{}});
  const configured=aiConfiguration().configured;
  await tx.outreachSession.update({where:{id:chat.sessionId},data:{webChatActive:true,respondedAt:chat.session.respondedAt??new Date(),version:{increment:1},...(!configured&&chat.session.control==="AI"?{control:"HUMAN",handoffReason:"AI_HANDOFF"}:{})}});
  await tx.outreachTurn.updateMany({where:{sessionId:chat.sessionId,status:{in:["QUEUED","RUNNING","READY"]}},data:{status:"CANCELLED",lockToken:null,errorCode:"WEB_CHAT_ACTIVE"}});
  await tx.outboundDispatch.updateMany({where:{tenantId:chat.tenantId,plan:{outreachTurn:{sessionId:chat.sessionId}},status:"QUEUED"},data:{status:"CANCELLED",reasons:["WEB_CHAT_ACTIVE"],version:{increment:1}}});
  await tx.webChat.update({where:{id},data:{status:chat.session.control==="AI"&&configured?"QUEUED":"IDLE",requestedAt:new Date(),version:{increment:1},lockToken:null}});
  await recordEvent(tx,{tenantId:chat.tenantId,action:"WEB_CHAT_CUSTOMER_MESSAGE",entityType:"WebChatMessage",entityId:stored.id});return {id:stored.id};
});}
export async function readStaffWebChat(actor:CRMActor,id?:string){return db.$transaction(async tx=>{
  await authorizeCRMActor(tx,actor,"crm.read");const where={tenantId:actor.tenantId,session:{customer:"context" in actor?customerScope(actor.context):{tenantId:actor.tenantId}},messages:{some:{role:"CUSTOMER"}},...(id?{id}:{})};
  const chats=await tx.webChat.findMany({where,take:100,orderBy:{requestedAt:"desc"},select:{id:true,status:true,requestedAt:true,session:{select:{id:true,version:true,control:true,personaName:true,customerId:true,customer:{select:{fullName:true,assignment:{select:{assignedMembership:{select:{user:{select:{name:true}}}}}}}},connection:{select:{instanceName:true}},campaign:{select:{name:true}}}},...(id?{messages:{orderBy:[{createdAt:"desc"},{id:"desc"}],take:200}}:{})}});
  if(id&&!chats.length)throw new NotFoundError();return chats.map(c=>({...c,messages:c.messages?.slice().reverse()??[]}));
});}
export async function replyStaffWebChat(actor:CRMActor,id:string,value:unknown){const input=messageInput.parse(value);return db.$transaction(async tx=>{
  await authorizeCRMActor(tx,actor,"crm.update");const chat=await tx.webChat.findFirst({where:{id,tenantId:actor.tenantId,session:{customer:"context" in actor?customerScope(actor.context):{tenantId:actor.tenantId}}},include:{session:true}});if(!chat)throw new NotFoundError();
  await lockCRMCustomer(tx,actor.tenantId,chat.session.customerId);
  if(!await tx.customer.findFirst({where:{...("context" in actor?customerScope(actor.context):{tenantId:actor.tenantId}),id:chat.session.customerId}}))throw new NotFoundError();
  await lockMessagingTarget(tx,actor.tenantId,chat.session.customerId);
  if(chat.session.control==="STOPPED")throw new ConflictError("Este atendimento foi encerrado.");
  const prior=await tx.webChatMessage.findUnique({where:{chatId_requestKey:{chatId:id,requestKey:input.requestKey}}});if(prior){if(prior.role!=="HUMAN"||prior.actorId!==commercialActorId(actor)||prior.text!==input.message)throw new ConflictError("Solicitação já usada.");return prior;}
  await tx.outreachSession.update({where:{id:chat.sessionId},data:{control:"HUMAN",version:{increment:1},handoffReason:"ASSUMED_BY_TEAM"}});
  await tx.webChat.update({where:{id},data:{status:"IDLE",lockToken:null,version:{increment:1}}});
  const stored=await tx.webChatMessage.create({data:{tenantId:actor.tenantId,chatId:id,role:"HUMAN",actorId:commercialActorId(actor),text:input.message,requestKey:input.requestKey}});
  await recordEvent(tx,{tenantId:actor.tenantId,actorUserId:commercialActorId(actor),action:"WEB_CHAT_HUMAN_MESSAGE",entityType:"WebChatMessage",entityId:stored.id});return {id:stored.id};
});}
export async function processWebChatBatch(generator?:typeof structuredCommercialResponse){
  assertTestHooksAllowed(!!generator);if(!aiConfiguration().configured)return 0;
  await db.webChat.updateMany({where:{status:"RUNNING",startedAt:{lt:new Date(Date.now()-180000)}},data:{status:"FAILED",lockToken:null}});
  const jobs=await db.webChat.findMany({where:{status:"QUEUED",session:{control:"AI",webChatActive:true}},take:3});let processed=0;
  for(const job of jobs){const token=randomUUID();if(!(await db.webChat.updateMany({where:{id:job.id,status:"QUEUED",version:job.version},data:{status:"RUNNING",lockToken:token,startedAt:new Date()}})).count)continue;
    try{
      const source=await db.$transaction(async tx=>{const chat=await tx.webChat.findUniqueOrThrow({where:{id:job.id},include:{session:{include:{campaign:{include:{playbook:true}},customer:true}}}});await campaignActor(tx,chat.session.campaign);const messages=await tx.webChatMessage.findMany({where:{chatId:chat.id,tenantId:job.tenantId},orderBy:[{createdAt:"desc"},{id:"desc"}],take:30});const prior=chat.session.conversationId?await tx.conversationMessage.findMany({where:{tenantId:job.tenantId,conversationId:chat.session.conversationId},orderBy:[{occurredAt:"desc"},{id:"desc"}],take:15,select:{id:true,direction:true,kind:true,text:true}}):[];const organization=await tx.tenant.findUniqueOrThrow({where:{id:job.tenantId},select:{name:true,slug:true}});const input:ConciergeInput={agentName:chat.session.personaName,organizationName:organization.slug==="demonstracao-crm-staging"?"BM Crédito":organization.name,stage:"REPLY",objective:fixedRelationshipPlaybook.objective,customer:{firstName:chat.session.customer.fullName.split(" ")[0],facts:[]},messages:[...prior.reverse(),...messages.reverse().map(m=>({id:m.id,direction:m.role==="CUSTOMER"?"INBOUND":"OUTBOUND",kind:"TEXT",text:m.text}))],...(chat.session.campaign.playbook?{playbook:fixedRelationshipPlaybook}:{}),knowledge:await currentCreditKnowledge(tx,job.tenantId),now:new Date().toISOString()};return {chat,input};});
      const output=await(generator??structuredCommercialResponse)("CONCIERGE",source.input);const decision=validateConciergeDecision(output.result,source.input);
      await db.$transaction(async tx=>{await lockMessagingTarget(tx,job.tenantId,source.chat.session.customerId);await campaignActor(tx,source.chat.session.campaign);
        const current=await tx.webChat.findFirst({where:{id:job.id,status:"RUNNING",lockToken:token,version:job.version,session:{control:"AI",webChatActive:true,customer:{status:"ACTIVE"}}}});if(!current)return;
        const handoff=decision.handoff||["HUMAN_REQUEST","INTEREST","COMPLAINT"].includes(decision.intent);const stop=["OPT_OUT","NOT_INTERESTED","WRONG_NUMBER"].includes(decision.intent);
        if(decision.response&&!stop)await tx.webChatMessage.create({data:{tenantId:job.tenantId,chatId:job.id,role:"AI",text:decision.response,requestKey:`ai:${job.version}`}});
        if(handoff||stop)await tx.outreachSession.update({where:{id:job.sessionId},data:{control:stop?"STOPPED":"HUMAN",handoffReason:stop?"CUSTOMER_OPTED_OUT":"AI_HANDOFF",version:{increment:1}}});
        if(decision.intent==="OPT_OUT"){const phones=await tx.customerIdentifier.findMany({where:{tenantId:job.tenantId,customerId:source.chat.session.customerId,type:"PHONE"}});for(const p of phones)await registerDoNotContact(tx,job.tenantId,p.normalizedValue,"Pedido recebido no chat web.","WEB_CHAT",job.id);}
        await tx.opportunity.upsert({where:{sessionId:job.sessionId},create:{tenantId:job.tenantId,customerId:source.chat.session.customerId,campaignId:source.chat.session.campaignId,sessionId:job.sessionId,stage:decision.intent==="OPT_OUT"?"DO_NOT_CONTACT":stop?"NOT_INTERESTED":handoff?"HUMAN_HANDOFF":"AI_CONVERSATION",summary:decision.summary},update:{summary:decision.summary,stage:decision.intent==="OPT_OUT"?"DO_NOT_CONTACT":stop?"NOT_INTERESTED":handoff?"HUMAN_HANDOFF":"AI_CONVERSATION",version:{increment:1}}});
        await tx.webChat.update({where:{id:job.id},data:{status:"IDLE",lockToken:null,processedAt:new Date()}});
      });processed++;
    }catch(error){await db.outreachSession.updateMany({where:{id:job.sessionId,tenantId:job.tenantId,control:"AI"},data:{control:"HUMAN",handoffReason:"AI_HANDOFF",version:{increment:1}}});await db.webChat.updateMany({where:{id:job.id,lockToken:token},data:{status:error instanceof AIUnavailable&&error.code==="NOT_CONFIGURED"?"WAITING_CONFIGURATION":"FAILED",lockToken:null}});}
  }return processed;
}
