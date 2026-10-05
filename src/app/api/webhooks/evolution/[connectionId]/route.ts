import { NextResponse } from "next/server";
import { authenticateEvolutionWebhook, receiveEvolutionWebhook } from "@/services/conversation-service";
import { readWebhookBody, WebhookRequestError } from "@/integrations/evolution-webhook";

export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ connectionId: string }> }) {
  try {
    const { connectionId } = await params;
    const token = request.headers.get("x-bm-webhook-token");
    await authenticateEvolutionWebhook(connectionId, token);
    const result = await receiveEvolutionWebhook(connectionId, token, await readWebhookBody(request));
    return NextResponse.json(result, { status: result.ignored ? 202 : 200, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    // The upstream body includes an API key; never return validation detail.
    return NextResponse.json({ error: error instanceof WebhookRequestError ? error.message : "Webhook processing failed" }, { status: error instanceof WebhookRequestError ? error.status : 500, headers: { "Cache-Control": "no-store" } });
  }
}
