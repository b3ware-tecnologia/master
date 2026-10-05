import type { NextRequest } from "next/server";
import { analysisRoute } from "@/lib/conversation-ai-http";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return analysisRoute(request, (await params).id, true, "SAVE"); }
