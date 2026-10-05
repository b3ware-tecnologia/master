import { NextResponse, type NextRequest } from "next/server";
import { conversationActor } from "@/lib/conversation-http";
import { apiError } from "@/lib/http";
import { downloadMessageMedia } from "@/services/message-media-service";
export async function messageMediaRoute(request: NextRequest, platform: boolean, source: "inbox" | "crm", conversationId: string, messageId: string) {
  try {
    const result = await downloadMessageMedia(await conversationActor(request, platform), conversationId, messageId, source);
    return new NextResponse(new Uint8Array(result.bytes), { headers: { "Content-Type": result.mimeType, "Content-Length": String(result.bytes.length), "Content-Disposition": `attachment; filename="${result.fileName}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox", "Referrer-Policy": "no-referrer" } });
  } catch (error) { return apiError(error); }
}
