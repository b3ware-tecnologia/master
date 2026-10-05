import type { NextRequest } from "next/server";
import { crmRoute } from "@/lib/crm-http";
export async function POST(request: NextRequest) { return crmRoute(request, false, "team-create"); }
