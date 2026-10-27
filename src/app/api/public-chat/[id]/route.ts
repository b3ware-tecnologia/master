import {NextRequest,NextResponse} from "next/server";
import {z} from "zod";
import {readPublicWebChat,postPublicWebChat} from "@/services/web-chat-service";
import {apiError} from "@/lib/http";
import {getRedis} from "@/lib/redis";
import {hashToken} from "@/lib/auth/crypto";
async function access(request:NextRequest,id:string){
  z.uuid().parse(id);const key=request.headers.get("x-chat-key")??"";
  const origin=request.headers.get("origin");if(origin&&origin!==new URL(process.env.APP_URL!).origin)throw new Error("Invalid origin");
  const rateKey=`web-chat:${hashToken(id+":"+(request.headers.get("x-forwarded-for")??"unknown"))}`;
  const count=await getRedis().incr(rateKey);if(count===1)await getRedis().expire(rateKey,60);return {key,limited:count>60};
}
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const gate=await access(request,id);if(gate.limited)return NextResponse.json({error:"Aguarde um momento."},{status:429});return NextResponse.json(await readPublicWebChat(id,gate.key),{headers:{"Cache-Control":"private, no-store","Referrer-Policy":"no-referrer"}});}catch(e){return apiError(e);}}
export async function POST(request:NextRequest,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;const gate=await access(request,id);if(gate.limited)return NextResponse.json({error:"Aguarde um momento."},{status:429});return NextResponse.json(await postPublicWebChat(id,gate.key,await request.json()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
