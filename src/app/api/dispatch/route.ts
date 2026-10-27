import {NextRequest} from "next/server";import {dispatchHttp} from "@/lib/dispatch-http";
export const GET=(request:NextRequest)=>dispatchHttp(request,false);export const POST=GET;
