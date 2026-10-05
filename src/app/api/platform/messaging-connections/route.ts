import { NextRequest, NextResponse } from "next/server";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { apiError } from "@/lib/http";
import { connectionSchema, provisionEvolutionConnection } from "@/services/messaging-connection-service";
export async function POST(request: NextRequest) { try { return NextResponse.json(await provisionEvolutionConnection(await requirePlatformAdmin(), connectionSchema.parse(await request.json())), { status: 201, headers: { "Cache-Control": "no-store" } }); } catch (error) { return apiError(error); } }
