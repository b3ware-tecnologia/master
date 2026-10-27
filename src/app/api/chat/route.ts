import {NextRequest} from "next/server";import {chatHttp} from "@/lib/chat-http";
export const GET=(r:NextRequest)=>chatHttp(r,false);export const POST=GET;
