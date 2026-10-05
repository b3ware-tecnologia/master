import type { NextRequest } from "next/server";
import { outboundHttp } from "@/lib/outbound-http";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) { return outboundHttp(request, true, "reconcile", (await params).id); }
