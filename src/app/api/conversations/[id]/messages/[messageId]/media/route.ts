import type { NextRequest } from "next/server";
import { messageMediaRoute } from "@/lib/message-media-http";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) { const { id, messageId } = await params; return messageMediaRoute(request, false, "inbox", id, messageId); }
