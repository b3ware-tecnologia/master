import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return outboundHttp(request, false, "plan-change", (await params).id); }
