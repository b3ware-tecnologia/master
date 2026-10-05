import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { checkMessagingConnection, getMessagingConnection } from "@/services/messaging-connection-service";
export async function GET(request: NextRequest) { try { return NextResponse.json(await getMessagingConnection(await contextFromRequest(request))); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await checkMessagingConnection(await contextFromRequest(request))); } catch (error) { return apiError(error); } }
