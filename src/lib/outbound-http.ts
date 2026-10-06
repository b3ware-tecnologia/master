import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { apiError } from "@/lib/http";
import { conversationActor } from "@/lib/conversation-http";
import { outboundRequestSchema, outboundCancelSchema, outboundReconcileSchema } from "@/domain/outbound";
import { listOutbound, outboundPreview, requestOutbound, cancelOutbound, outboundDetail, reconcileOutbound } from "@/services/outbound-service";
import { createPlan, createPlanSchema, changePlan, planActionSchema } from "@/services/relationship-plan-service";
import { outboundGovernanceSetup, saveMessagingPolicy, policySchema, saveCommunicationPreference, consentSchema } from "@/services/messaging-governance";
type Operation = "list" | "preview" | "request" | "detail" | "cancel" | "reconcile" | "setup" | "policy" | "consent" | "plan-create" | "plan-change";
export async function outboundHttp(request: NextRequest, platform: boolean, operation: Operation, id?: string) {
  try {
    const actor = await conversationActor(request, platform); let result: unknown;
    switch (operation) {
      case "list": result = await listOutbound(actor); break;
      case "preview": result = await outboundPreview(actor, z.string().min(1).max(100).parse(request.nextUrl.searchParams.get("planId")), request.nextUrl.searchParams.get("recipientIdentifierId") ?? undefined, undefined, request.nextUrl.searchParams.get("connectionId") ?? undefined); break;
      case "request": result = await requestOutbound(actor, outboundRequestSchema.parse(await request.json())); break;
      case "detail": result = await outboundDetail(actor, id!); break;
      case "cancel": result = await cancelOutbound(actor, id!, outboundCancelSchema.parse(await request.json()).expectedVersion); break;
      case "reconcile": { const value = outboundReconcileSchema.parse(await request.json()); result = await reconcileOutbound(actor, id!, value.expectedVersion, value.messageId); break; }
      case "setup": result = await outboundGovernanceSetup(actor, request.nextUrl.searchParams.get("customerId") ?? undefined); break;
      case "policy": result = await saveMessagingPolicy(actor, policySchema.parse(await request.json())); break;
      case "consent": result = await saveCommunicationPreference(actor, id!, consentSchema.parse(await request.json())); break;
      case "plan-create": result = await createPlan(actor, createPlanSchema.parse(await request.json())); break;
      case "plan-change": result = await changePlan(actor, id!, planActionSchema.parse(await request.json()).action); break;
    }
    return NextResponse.json(result, { status: operation === "request" ? 202 : operation === "plan-create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
