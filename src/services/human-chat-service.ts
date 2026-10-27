import {Prisma} from "@prisma/client";
import {z} from "zod";
import {db} from "@/lib/db";
import {ConflictError,NotFoundError} from "@/domain/errors";
import {authorizeCRMActor,type CRMActor} from "@/services/crm-service";
import {customerScope} from "@/services/customer-scope";
import {commercialActorId} from "@/services/commercial-service";
import {outboundPreview,requestOutbound} from "@/services/outbound-service";
import {lockMessagingTarget,lockCRMCustomer} from "@/services/messaging-locks";
export async function assertHumanReplyPlan(tx:Prisma.TransactionClient,actor:CRMActor,planId:string){
  const reply=await tx.humanReply.findUnique({where:{planId}});
  if(!reply)return false;
  await authorizeCRMActor(tx,actor,"crm.update");
  if(reply.tenantId!==actor.tenantId||reply.requestedById!==commercialActorId(actor))throw new NotFoundError();
  const conversation=await tx.conversation.findFirst({where:{id:reply.conversationId,tenantId:actor.tenantId,customer:"context" in actor?customerScope(actor.context):{tenantId:actor.tenantId},messages:{some:{direction:"INBOUND",occurredAt:{gte:new Date(Date.now()-24*3600000)}}}}});
  if(!conversation?.customerId)throw new ConflictError("A resposta exige uma conversa recebida nas últimas 24 horas.");
  const session=await tx.outreachSession.findFirst({where:{tenantId:actor.tenantId,conversationId:conversation.id,customerId:conversation.customerId},orderBy:{createdAt:"desc"}});
  if(!session||session.control!=="HUMAN"||session.webChatActive)throw new ConflictError("Assuma a conversa no canal WhatsApp antes de enviar.");
  return true;
}
export async function sendHumanChatReply(actor:CRMActor,conversationId:string,value:unknown){
  const input=z.strictObject({message:z.string().trim().min(1).max(1200),requestKey:z.uuid(),confirmed:z.literal(true)}).parse(value);
  const reply=await db.$transaction(async tx=>{
    await authorizeCRMActor(tx,actor,"crm.update");
    const old=await tx.humanReply.findUnique({where:{tenantId_requestKey:{tenantId:actor.tenantId,requestKey:input.requestKey}}});
    if(old){if(old.conversationId!==conversationId||old.message!==input.message||old.requestedById!==commercialActorId(actor))throw new ConflictError("Solicitação já usada com outros dados.");await assertHumanReplyPlan(tx,actor,old.planId);return old;}
    const conversation=await tx.conversation.findFirst({where:{id:conversationId,tenantId:actor.tenantId,customer:"context" in actor?customerScope(actor.context):{tenantId:actor.tenantId}}});if(!conversation?.customerId)throw new NotFoundError();
    await lockCRMCustomer(tx,actor.tenantId,conversation.customerId);await lockMessagingTarget(tx,actor.tenantId,conversation.customerId);
    const plan=await tx.relationshipPlan.create({data:{tenantId:actor.tenantId,customerId:conversation.customerId,createdById:commercialActorId(actor),approvedById:commercialActorId(actor),requestKey:input.requestKey,purpose:"Resposta humana na conversa",message:input.message,channel:"WHATSAPP",status:"APPROVED",approvedAt:new Date(),scheduledAt:new Date()}});
    const item=await tx.humanReply.create({data:{tenantId:actor.tenantId,conversationId,requestedById:commercialActorId(actor),requestKey:input.requestKey,message:input.message,planId:plan.id}});
    await assertHumanReplyPlan(tx,actor,plan.id);return item;
  });
  const conversation=await db.conversation.findUniqueOrThrow({where:{id:conversationId}});
  const recipient=await db.customerIdentifier.findFirst({where:{tenantId:actor.tenantId,customerId:conversation.customerId!,type:"PHONE",normalizedValue:conversation.remoteJid.split("@")[0],verification:{in:["IMPORTED","CONFIRMED"]}}});
  if(!recipient)throw new ConflictError("O telefone desta conversa não está disponível para resposta.");
  const preview=await outboundPreview(actor,reply.planId,recipient.id,undefined,conversation.connectionId);
  if(preview.existing)return preview.existing;
  if(!preview.eligible||!preview.selectedRecipientId)throw new ConflictError(`Resposta aguardando condições de envio: ${preview.reasons.join(", ")}`);
  return requestOutbound(actor,{requestKey:input.requestKey,planId:reply.planId,connectionId:conversation.connectionId,recipientIdentifierId:preview.selectedRecipientId,snapshotHash:preview.snapshotHash,confirmed:true});
}
