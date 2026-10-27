import {z} from "zod";
export async function pairingPhone(request:Request){
  if(!request.headers.get("content-type")?.includes("application/json"))return undefined;
  return z.strictObject({phoneNumber:z.string().regex(/^[1-9]\d{9,14}$/)}).parse(await request.json()).phoneNumber;
}
