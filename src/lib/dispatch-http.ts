import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {conversationActor} from "@/lib/conversation-http";
import {apiError} from "@/lib/http";
import {listOutreach,createOutreachCampaign,changeOutreachCampaign} from "@/services/outreach-service";
import {distributionDirectory} from "@/services/crm-service";
import {prepareDispatchRoute,getDispatchDetail} from "@/services/dispatch-service";
import {db} from "@/lib/db";
export async function dispatchHttp(request:NextRequest,platform:boolean){try{
  const actor=await conversationActor(request,platform);let result:unknown;
  if(request.method==="GET"){
    const id=request.nextUrl.searchParams.get("id");
    if(id)result=await getDispatchDetail(actor,z.string().max(100).parse(id));
    else{const state=await listOutreach(actor);const teams=await distributionDirectory(actor);const routes=await db.dispatchRoute.findMany({where:{tenantId:actor.tenantId,campaignId:{in:state.campaigns.map(v=>v.id)}},select:{campaignId:true,status:true,cursor:true,total:true,model:true}});result={...state,teams,routes};}
  }else{
    const data=z.strictObject({action:z.enum(["create","prepare","start","pause","end"]),id:z.string().max(100).optional(),input:z.unknown().optional()}).parse(await request.json());
    if(data.action==="create"){z.object({handoffTeamId:z.string().min(1)}).parse(data.input);result=await createOutreachCampaign(actor,data.input as Parameters<typeof createOutreachCampaign>[1]);}
    else{const id=z.string().min(1).parse(data.id);result=data.action==="prepare"?await prepareDispatchRoute(actor,id):await changeOutreachCampaign(actor,id,{...z.object({expectedVersion:z.number().int().min(0),confirmed:z.boolean().optional()}).parse(data.input),action:data.action==="start"?"authorize":data.action});}
  }return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e);}}
