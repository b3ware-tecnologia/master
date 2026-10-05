import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { db } from "@/lib/db";
import { createOpaqueToken, hashToken } from "@/lib/auth/crypto";
import { recordEvent } from "@/services/events";

// Trusted operator bootstrap, never exposed as an HTTP endpoint. No seeded password.
if (process.env.RAILWAY_ENVIRONMENT_NAME !== "staging" || process.env.RAILWAY_PROJECT_ID !== "ef26eb2e-9425-471c-a647-65d93c0b1b8a") throw new Error("BM Credito staging operator context required");
const email = process.env.BOOTSTRAP_ADMIN_EMAIL ? z.string().email().parse(process.env.BOOTSTRAP_ADMIN_EMAIL).trim().toLowerCase() : undefined;
const token = createOpaqueToken();
const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000);
const baseUrl = z.string().url().parse(process.env.APP_URL);
if (new URL(baseUrl).protocol !== "https:") throw new Error("HTTPS application URL required");

async function main() {
try {
  const result = await db.$transaction(async (transaction) => {
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('bm-staging-bootstrap', 0))`;
    let tenant = await transaction.tenant.findUnique({ where: { slug: "bm-credito" } });
    if (!tenant) {
      tenant = await transaction.tenant.create({ data: { name: "BM Crédito", slug: "bm-credito" } });
      await recordEvent(transaction, { tenantId: tenant.id, action: "TENANT_CREATED", entityType: "Tenant", entityId: tenant.id, metadata: { source: "railway-operator-bootstrap" }, idempotencyKey: `tenant-created:${tenant.id}` });
    }
    if (tenant.status !== "ACTIVE") throw new Error("BM Credito tenant is not active");
    if (!email) return { tenant, invitation: false };
    const currentAdmin = await transaction.membership.findFirst({ where: { role: "PLATFORM_ADMIN" }, include: { user: true } });
    if (currentAdmin) {
      if (currentAdmin.user.email !== email) throw new Error("Platform administrator already exists; use the existing administrator");
      if (currentAdmin.user.status === "ACTIVE" && currentAdmin.status === "ACTIVE") return { tenant, invitation: false };
      if (currentAdmin.user.status !== "INVITED" || currentAdmin.status !== "INVITED") throw new Error("Bootstrap cannot reactivate suspended or disabled administrators");
    }
    const existing = await transaction.user.findUnique({ where: { email }, include: { memberships: true } });
    if (existing && (existing.status !== "INVITED" || existing.memberships.some((membership) => membership.role !== "PLATFORM_ADMIN"))) throw new Error("Bootstrap cannot promote an existing tenant user");
    const user = existing ?? await transaction.user.create({ data: { email, name: "Administrador BM Crédito", status: "INVITED" } });
    await transaction.membership.upsert({ where: { userId_tenantId: { userId: user.id, tenantId: tenant.id } }, create: { userId: user.id, tenantId: tenant.id, role: "PLATFORM_ADMIN", status: "INVITED" }, update: {} });
    await transaction.inviteToken.updateMany({ where: { userId: user.id, tenantId: tenant.id, usedAt: null }, data: { usedAt: new Date() } });
    await transaction.inviteToken.create({ data: { userId: user.id, tenantId: tenant.id, tokenHash: hashToken(token), expiresAt } });
    await recordEvent(transaction, { tenantId: tenant.id, action: "PLATFORM_ADMIN_INVITED", entityType: "User", entityId: user.id, metadata: { source: "railway-operator-bootstrap" } });
    return { tenant, invitation: true };
  });
  if (result.invitation) {
    const directory = process.env.BOOTSTRAP_PRIVATE_DIRECTORY ?? ".private";
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const url = `${baseUrl.replace(/\/$/, "")}/activate#token=${encodeURIComponent(token)}`;
    await writeFile(join(directory, "bm-credito-activation.html"), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Ativar acesso BM Crédito</title><body><h1>Ativar acesso BM Crédito</h1><p>Convite de uso único, válido até ${expiresAt.toISOString()}. Defina sua própria senha.</p><p><a href="${url}" rel="noreferrer">Ativar meu acesso</a></p></body></html>`, { mode: 0o600 });
  }
  console.log(JSON.stringify({ tenantId: result.tenant.id, tenantName: result.tenant.name, invitationCreated: result.invitation, expiresAt: result.invitation ? expiresAt.toISOString() : undefined }));
} finally { await db.$disconnect(); }
}
void main().catch(() => { console.error("BM staging bootstrap failed; check operator context and existing administrator status"); process.exitCode = 1; });
