import assert from "node:assert/strict";
import {writeFile,mkdir,readFile} from "node:fs/promises";
import {join} from "node:path";
import {db} from "@/lib/db";
import {createOpaqueToken,hashToken} from "@/lib/auth/crypto";
import {localRuntimeEnabled,localNoAuthEnabled} from "@/lib/local-runtime";
import {recordEvent} from "@/services/events";
async function main(){
assert(localRuntimeEnabled());const database=new URL(process.env.DATABASE_URL!);assert.equal(database.hostname,"127.0.0.1");assert.equal(database.port,"55432");assert.equal(database.pathname,"/bm_credito");const base=new URL(process.env.APP_URL!);assert.equal(base.hostname,"127.0.0.1");assert.equal(base.port,"3020");
let token=createOpaqueToken();let expiresAt=new Date(Date.now()+48*3600000);let reusedInvite=false;
try{const saved=JSON.parse(await readFile(join(process.cwd(),".private/local-runtime/owner-activation.json"),"utf8"));const candidate=new URLSearchParams(new URL(saved.url).hash.slice(1)).get("token");if(candidate){const invite=await db.inviteToken.findUnique({where:{tokenHash:hashToken(candidate)},include:{tenant:true,user:true}});if(invite&&!invite.usedAt&&invite.expiresAt>new Date()&&invite.user.email==="erico.andrade@b3ware.com.br"&&invite.tenant.slug==="bm-credito"){token=candidate;expiresAt=invite.expiresAt;reusedInvite=true;}}}catch{/* A missing or expired file is replaced with a fresh owner invitation. */}
const result=await db.$transaction(async tx=>{
 await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('bm-local-owner',0))`;
 const tenant=await tx.tenant.upsert({where:{slug:"bm-credito"},create:{name:"BM Crédito",slug:"bm-credito"},update:{}});assert.equal(tenant.status,"ACTIVE");
 let owner=await tx.user.findUnique({where:{email:"erico.andrade@b3ware.com.br"}});if(!owner)owner=await tx.user.create({data:{email:"erico.andrade@b3ware.com.br",name:"Érico Andrade",status:localNoAuthEnabled()?"ACTIVE":"INVITED"}});assert(["INVITED","ACTIVE"].includes(owner.status));
 if(localNoAuthEnabled()&&owner.status==="INVITED"&&!owner.passwordHash){owner=await tx.user.update({where:{id:owner.id},data:{status:"ACTIVE"}});await tx.inviteToken.updateMany({where:{userId:owner.id,tenantId:tenant.id,usedAt:null},data:{usedAt:new Date()}});}
 if(!localNoAuthEnabled()&&owner.status==="ACTIVE"&&!owner.passwordHash)owner=await tx.user.update({where:{id:owner.id},data:{status:"INVITED"}});
 const currentMembership=await tx.membership.findUnique({where:{userId_tenantId:{userId:owner.id,tenantId:tenant.id}}});if(currentMembership){assert.equal(currentMembership.role,"TENANT_MASTER");assert(["ACTIVE","INVITED"].includes(currentMembership.status));}
 const membership=await tx.membership.upsert({where:{userId_tenantId:{userId:owner.id,tenantId:tenant.id}},create:{userId:owner.id,tenantId:tenant.id,role:"TENANT_MASTER",status:owner.status==="ACTIVE"?"ACTIVE":"INVITED"},update:{status:owner.status==="ACTIVE"?"ACTIVE":"INVITED"}});assert.equal(membership.role,"TENANT_MASTER");
 if(!await tx.team.findFirst({where:{tenantId:tenant.id,status:"ACTIVE"}}))await tx.team.create({data:{tenantId:tenant.id,name:"Atendimento BM Crédito"}});
 await tx.messagingPolicy.upsert({where:{tenantId:tenant.id},create:{tenantId:tenant.id,timeZone:"America/Sao_Paulo",startHour:9,endHour:18,minIntervalMinutes:1440,enabledChannels:["WHATSAPP"]},update:{}});
 if(owner.status==="INVITED"&&!reusedInvite){await tx.inviteToken.updateMany({where:{tenantId:tenant.id,userId:owner.id,usedAt:null},data:{usedAt:new Date()}});await tx.inviteToken.create({data:{tenantId:tenant.id,userId:owner.id,tokenHash:hashToken(token),expiresAt}});await recordEvent(tx,{tenantId:tenant.id,action:"LOCAL_OWNER_INVITED",entityType:"User",entityId:owner.id});}
 return {tenantId:tenant.id,invitation:owner.status==="INVITED"};
});
const directory=join(process.cwd(),".private/local-runtime");await mkdir(directory,{recursive:true});if(result.invitation)await writeFile(join(directory,"owner-activation.json"),JSON.stringify({url:new URL(`/activate#token=${token}`,base).toString(),expiresAt:expiresAt.toISOString()}),{mode:0o600});console.log(JSON.stringify({result:"PASS",localOnly:true,...result}));
}
void main().catch(()=>{console.error("LOCAL_BOOTSTRAP_FAILED");process.exitCode=1;}).finally(()=>db.$disconnect());
