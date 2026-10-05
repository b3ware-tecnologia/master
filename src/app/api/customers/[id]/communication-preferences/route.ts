import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { requireCapability } from "@/lib/auth/context";
import { db } from "@/lib/db";
import { NotFoundError } from "@/domain/errors";
import { apiError } from "@/lib/http";
import { consentSchema, saveCommunicationPreference } from "@/services/messaging-governance";
type Params = { params: Promise<{ id: string }> };
export async function GET(request: NextRequest, { params }: Params) { try { const context = await contextFromRequest(request); requireCapability(context, "messaging.read"); const id = (await params).id; if (!await db.customer.findFirst({ where: { id, tenantId: context.tenantId } })) throw new NotFoundError(); return NextResponse.json(await db.communicationPreference.findMany({ where: { customerId: id, tenantId: context.tenantId } })); } catch (error) { return apiError(error); } }
export async function PUT(request: NextRequest, { params }: Params) { try { return NextResponse.json(await saveCommunicationPreference(await contextFromRequest(request), (await params).id, consentSchema.parse(await request.json()))); } catch (error) { return apiError(error); } }
