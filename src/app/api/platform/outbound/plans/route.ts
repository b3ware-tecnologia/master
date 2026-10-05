import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function POST(request: NextRequest) { return outboundHttp(request, true, "plan-create"); }
