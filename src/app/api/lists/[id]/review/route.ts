import {NextRequest,NextResponse} from "next/server";
import {contextFromRequest} from "@/lib/auth/request";
import {apiError} from "@/lib/http";
import {reviewContactList} from "@/services/list-review-service";
export async function POST(r:NextRequest,{params}:{params:Promise<{id:string}>}){try{return NextResponse.json(await reviewContactList(await contextFromRequest(r),(await params).id,await r.json()));}catch(e){return apiError(e);}}
