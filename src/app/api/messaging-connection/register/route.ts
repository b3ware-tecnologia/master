import {NextRequest,NextResponse} from "next/server";
import {contextFromRequest} from "@/lib/auth/request";
import {apiError} from "@/lib/http";
import {registerTenantNumber} from "@/services/tenant-number-service";
export async function POST(request:NextRequest){try{return NextResponse.json(await registerTenantNumber(await contextFromRequest(request),await request.json()));}catch(e){return apiError(e);}}
