import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { conversationActor, conversationPageSchema } from "@/lib/conversation-http";
import { listConversations } from "@/services/conversation-service";
export async function GET(request: NextRequest) {
  try { return NextResponse.json(await listConversations(await conversationActor(request, false), conversationPageSchema.parse(request.nextUrl.searchParams.get("page") ?? 1)), { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return apiError(error); }
}
