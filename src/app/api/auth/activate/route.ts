import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { hashPassword, hashToken } from "@/lib/auth/crypto";
import { apiError } from "@/lib/http";
import { recordEvent } from "@/services/events";
import { ConflictError } from "@/domain/errors";

const schema = z.object({ token: z.string().min(32), password: z.string().min(12).max(200) });
export async function POST(request: NextRequest) {
  try {
    const input = schema.parse(await request.json());
    const invite = await db.inviteToken.findUnique({ where: { tokenHash: hashToken(input.token) }, include: { user: { select: { status: true } }, tenant: { select: { status: true } } } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date() || invite.user.status !== "INVITED" || invite.tenant.status !== "ACTIVE") return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    await db.$transaction(async (transaction) => {
      const claimed = await transaction.inviteToken.updateMany({ where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictError("Invalid or expired invite");
      const membership = await transaction.membership.updateMany({ where: { userId: invite.userId, tenantId: invite.tenantId, status: "INVITED", tenant: { status: "ACTIVE" } }, data: { status: "ACTIVE" } });
      if (membership.count !== 1) throw new ConflictError("Invalid or expired invite");
      const activated = await transaction.user.updateMany({ where: { id: invite.userId, status: "INVITED", passwordHash: null }, data: { passwordHash: await hashPassword(input.password), status: "ACTIVE" } });
      if (activated.count !== 1) throw new ConflictError("Invalid or expired invite");
      await recordEvent(transaction, { tenantId: invite.tenantId, actorUserId: invite.userId, action: "USER_ACTIVATED", entityType: "User", entityId: invite.userId });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
