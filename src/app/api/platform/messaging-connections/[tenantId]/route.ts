import { NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { apiError } from "@/lib/http";
import { checkPlatformMessagingConnection } from "@/services/messaging-connection-service";
import { controlConnection, connectionMetrics } from "@/services/messaging-control-service";
import { z } from "zod";
export async function PATCH(request: Request, { params }: { params: Promise<{ tenantId: string }> }) { try { return NextResponse.json(await controlConnection({ platformUserId: await requirePlatformAdmin(), tenantId: (await params).tenantId }, z.string().min(1).parse(new URL(request.url).searchParams.get("connectionId")), await request.json())); } catch (error) { return apiError(error); } }
export async function PUT(request: Request, { params }: { params: Promise<{ tenantId: string }> }) { try { return NextResponse.json(await connectionMetrics({ platformUserId: await requirePlatformAdmin(), tenantId: (await params).tenantId }, z.string().min(1).parse(new URL(request.url).searchParams.get("connectionId"))), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); } }

export async function POST(request: Request, { params }: { params: Promise<{ tenantId: string }> }) {
  try { return NextResponse.json(await checkPlatformMessagingConnection(await requirePlatformAdmin(), (await params).tenantId, undefined, new URL(request.url).searchParams.get("connectionId") ?? undefined), { headers: { "Cache-Control": "no-store" } }); }
  catch (error) { return apiError(error); }
}
