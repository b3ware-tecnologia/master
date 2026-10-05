import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { changePlan, planActionSchema } from "@/services/relationship-plan-service";

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const context = await contextFromRequest(request); const { action } = planActionSchema.parse(await request.json()); return NextResponse.json(await changePlan(context, (await params).id, action)); } catch (error) { return apiError(error); }
}
