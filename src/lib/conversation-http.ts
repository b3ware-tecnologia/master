import { z } from "zod";
import type { NextRequest } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { contextFromRequest } from "@/lib/auth/request";
import type { ConversationActor } from "@/services/conversation-service";
export const conversationPageSchema = z.coerce.number().int().min(1).max(10_000);
export async function conversationActor(request: NextRequest, platform: boolean): Promise<ConversationActor> {
  if (platform) {
    const platformUserId = await requirePlatformAdmin();
    const tenantId = z.string().min(1).max(100).parse(request.nextUrl.searchParams.get("tenantId"));
    return { platformUserId, tenantId };
  }
  const context = await contextFromRequest(request);
  return { context, tenantId: context.tenantId };
}
