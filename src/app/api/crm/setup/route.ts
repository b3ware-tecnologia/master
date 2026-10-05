import type { NextRequest } from "next/server";
import { crmRoute } from "@/lib/crm-http";
export async function GET(request: NextRequest) { return crmRoute(request, false, "setup"); }
