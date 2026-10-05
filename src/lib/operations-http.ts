import { NextResponse, type NextRequest } from "next/server";
import { conversationActor } from "@/lib/conversation-http";
import { apiError } from "@/lib/http";
import { operationsOverview } from "@/services/operations-service";
export async function overviewRoute(request: NextRequest, platform: boolean) {
  try { return NextResponse.json(await operationsOverview(await conversationActor(request, platform)), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return apiError(error); }
}
