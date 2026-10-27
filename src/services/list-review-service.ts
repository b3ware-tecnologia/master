import {z} from "zod";
import {db} from "@/lib/db";
import type {AuthorizationContext} from "@/domain/access";
import {authorizeTenantMember} from "@/services/customer-scope";
import {lockMessagingTarget} from "@/services/messaging-locks";
import {recordEvent} from "@/services/events";
import {ConflictError,NotFoundError} from "@/domain/errors";
export async function reviewContactList(context:AuthorizationContext,listId:string,value:unknown){
  const input=z.strictObject({evidence:z.string().trim().min(10).max(1000),authorizeContact:z.boolean(),confirmAnalysis:z.boolean()}).refine(v=>v.authorizeContact||v.confirmAnalysis).parse(value);
  return db.$transaction(async tx=>{
    await authorizeTenantMember(tx,context,"plans.approve");await authorizeTenantMember(tx,context,"messaging.manage");await lockMessagingTarget(tx,context.tenantId);
    if(!await tx.customerList.findFirst({where:{id:listId,tenantId:context.tenantId,status:{not:"ARCHIVED"}}}))throw new NotFoundError();
    const members=await tx.customerListMember.findMany({where:{listId,tenantId:context.tenantId},take:10001,include:{customer:{select:{id:true,identifiers:{where:{type:"PHONE"}}}}}});if(members.length>10000)throw new ConflictError("Divida a revisão em listas de até 10 mil contatos.");
    const blocked=new Set((await tx.doNotContact.findMany({where:{tenantId:context.tenantId},select:{phone:true}})).map(v=>v.phone));
    const ids=members.filter(v=>!v.customer.identifiers.some(p=>blocked.has(p.normalizedValue))).map(v=>v.customerId);
    let authorized=0,confirmed=0;
    if(input.authorizeContact){
      const inserted=await tx.communicationPreference.createMany({data:ids.map(customerId=>({tenantId:context.tenantId,customerId,channel:"WHATSAPP" as const,consent:"OPTED_IN" as const,evidence:input.evidence,recordedById:context.userId})),skipDuplicates:true});
      const changed=await tx.communicationPreference.updateMany({where:{tenantId:context.tenantId,customerId:{in:ids},channel:"WHATSAPP",consent:"UNKNOWN"},data:{consent:"OPTED_IN",evidence:input.evidence,recordedById:context.userId}});authorized=inserted.count+changed.count;
    }
    if(input.confirmAnalysis)confirmed=(await tx.customerFact.updateMany({where:{tenantId:context.tenantId,customerId:{in:members.map(v=>v.customerId)},verification:"IMPORTED",key:{in:["creditAnalysis","analise_credito","creditScore","margem_disponivel","produto_interesse","necessidade_credito"]}},data:{verification:"CONFIRMED"}})).count;
    await recordEvent(tx,{tenantId:context.tenantId,actorUserId:context.userId,action:"CONTACT_LIST_REVIEWED",entityType:"CustomerList",entityId:listId,metadata:{authorized,confirmed,evidence:input.evidence,exclusionsPreserved:true}});return {authorized,confirmed};
  },{timeout:30000});
}
