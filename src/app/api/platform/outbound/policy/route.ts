import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function PUT(request: NextRequest) { return outboundHttp(request, true, "policy"); }
