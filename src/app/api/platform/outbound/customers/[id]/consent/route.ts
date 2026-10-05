import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return outboundHttp(request, true, "consent", (await params).id); }
