import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return outboundHttp(request, false, "cancel", (await params).id); }
