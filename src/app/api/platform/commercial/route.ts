import { type NextRequest } from "next/server";
import { commercialRoute } from "@/lib/commercial-http";
export const GET = (request: NextRequest) => commercialRoute(request, true);
export const POST = GET;
