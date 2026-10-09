import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/auth/context";
import { AuthenticationError, AuthorizationError } from "@/domain/errors";
export async function requirePlatformAdminPage() {
  try { return await requirePlatformAdmin(); }
  catch (error) {
    if (error instanceof AuthenticationError) redirect("/login");
    if (error instanceof AuthorizationError) redirect("/app");
    throw error;
  }
}
