import {z} from "zod";
import type {AuthorizationContext} from "@/domain/access";
import {db} from "@/lib/db";
import {authorizeTenantMember} from "@/services/customer-scope";
import {ConflictError} from "@/domain/errors";
import {configuredEvolutionProvider} from "@/integrations/evolution-provider";
import {configureMessagingWebhook} from "@/services/messaging-webhook-configuration";
import {recordEvent} from "@/services/events";
export async function registerTenantNumber(context:AuthorizationContext,value:unknown){
  const input=z.strictObject({requestKey:z.uuid(),displayName:z.string().trim().min(2).max(80),phoneNumber:z.string().regex(/^[1-9]\d{9,14}$/).optional()}).parse(value);
  const instanceName=`bm_${context.tenantId}_${input.requestKey.replaceAll("-","")}`.slice(0,80);
  const connection=await db.$transaction(async tx=>{
    await authorizeTenantMember(tx,context,"messaging.manage");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-connection:${context.tenantId}`},0))`;
    const existing=await tx.messagingConnection.findUnique({where:{instanceName}});
    if(existing){if(existing.tenantId!==context.tenantId)throw new ConflictError("Instância indisponível.");return existing;}
    const item=await tx.messagingConnection.create({data:{tenantId:context.tenantId,instanceName,displayName:input.displayName,displayPhone:input.phoneNumber,isDefault:!await tx.messagingConnection.count({where:{tenantId:context.tenantId}})}});
    await recordEvent(tx,{tenantId:context.tenantId,actorUserId:context.userId,action:"MESSAGING_CONNECTION_REGISTERED",entityType:"MessagingConnection",entityId:item.id});return item;
  });
  await configuredEvolutionProvider().ensureInstance(connection.instanceName);
  return configureMessagingWebhook(context.tenantId,{context},connection.id);
}
