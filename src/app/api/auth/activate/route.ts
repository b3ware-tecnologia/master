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
    const invite = await db.inviteToken.findUnique({ where: { tokenHash: hashToken(input.token) } });
    if (!invite || invite.usedAt || invite.expiresAt <= new Date()) return NextResponse.json({ error: "Invalid or expired invite" }, { status: 400 });
    await db.$transaction(async (transaction) => {
      const claimed = await transaction.inviteToken.updateMany({ where: { id: invite.id, usedAt: null, expiresAt: { gt: new Date() } }, data: { usedAt: new Date() } });
      if (claimed.count !== 1) throw new ConflictError("Invalid or expired invite");
      await transaction.user.update({ where: { id: invite.userId }, data: { passwordHash: await hashPassword(input.password), status: "ACTIVE" } });
      await transaction.membership.update({ where: { userId_tenantId: { userId: invite.userId, tenantId: invite.tenantId } }, data: { status: "ACTIVE" } });
      await recordEvent(transaction, { tenantId: invite.tenantId, actorUserId: invite.userId, action: "USER_ACTIVATED", entityType: "User", entityId: invite.userId });
    });
    return NextResponse.json({ ok: true });
  } catch (error) { return apiError(error); }
}
