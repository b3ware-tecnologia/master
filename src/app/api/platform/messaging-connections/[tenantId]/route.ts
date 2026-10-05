import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { apiError } from "@/lib/http";
import { checkPlatformMessagingConnection } from "@/services/messaging-connection-service";

export async function POST(_request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try { return NextResponse.json(await checkPlatformMessagingConnection(await requirePlatformAdmin(), (await params).tenantId), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
