import {NextRequest,NextResponse} from "next/server";
import {requirePlatformAdmin} from "@/lib/auth/context";
import {apiError} from "@/lib/http";
import {listPlatformCompanies,createPlatformCompany} from "@/services/platform-company-service";
export async function GET(){try{return NextResponse.json(await listPlatformCompanies(await requirePlatformAdmin()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
export async function POST(request:NextRequest){try{return NextResponse.json(await createPlatformCompany(await requirePlatformAdmin(),await request.json()),{headers:{"Cache-Control":"private, no-store"}});}catch(e){return apiError(e);}}
