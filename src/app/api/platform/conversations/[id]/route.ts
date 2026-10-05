import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { conversationActor, conversationPageSchema } from "@/lib/conversation-http";
import { getConversation } from "@/services/conversation-service";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return NextResponse.json(await getConversation(await conversationActor(request, true), (await params).id, conversationPageSchema.parse(request.nextUrl.searchParams.get("page") ?? 1)), { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return apiError(error); }
}
