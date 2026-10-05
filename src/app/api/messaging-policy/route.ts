import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { apiError } from "@/lib/http";
import { policySchema, saveMessagingPolicy } from "@/services/messaging-governance";
export async function GET(request: NextRequest) { try { const context = await contextFromRequest(request); requireCapability(context, "messaging.read"); return NextResponse.json(await db.messagingPolicy.findUnique({ where: { tenantId: context.tenantId } })); } catch (error) { return apiError(error); } }
export async function PUT(request: NextRequest) { try { return NextResponse.json(await saveMessagingPolicy(await contextFromRequest(request), policySchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
