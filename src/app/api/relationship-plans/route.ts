import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { createPlan, createPlanSchema, listPlans } from "@/services/relationship-plan-service";

export async function GET(request: NextRequest) {
  try { const url = new URL(request.url); const page = Number(url.searchParams.get("page") ?? 1); return NextResponse.json(await listPlans(await contextFromRequest(request), url.searchParams.get("customerId") ?? undefined, Number.isSafeInteger(page) && page > 0 ? page : 1)); } catch (error) { return apiError(error); }
}
export async function POST(request: NextRequest) {
  try { return NextResponse.json(await createPlan(await contextFromRequest(request), createPlanSchema.parse(await request.json())), { status: 201 }); } catch (error) { return apiError(error); }
}
