import { NextRequest, NextResponse } from "next/server";
import { apiError } from "@/lib/http";
import { conversationActor } from "@/lib/conversation-http";
import { changeOutreachCampaign } from "@/services/outreach-service";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await changeOutreachCampaign(await conversationActor(request, false), (await params).id, await request.json())); } catch (error) { return apiError(error); } }
