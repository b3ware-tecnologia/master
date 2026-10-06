import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { conversationActor } from "@/lib/conversation-http";
import { createOutreachCampaign, listOutreach } from "@/services/outreach-service";
export async function GET(request: NextRequest) { try { return NextResponse.json(await listOutreach(await conversationActor(request, false)), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await createOutreachCampaign(await conversationActor(request, false), await request.json())); } catch (error) { return apiError(error); } }
