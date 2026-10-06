import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { checkMessagingConnection, getMessagingConnection } from "@/services/messaging-connection-service";
import { controlConnection, connectionMetrics } from "@/services/messaging-control-service";
import { z } from "zod";
export async function PATCH(request: NextRequest) { try { const context = await contextFromRequest(request); const id = z.string().min(1).parse(request.nextUrl.searchParams.get("connectionId")); return NextResponse.json(await controlConnection({ context, tenantId: context.tenantId }, id, await request.json())); } catch (error) { return apiError(error); } }
export async function PUT(request: NextRequest) { try { const context = await contextFromRequest(request); const id = z.string().min(1).parse(request.nextUrl.searchParams.get("connectionId")); return NextResponse.json(await connectionMetrics({ context, tenantId: context.tenantId }, id), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); } }
export async function GET(request: NextRequest) { try { return NextResponse.json(await getMessagingConnection(await contextFromRequest(request), request.nextUrl.searchParams.get("connectionId") ?? undefined)); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await checkMessagingConnection(await contextFromRequest(request), undefined, request.nextUrl.searchParams.get("connectionId") ?? undefined)); } catch (error) { return apiError(error); } }
