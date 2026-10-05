import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { AuthenticationError, AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { MessagingProviderUnavailable } from "@/domain/messaging-provider";
import { AIUnavailable } from "@/domain/conversation-ai";

export function apiError(error: unknown) {
  if (error instanceof AIUnavailable) return NextResponse.json({ error: "IA indisponível. Configure a integração ou tente novamente.", code: error.code }, { status: 503, headers: { "Cache-Control": "no-store" } });
  if (error instanceof AuthenticationError) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (error instanceof AuthorizationError) return NextResponse.json({ error: "Access denied" }, { status: 403 });
  if (error instanceof NotFoundError) return NextResponse.json({ error: "Resource not found" }, { status: 404 });
  if (error instanceof ConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
  if (error instanceof MessagingProviderUnavailable) return NextResponse.json({ error: "Provedor WhatsApp indisponível. Tente novamente.", code: error.code }, { status: 502, headers: { "Cache-Control": "no-store" } });
  if (error instanceof ZodError) return NextResponse.json({ error: "Invalid request", issues: error.issues }, { status: 400 });
  return NextResponse.json({ error: "Internal server error" }, { status: 500 });
}
