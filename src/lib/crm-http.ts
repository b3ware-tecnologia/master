import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { conversationActor } from "@/lib/conversation-http";
import { apiError } from "@/lib/http";
import { crmPageSchema, createCaseSchema, caseActionSchema, assignmentSchema, linkCustomerSchema, createCRMCustomerSchema, crmTeamSchema, crmInviteSchema, crmTeamMemberSchema } from "@/domain/crm";
import { listCRMCases, createCRMCase, getCRMCase, changeCRMCase, searchCRMCustomers, createCRMCustomer, distributionDirectory, assignCustomer, linkConversationCustomer, crmSetupDirectory, createCRMTeam, inviteCRMUser, addCRMTeamMember } from "@/services/crm-service";

export type CRMOperation = "list" | "create" | "detail" | "update" | "customers" | "customer-create" | "directory" | "assign" | "link" | "setup" | "team-create" | "invite" | "team-member";
export async function crmRoute(request: NextRequest, platform: boolean, operation: CRMOperation, id?: string) {
  try {
    const actor = await conversationActor(request, platform);
    let result;
    switch (operation) {
      case "list": result = await listCRMCases(actor, crmPageSchema.parse(request.nextUrl.searchParams.get("page") ?? 1), z.enum(["OPEN", "NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"]).optional().parse(request.nextUrl.searchParams.get("status") ?? undefined), { due: request.nextUrl.searchParams.get("due") ?? undefined, q: request.nextUrl.searchParams.get("q") ?? undefined }); break;
      case "create": result = await createCRMCase(actor, createCaseSchema.parse(await request.json())); break;
      case "detail": result = await getCRMCase(actor, id!); break;
      case "update": result = await changeCRMCase(actor, id!, caseActionSchema.parse(await request.json())); break;
      case "customers": result = await searchCRMCustomers(actor, request.nextUrl.searchParams.get("q") ?? ""); break;
      case "customer-create": result = await createCRMCustomer(actor, createCRMCustomerSchema.parse(await request.json())); break;
      case "directory": result = await distributionDirectory(actor); break;
      case "assign": result = await assignCustomer(actor, id!, assignmentSchema.parse(await request.json())); break;
      case "link": result = await linkConversationCustomer(actor, id!, linkCustomerSchema.parse(await request.json()).customerId); break;
      case "setup": result = await crmSetupDirectory(actor); break;
      case "team-create": result = await createCRMTeam(actor, crmTeamSchema.parse(await request.json())); break;
      case "invite": result = await inviteCRMUser(actor, crmInviteSchema.parse(await request.json())); break;
      case "team-member": result = await addCRMTeamMember(actor, crmTeamMemberSchema.parse(await request.json())); break;
    }
    return NextResponse.json(result, { status: operation === "create" || operation === "customer-create" ? 201 : 200, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return apiError(error); }
}
