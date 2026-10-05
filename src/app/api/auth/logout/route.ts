import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { hashToken } from "@/lib/auth/crypto";
import { sessionCookieName, tenantCookieName } from "@/lib/auth/context";

export async function POST() {
  const token = (await cookies()).get(sessionCookieName)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(sessionCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set(tenantCookieName, "", { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
