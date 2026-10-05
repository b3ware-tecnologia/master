import type { NextRequest } from "next/server";
import { crmRoute } from "@/lib/crm-http";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return crmRoute(request, true, "detail", (await params).id); }
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return crmRoute(request, true, "update", (await params).id); }
