import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { apiError } from "@/lib/http";
import { preparePlatformMessagingConnection } from "@/services/messaging-connection-service";

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try { return NextResponse.json(await preparePlatformMessagingConnection(await requirePlatformAdmin(), (await params).tenantId, undefined, new URL(request.url).searchParams.get("connectionId") ?? undefined), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
