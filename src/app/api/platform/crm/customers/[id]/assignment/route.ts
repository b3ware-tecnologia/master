import type { NextRequest } from "next/server";
import { crmRoute } from "@/lib/crm-http";
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return crmRoute(request, true, "assign", (await params).id); }
