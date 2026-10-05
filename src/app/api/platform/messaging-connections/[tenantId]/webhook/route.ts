import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { apiError } from "@/lib/http";
import { configureMessagingWebhook } from "@/services/messaging-webhook-configuration";

export async function POST(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try { return NextResponse.json(await configureMessagingWebhook((await params).tenantId, { platformUserId: await requirePlatformAdmin() }), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
