import type { NextRequest } from "next/server";
import { overviewRoute } from "@/lib/operations-http";
export async function GET(request: NextRequest) { return overviewRoute(request, true); }
