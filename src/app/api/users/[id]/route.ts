import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { contextFromRequest } from "@/lib/auth/request";
import { apiError } from "@/lib/http";
import { UserService } from "@/services/user-service";
const schema = z.object({ name: z.string().min(2).max(120).optional(), role: z.enum(["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT", "VIEWER"]).optional(), status: z.enum(["ACTIVE", "INVITED", "SUSPENDED"]).optional() }).strict();
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { const user = await new UserService().find(await contextFromRequest(request), (await params).id); return user ? NextResponse.json(user) : NextResponse.json({ error: "Resource not found" }, { status: 404 }); } catch (error) { return apiError(error); } }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { try { return NextResponse.json(await new UserService().update(await contextFromRequest(request), (await params).id, schema.parse(await request.json()))); } catch (error) { return apiError(error); } }
