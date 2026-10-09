import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { UserService } from "@/services/user-service";
const createSchema = z.object({ name: z.string().min(2).max(120), email: z.string().email(), role: z.enum(["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT", "VIEWER"]) });
export async function GET(request: NextRequest) { try { return NextResponse.json(await new UserService().list(await contextFromRequest(request))); } catch (error) { return apiError(error); } }
export async function POST(request: NextRequest) { try { return NextResponse.json(await new UserService().invite(await contextFromRequest(request), createSchema.parse(await request.json())), { status: 201 }); } catch (error) { return apiError(error); } }
