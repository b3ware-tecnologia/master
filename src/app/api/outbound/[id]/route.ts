import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return outboundHttp(request, false, "detail", (await params).id); }
