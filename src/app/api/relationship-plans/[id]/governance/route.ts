import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { checkPlanGovernance } from "@/services/messaging-governance";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await checkPlanGovernance(await contextFromRequest(request), (await params).id)); } catch (error) { return apiError(error); } }
