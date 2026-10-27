import {db} from "@/lib/db";
import type {AuthorizationContext} from "@/domain/access";
import {authorizeTenantMember,customerScope} from "@/services/customer-scope";
export async function companyKPIs(context:AuthorizationContext){return db.$transaction(async tx=>{
  await authorizeTenantMember(tx,context,"crm.read");const where={tenantId:context.tenantId,customer:customerScope(context)};
  const [sent,replied,human,contacts,numbers]=await Promise.all([
    tx.outreachSession.groupBy({by:["customerId"],where:{...where,lastSentAt:{not:null}}}),
    tx.outreachSession.groupBy({by:["customerId"],where:{...where,respondedAt:{not:null}}}),
    tx.outreachSession.groupBy({by:["customerId"],where:{...where,respondedAt:{not:null},OR:[{handedOffAt:{not:null}},{control:"HUMAN"}]}}),
    tx.customer.count({where:customerScope(context)}),
    tx.messagingConnection.count({where:{tenantId:context.tenantId,enabled:true,lastState:"OPEN"}}),
  ]);const responded=new Set(replied.map(v=>v.customerId));return {sent:sent.length,conversations:replied.length,human:human.length,noResponse:sent.filter(v=>!responded.has(v.customerId)).length,contacts,connectedNumbers:numbers,at:new Date().toISOString()};
});}
