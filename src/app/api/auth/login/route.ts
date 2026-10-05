import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getRedis } from "@/lib/redis";
import { createOpaqueToken, hashToken, verifyPassword } from "@/lib/auth/crypto";
import { sessionCookieName, tenantCookieName } from "@/lib/auth/context";
import { logger } from "@/lib/logger";
import { apiError } from "@/lib/http";

const inputSchema = z.object({ email: z.string().email(), password: z.string().min(12).max(200) });

export async function POST(request: NextRequest) {
  try {
    const input = inputSchema.parse(await request.json());
    const email = input.email.trim().toLowerCase();
    const key = `login:${hashToken(`${request.headers.get("x-forwarded-for") ?? "unknown"}:${email}`)}`;
    const attempts = await getRedis().incr(key);
    if (attempts === 1) await getRedis().expire(key, 900);
    if (attempts > 10) return NextResponse.json({ error: "Invalid credentials" }, { status: 429 });
    const user = await db.user.findUnique({ where: { email }, include: { memberships: { select: { role: true, status: true, tenantId: true, tenant: { select: { status: true } } } } } });
    if (!user?.passwordHash || user.status !== "ACTIVE" || !await verifyPassword(input.password, user.passwordHash)) {
      logger.warn({ event: "auth_failure" });
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }
    const token = createOpaqueToken();
    const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000);
    await db.$transaction([db.session.deleteMany({ where: { userId: user.id } }), db.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt } })]);
    await getRedis().del(key);
    logger.info({ event: "auth_success", userId: user.id });
    const active = user.memberships.filter((membership) => membership.status === "ACTIVE" && membership.tenant.status === "ACTIVE");
    const isPlatformAdmin = active.some((membership) => membership.role === "PLATFORM_ADMIN");
    const tenantMemberships = active.filter((membership) => membership.role !== "PLATFORM_ADMIN");
    const response = NextResponse.json({ ok: true, redirectTo: isPlatformAdmin ? "/platform" : tenantMemberships.length === 1 ? "/app" : "/select-company" });
    response.cookies.set(sessionCookieName, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", expires: expiresAt });
    response.cookies.set(tenantCookieName, tenantMemberships.length === 1 ? tenantMemberships[0].tenantId : "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: tenantMemberships.length === 1 ? 8 * 3600 : 0 });
    return response;
  } catch (error) { return apiError(error); }
}
