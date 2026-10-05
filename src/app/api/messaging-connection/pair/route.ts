import { NextRequest, NextResponse } from "next/server";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { pairMessagingConnection } from "@/services/messaging-connection-service";

export async function POST(request: NextRequest) {
  try { return NextResponse.json(await pairMessagingConnection(await contextFromRequest(request)), { headers: { "Cache-Control": "no-store, private" } }); }
  catch (error) { return apiError(error); }
}
