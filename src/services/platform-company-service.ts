import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { db } from "@/lib/db";
import { AuthorizationError, ConflictError } from "@/domain/errors";
import { createOpaqueToken, hashToken } from "@/lib/auth/crypto";
import { recordEvent } from "@/services/events";
export async function assertPlatformOperator(tx: Prisma.TransactionClient, userId: string) {
  if (!await tx.user.findFirst({ where: { id: userId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE", tenant: { status: "ACTIVE" } } } } })) throw new AuthorizationError();
}
export async function listPlatformCompanies(userId: string) {
  return db.$transaction(async tx => { await assertPlatformOperator(tx,userId); return tx.tenant.findMany({ orderBy: { name: "asc" }, select: { id:true, name:true, slug:true, status:true, createdAt:true, _count:{ select:{ customers:true, memberships:true, messagingConnections:true } } } }); });
}
const createSchema = z.strictObject({ name:z.string().trim().min(2).max(160), adminName:z.string().trim().min(2).max(160), adminEmail:z.email().max(254), requestKey:z.uuid() });
export async function createPlatformCompany(userId:string, value:unknown) {
  const input=createSchema.parse(value); const email=input.adminEmail.toLowerCase(); const token=createOpaqueToken(); const expiresAt=new Date(Date.now()+48*3600000);
  return db.$transaction(async tx=>{
    await assertPlatformOperator(tx,userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`company-create:${input.requestKey}`},0))`;
    if (await tx.auditEvent.findFirst({where:{action:"PLATFORM_COMPANY_CREATED",idempotencyKey:`company:${input.requestKey}`}})) throw new ConflictError("Esta solicitação já foi concluída. Atualize a lista de empresas.");
    if (await tx.user.findUnique({where:{email}})) throw new ConflictError("Este e-mail já possui cadastro. Use um e-mail novo para o administrador inicial.");
    const tenant=await tx.tenant.create({data:{name:input.name,slug:`empresa-${randomUUID()}`}});
    const user=await tx.user.create({data:{name:input.adminName,email,status:"INVITED"}});
    await tx.membership.create({data:{tenantId:tenant.id,userId:user.id,role:"TENANT_MASTER",status:"INVITED"}});
    await tx.inviteToken.create({data:{tenantId:tenant.id,userId:user.id,tokenHash:hashToken(token),expiresAt}});
    await recordEvent(tx,{tenantId:tenant.id,actorUserId:userId,action:"PLATFORM_COMPANY_CREATED",entityType:"Tenant",entityId:tenant.id,idempotencyKey:`company:${input.requestKey}`});
    return {tenant,adminEmail:email,activationUrl:`${process.env.APP_URL}/activate#token=${encodeURIComponent(token)}`,expiresAt};
  });
}
