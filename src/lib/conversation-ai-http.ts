import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { conversationActor } from "@/lib/conversation-http";
import { apiError } from "@/lib/http";
import { getConversationAnalysis, requestConversationAnalysis, saveAnalysisToCRM } from "@/services/conversation-ai-service";

export async function analysisRoute(request: NextRequest, id: string, platform: boolean, method: "GET" | "POST" | "SAVE") {
  try {
    const actor = await conversationActor(request, platform);
    const result = method === "GET" ? await getConversationAnalysis(actor, id) : method === "POST" ? await requestConversationAnalysis(actor, id) : await saveAnalysisToCRM(actor, id, z.strictObject({ executionId: z.string().min(1).max(100) }).parse(await request.json()).executionId);
    return NextResponse.json(result, { status: method === "POST" ? 202 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
