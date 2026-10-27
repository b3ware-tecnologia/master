import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {conversationActor} from "@/lib/conversation-http";
import {apiError} from "@/lib/http";
import {listConversations,getConversation} from "@/services/conversation-service";
import {readStaffWebChat,replyStaffWebChat} from "@/services/web-chat-service";
import {sendHumanChatReply} from "@/services/human-chat-service";
import {controlOutreachSession} from "@/services/outreach-service";
import {enqueueCommercialJob,commercialActorId} from "@/services/commercial-service";
import {authorizeCRMActor} from "@/services/crm-service";
import {db} from "@/lib/db";
export async function chatHttp(request:NextRequest,platform:boolean){try{
  const actor=await conversationActor(request,platform);const id=request.nextUrl.searchParams.get("id");const web=request.nextUrl.searchParams.get("channel")==="web";let result:unknown;
  if(request.method==="GET"){
    if(!id){const [whatsapp,website]=await Promise.all([listConversations(actor,z.coerce.number().int().min(1).max(10000).parse(request.nextUrl.searchParams.get("page")??1)),readStaffWebChat(actor)]);result={whatsapp,website};}
    else if(web){const [chat]=await readStaffWebChat(actor,id);const opportunity=await db.opportunity.findFirst({where:{tenantId:actor.tenantId,sessionId:chat.session.id},select:{id:true}});const jobs=opportunity?await db.commercialAIJob.findMany({where:{tenantId:actor.tenantId,entityId:opportunity.id,requestedById:commercialActorId(actor),kind:"COPILOT"},orderBy:{createdAt:"desc"},take:3}):[];result={chat,opportunityId:opportunity?.id,jobs};}
    else{const history=await getConversation(actor,id);const [session,opportunity]=await Promise.all([db.outreachSession.findFirst({where:{tenantId:actor.tenantId,conversationId:id},orderBy:{createdAt:"desc"},select:{id:true,version:true,control:true,personaName:true,webChatActive:true}}),db.opportunity.findFirst({where:{tenantId:actor.tenantId,conversationId:id},select:{id:true}})]);const connection=await db.conversation.findUniqueOrThrow({where:{id},select:{connection:{select:{instanceName:true,displayName:true,displayPhone:true}}}});const jobs=opportunity?await db.commercialAIJob.findMany({where:{tenantId:actor.tenantId,entityId:opportunity.id,requestedById:commercialActorId(actor),kind:"COPILOT"},orderBy:{createdAt:"desc"},take:3}):[];result={...history,session,connection:connection.connection,opportunityId:opportunity?.id,jobs};}
  }else{
    const input=z.strictObject({action:z.enum(["take","reply","copilot"]),id:z.string().min(1).max(100),channel:z.enum(["web","whatsapp"]),input:z.unknown().optional()}).parse(await request.json());
    const detail=input.channel==="web"?(await readStaffWebChat(actor,input.id))[0]:await getConversation(actor,input.id);
    const session=input.channel==="web"&&"session" in detail?detail.session:await db.outreachSession.findFirst({where:{tenantId:actor.tenantId,conversationId:input.id},orderBy:{createdAt:"desc"}});
    if(input.action==="reply")result=input.channel==="web"?await replyStaffWebChat(actor,input.id,input.input):await sendHumanChatReply(actor,input.id,input.input);
    else if(input.action==="take"){
      if(!session)throw new Error("Conversa sem rotina vinculada.");result=await controlOutreachSession(actor,session.id,{control:"HUMAN",expectedVersion:session.version});
      if(input.channel==="whatsapp")await db.$transaction(async tx=>{await authorizeCRMActor(tx,actor,"crm.update");await tx.outreachSession.updateMany({where:{id:session.id,tenantId:actor.tenantId,control:"HUMAN"},data:{webChatActive:false,version:{increment:1}}});});
    }else{const opportunity=await db.opportunity.findFirstOrThrow({where:{tenantId:actor.tenantId,...(session?{sessionId:session.id}:{conversationId:input.id})}});result=await enqueueCommercialJob(actor,{kind:"COPILOT",entityId:opportunity.id,requestKey:crypto.randomUUID()});}
  }return NextResponse.json(result,{headers:{"Cache-Control":"private, no-store"}});
}catch(e){return apiError(e);}}
