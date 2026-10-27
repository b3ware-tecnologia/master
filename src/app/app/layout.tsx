import {singleCompanyMode} from "@/lib/company-mode";
import { redirect } from "next/navigation";
import { AppShell } from "@/components/app-shell";
import { availableTenants, resolveAuthorizationContext } from "@/lib/auth/context";
import { AuthenticationError } from "@/domain/errors";

export default async function TenantLayout({ children }: { children: React.ReactNode }) {
  let context;
  try { context = await resolveAuthorizationContext(); } catch (error) { redirect(error instanceof AuthenticationError ? "/login" : "/select-company"); }
  return <AppShell singleCompany={singleCompanyMode()} capabilities={context.capabilities} tenants={await availableTenants()} selectedTenant={context.tenantId}>{children}</AppShell>;
}
