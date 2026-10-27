import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {contextFromRequest} from "@/lib/auth/request";
import {apiError} from "@/lib/http";
import {db} from "@/lib/db";
import {authorizeTenantMember} from "@/services/customer-scope";
import {AuthorizationError,ConflictError} from "@/domain/errors";
import {operationalCompanySlug,singleCompanyMode} from "@/lib/company-mode";
import {encryptIntegrationSecret} from "@/lib/integration-secret";
import {openAICredential} from "@/integrations/openai-credential";
import {recordEvent} from "@/services/events";
async function authorize(request:NextRequest){const context=await contextFromRequest(request);await db.$transaction(async tx=>{await authorizeTenantMember(tx,context,"settings.update");if(!singleCompanyMode()||!await tx.tenant.findFirst({where:{id:context.tenantId,slug:operationalCompanySlug()}}))throw new AuthorizationError();});return context;}
const headers={"Cache-Control":"private, no-store"};
export async function GET(request:NextRequest){try{const context=await authorize(request);const saved=await db.companyAIIntegration.findUnique({where:{tenantId:context.tenantId},select:{keySuffix:true,verifiedAt:true}});return NextResponse.json({configured:!!await openAICredential(),suffix:saved?.keySuffix??null,verifiedAt:saved?.verifiedAt??null,model:"gpt-6-luna",outboundEnabled:process.env.WHATSAPP_OUTBOUND_ENABLED==="true",aiEnabled:process.env.AI_OUTREACH_ENABLED==="true"},{headers});}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{const context=await authorize(request);const input=z.discriminatedUnion("action",[z.strictObject({action:z.literal("save"),apiKey:z.string().trim().min(20).max(500).regex(/^sk-[A-Za-z0-9_-]+$/)}),z.strictObject({action:z.literal("test")})]).parse(await request.json());
  if(input.action==="save"){
    const encryptedKey=encryptIntegrationSecret(input.apiKey,context.tenantId);
    let response:Response;try{response=await fetch("https://api.openai.com/v1/models/gpt-6-luna",{headers:{Authorization:`Bearer ${input.apiKey}`},signal:AbortSignal.timeout(15000),cache:"no-store",redirect:"error"});}catch{throw new ConflictError("Não foi possível validar a chave. Tente novamente.");}
    if(!response.ok)throw new ConflictError(response.status===401||response.status===403?"A chave foi recusada ou não tem permissão para o modelo. Confira as permissões na OpenAI.":response.status===404?"O modelo GPT-6 Luna não está disponível nesta conta.":"A OpenAI não conseguiu validar a chave agora. Tente novamente.");
    await db.$transaction(async tx=>{await authorizeTenantMember(tx,context,"settings.update");await tx.companyAIIntegration.upsert({where:{tenantId:context.tenantId},create:{tenantId:context.tenantId,encryptedKey,keySuffix:input.apiKey.slice(-4),verifiedAt:new Date()},update:{encryptedKey,keySuffix:input.apiKey.slice(-4),verifiedAt:new Date()}});await recordEvent(tx,{tenantId:context.tenantId,actorUserId:context.userId,action:"OPENAI_KEY_CONFIGURED",entityType:"CompanyAIIntegration",entityId:context.tenantId});});
    return NextResponse.json({ok:true,message:"Chave validada e salva com proteção. Nenhuma rotina foi iniciada."},{headers});
  }
  const apiKey=await openAICredential();if(!apiKey)throw new ConflictError("Salve a chave da OpenAI primeiro.");
  let response:Response;try{response=await fetch("https://api.openai.com/v1/responses",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},signal:AbortSignal.timeout(30000),redirect:"error",body:JSON.stringify({model:"gpt-6-luna",store:false,reasoning:{effort:"low"},input:"Responda em português apenas: Conexão funcionando.",max_output_tokens:100})});}catch{throw new ConflictError("Não foi possível obter uma resposta da IA. Tente novamente.");}
  if(!response.ok)throw new ConflictError(response.status===429?"Confira o saldo e os limites da sua conta OpenAI.":"A OpenAI recusou o teste. Confira as permissões da chave e o saldo da conta.");
  const result=await response.json();if(result.status!=="completed")throw new ConflictError("A resposta não foi concluída. Confira o saldo e tente novamente.");
  const text=String((result.output??[]).filter((v:{type:string})=>v.type==="message").flatMap((v:{content:{type:string;text?:string}[]})=>v.content).filter((v:{type:string})=>v.type==="output_text").map((v:{text:string})=>v.text).join("")).slice(0,300);
  await db.$transaction(async tx=>{await authorizeTenantMember(tx,context,"settings.update");await recordEvent(tx,{tenantId:context.tenantId,actorUserId:context.userId,action:"OPENAI_CONNECTION_TESTED",entityType:"CompanyAIIntegration",entityId:context.tenantId,metadata:{inputTokens:result.usage?.input_tokens??0,outputTokens:result.usage?.output_tokens??0}});});return NextResponse.json({ok:true,message:text||"A OpenAI respondeu ao teste."},{headers});
}catch(e){return apiError(e);}}
