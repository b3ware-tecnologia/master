import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import type { Capability } from "@/domain/access";
import { AuthorizationError, ConflictError, NotFoundError } from "@/domain/errors";
import { assignmentSchema, caseActionSchema, createCaseSchema, createCRMCustomerSchema, crmTeamSchema, crmInviteSchema, crmTeamMemberSchema, transitions } from "@/domain/crm";
import { db } from "@/lib/db";
import type { ConversationActor } from "@/services/conversation-service";
import { authorizeTenantMember, customerScope } from "@/services/customer-scope";
import { recordEvent } from "@/services/events";
import { recordObservedContact } from "@/services/observed-contact";
import { createOpaqueToken, hashToken } from "@/lib/auth/crypto";

export type CRMActor = ConversationActor;
function actorId(actor: CRMActor) { return "context" in actor ? actor.context.userId : actor.platformUserId; }
function hash(input: unknown) { return createHash("sha256").update(JSON.stringify(input)).digest("hex"); }
async function authorize(transaction: Prisma.TransactionClient, actor: CRMActor, capability: Capability) {
  if ("context" in actor) {
    if (actor.context.tenantId !== actor.tenantId) throw new AuthorizationError();
    await authorizeTenantMember(transaction, actor.context, capability);
  } else {
    if (!await transaction.user.findFirst({ where: { id: actor.platformUserId, status: "ACTIVE", memberships: { some: { role: "PLATFORM_ADMIN", status: "ACTIVE", tenant: { status: "ACTIVE" } } } } })) throw new AuthorizationError();
    if (!await transaction.tenant.findFirst({ where: { id: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError();
  }
}
function scopedCustomer(actor: CRMActor): Prisma.CustomerWhereInput { return "context" in actor ? customerScope(actor.context) : { tenantId: actor.tenantId }; }
function scopedCase(actor: CRMActor): Prisma.CRMCaseWhereInput { return { tenantId: actor.tenantId, customer: scopedCustomer(actor) }; }
const assignmentSelect = { id: true, version: true, teamId: true, assignedMembershipId: true, team: { select: { name: true } }, assignedMembership: { select: { user: { select: { name: true } } } } } satisfies Prisma.CustomerAssignmentSelect;
const caseSelect = { id: true, title: true, status: true, version: true, dueAt: true, updatedAt: true, customerId: true, conversationId: true, customer: { select: { id: true, fullName: true, assignment: { select: assignmentSelect } } } } satisfies Prisma.CRMCaseSelect;

export async function listCRMCases(actor: CRMActor, page = 1, status?: string) {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.read");
    const where: Prisma.CRMCaseWhereInput = { ...scopedCase(actor), ...(status === "OPEN" ? { status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } } : status ? { status: z.enum(["NEW", "IN_PROGRESS", "WAITING_CUSTOMER", "COMPLETED", "CANCELLED"]).parse(status) } : {}) };
    const [items, total] = await Promise.all([transaction.cRMCase.findMany({ where, select: caseSelect, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 25, skip: (page - 1) * 25 }), transaction.cRMCase.count({ where })]);
    return { items, total, page, pageSize: 25 };
  });
}
export async function getCRMCase(actor: CRMActor, id: string) {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.read");
    const item = await transaction.cRMCase.findFirst({ where: { ...scopedCase(actor), id }, select: { ...caseSelect, description: true, completedAt: true, planId: true, notes: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, body: true, createdAt: true, actor: { select: { name: true } } } }, _count: { select: { notes: true } } } });
    if (!item) throw new NotFoundError();
    const conversation = item.conversationId ? await transaction.conversation.findFirst({ where: { id: item.conversationId, tenantId: actor.tenantId, customerId: item.customerId }, select: { id: true, messages: { orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 50, select: { id: true, direction: true, kind: true, text: true, occurredAt: true } }, _count: { select: { messages: true } } } }) : null;
    return { ...item, conversation };
  });
}
export async function createCRMCase(actor: CRMActor, input: z.infer<typeof createCaseSchema>) {
  const data = createCaseSchema.parse(input); const inputHash = hash({ actorId: actorId(actor), ...data });
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.create");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-customer:${actor.tenantId}:${data.customerId}`}, 0))`;
    if (!await transaction.customer.findFirst({ where: { ...scopedCustomer(actor), id: data.customerId, status: "ACTIVE" } })) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-request:${actor.tenantId}:${data.requestKey}`}, 0))`;
    const existing = await transaction.cRMCase.findUnique({ where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: data.requestKey } } });
    if (existing) { if (existing.inputHash !== inputHash) throw new ConflictError("Esta solicitação já foi usada com outros dados."); return existing; }
    if (data.conversationId) {
      const conversation = await transaction.conversation.findFirst({ where: { id: data.conversationId, tenantId: actor.tenantId, customerId: data.customerId } });
      if (!conversation) throw new NotFoundError();
      const open = await transaction.cRMCase.findFirst({ where: { tenantId: actor.tenantId, conversationId: data.conversationId, status: { in: ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] } } });
      if (open) throw new ConflictError("Esta conversa já possui um atendimento aberto.");
    }
    if (data.planId && !await transaction.relationshipPlan.findFirst({ where: { id: data.planId, tenantId: actor.tenantId, customerId: data.customerId, status: "APPROVED" } })) throw new NotFoundError();
    const item = await transaction.cRMCase.create({ data: { ...data, tenantId: actor.tenantId, createdById: actorId(actor), inputHash } });
    await transaction.customerTimeline.create({ data: { tenantId: actor.tenantId, customerId: data.customerId, actorId: actorId(actor), eventType: "CRM_CASE_CREATED", summary: `Atendimento aberto: ${data.title}`, metadata: { caseId: item.id, conversationId: data.conversationId ?? null, planId: data.planId ?? null } } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "CRM_CASE_CREATED", entityType: "CRMCase", entityId: item.id, metadata: { customerId: data.customerId, conversationId: data.conversationId ?? null }, idempotencyKey: `crm-created:${item.id}` });
    return item;
  });
}
export async function changeCRMCase(actor: CRMActor, id: string, input: z.infer<typeof caseActionSchema>) {
  const data = caseActionSchema.parse(input); const inputHash = hash({ actorId: actorId(actor), caseId: id, ...data });
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.update");
    const before = await transaction.cRMCase.findFirst({ where: { ...scopedCase(actor), id } });
    if (!before) throw new NotFoundError();
    // Share the customer lock with distribution, so a reassigned consultant loses write access immediately.
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-customer:${actor.tenantId}:${before.customerId}`}, 0))`;
    const item = await transaction.cRMCase.findFirst({ where: { ...scopedCase(actor), id } });
    if (!item) throw new NotFoundError();
    if (!await transaction.customer.findFirst({ where: { id: item.customerId, tenantId: actor.tenantId, status: "ACTIVE" } })) throw new ConflictError("O cliente não está ativo para atendimento.");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-action:${actor.tenantId}:${data.requestKey}`}, 0))`;
    const old = await transaction.cRMNote.findUnique({ where: { tenantId_requestKey: { tenantId: actor.tenantId, requestKey: data.requestKey } } });
    if (old) { if (old.inputHash !== inputHash || old.caseId !== id) throw new ConflictError("Esta solicitação já foi usada com outros dados."); return item; }
    if (item.version !== data.expectedVersion) throw new ConflictError("O atendimento mudou. Atualize a página antes de continuar.");
    if (item.status === "COMPLETED" || item.status === "CANCELLED") throw new ConflictError("Este atendimento já foi encerrado.");
    if (data.action === "transition" && !transitions[item.status].includes(data.status)) throw new ConflictError("Esta mudança de etapa não é permitida.");
    const dueAt = data.action === "schedule" && data.dueAt ? new Date(data.dueAt) : null;
    if (dueAt && dueAt <= new Date()) throw new ConflictError("Agende o retorno para uma data futura.");
    const updated = await transaction.cRMCase.updateMany({ where: { id, tenantId: actor.tenantId, version: data.expectedVersion }, data: { version: { increment: 1 }, ...(data.action === "transition" ? { status: data.status, completedAt: data.status === "COMPLETED" || data.status === "CANCELLED" ? new Date() : null } : data.action === "schedule" ? { dueAt } : {}) } });
    if (!updated.count) throw new ConflictError("O atendimento mudou.");
    const body = data.action === "schedule" ? dueAt ? `Retorno agendado para ${dueAt.toISOString()}` : "Agendamento de retorno removido." : data.note;
    await transaction.cRMNote.create({ data: { tenantId: actor.tenantId, caseId: id, actorId: actorId(actor), requestKey: data.requestKey, inputHash, body } });
    if (data.action === "transition") await transaction.customerTimeline.create({ data: { tenantId: actor.tenantId, customerId: item.customerId, actorId: actorId(actor), eventType: "CRM_CASE_STATUS_CHANGED", summary: `Atendimento ${data.status}: ${item.title}`, metadata: { caseId: id, status: data.status } } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "CRM_CASE_UPDATED", entityType: "CRMCase", entityId: id, metadata: { action: data.action, ...(data.action === "transition" ? { status: data.status } : {}) }, idempotencyKey: `crm-action:${data.requestKey}` });
    return transaction.cRMCase.findUniqueOrThrow({ where: { id } });
  });
}
export async function searchCRMCustomers(actor: CRMActor, search = "") {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.read");
    const q = z.string().trim().max(160).parse(search);
    return transaction.customer.findMany({ where: { ...scopedCustomer(actor), status: "ACTIVE", ...(q ? { fullName: { contains: q, mode: "insensitive" } } : {}) }, select: { id: true, fullName: true, assignment: { select: assignmentSelect } }, orderBy: [{ fullName: "asc" }, { id: "asc" }], take: 25 });
  });
}
export async function createCRMCustomer(actor: CRMActor, input: z.infer<typeof createCRMCustomerSchema>) {
  const data = createCRMCustomerSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "customers.create");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-new-customer:${actor.tenantId}:${data.requestKey}`}, 0))`;
    const inputHash = hash({ actorId: actorId(actor), ...data });
    const source = await transaction.customerSource.findFirst({ where: { tenantId: actor.tenantId, sourceType: "CRM_CREATED", sourceId: data.requestKey } });
    if (source) {
      if ((source.metadata as { inputHash?: string } | null)?.inputHash !== inputHash) throw new ConflictError("Esta solicitação já foi usada com outros dados.");
      const existing = await transaction.customer.findFirst({ where: { ...scopedCustomer(actor), id: source.customerId, status: "ACTIVE" }, select: { id: true, fullName: true } });
      if (!existing) throw new NotFoundError(); return existing;
    }
    const customer = await transaction.customer.create({ data: { tenantId: actor.tenantId, fullName: data.fullName, displayName: data.fullName } });
    await transaction.customerSource.create({ data: { tenantId: actor.tenantId, customerId: customer.id, sourceType: "CRM_CREATED", sourceId: data.requestKey, metadata: { inputHash } } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "CUSTOMER_CREATED", entityType: "Customer", entityId: customer.id });
    return { id: customer.id, fullName: customer.fullName };
  });
}
export async function linkConversationCustomer(actor: CRMActor, conversationId: string, customerId: string) {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "crm.create");
    const original = await transaction.conversation.findFirst({ where: { id: conversationId, tenantId: actor.tenantId } });
    if (!original) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`messaging-webhook:${original.connectionId}`}, 0))`;
    const conversation = await transaction.conversation.findUniqueOrThrow({ where: { id: conversationId } });
    if (!await transaction.customer.findFirst({ where: { ...scopedCustomer(actor), id: customerId, status: "ACTIVE" } })) throw new NotFoundError();
    if (conversation.customerId && conversation.customerId !== customerId) throw new ConflictError("Esta conversa já está vinculada a outro cliente.");
    if (conversation.customerId === customerId) return { customerId };
    await transaction.conversation.update({ where: { id: conversationId }, data: { customerId } });
    const latest = await transaction.conversationMessage.groupBy({ by: ["direction"], where: { tenantId: actor.tenantId, conversationId }, _max: { occurredAt: true } });
    for (const event of latest) if (event._max.occurredAt) await recordObservedContact(transaction, actor.tenantId, customerId, event.direction, event._max.occurredAt);
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "CONVERSATION_CUSTOMER_LINKED", entityType: "Conversation", entityId: conversationId, metadata: { customerId }, idempotencyKey: `conversation-customer:${conversationId}:${customerId}` });
    return { customerId };
  });
}
export async function distributionDirectory(actor: CRMActor) {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "distribution.manage");
    const managerId = "context" in actor && actor.context.accessScope === "TEAM" ? actor.context.userId : null;
    const teams = await transaction.team.findMany({ where: { tenantId: actor.tenantId, status: "ACTIVE", ...(managerId ? { members: { some: { userId: managerId, tenantId: actor.tenantId } } } : {}) }, select: { id: true, name: true, members: { select: { userId: true } } }, orderBy: { name: "asc" } });
    const memberships = await transaction.membership.findMany({ where: { tenantId: actor.tenantId, role: "CONSULTANT", status: "ACTIVE", user: { status: "ACTIVE" }, userId: { in: teams.flatMap((team) => team.members.map((member) => member.userId)) } }, select: { id: true, userId: true, user: { select: { name: true } } } });
    return teams.map((team) => ({ id: team.id, name: team.name, consultants: memberships.filter((member) => team.members.some((item) => item.userId === member.userId)).map((member) => ({ membershipId: member.id, name: member.user.name })) }));
  });
}
export async function assignCustomer(actor: CRMActor, customerId: string, input: z.infer<typeof assignmentSchema>) {
  const data = assignmentSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "distribution.manage");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-customer:${actor.tenantId}:${customerId}`}, 0))`;
    if (!await transaction.customer.findFirst({ where: { ...scopedCustomer(actor), id: customerId, status: "ACTIVE" } })) throw new NotFoundError();
    const managerId = "context" in actor && actor.context.accessScope === "TEAM" ? actor.context.userId : null;
    if (!await transaction.team.findFirst({ where: { id: data.teamId, tenantId: actor.tenantId, status: "ACTIVE", ...(managerId ? { members: { some: { userId: managerId, tenantId: actor.tenantId } } } : {}) } })) throw new NotFoundError();
    if (data.assignedMembershipId && !await transaction.membership.findFirst({ where: { id: data.assignedMembershipId, tenantId: actor.tenantId, role: "CONSULTANT", status: "ACTIVE", user: { status: "ACTIVE", teamMembers: { some: { tenantId: actor.tenantId, teamId: data.teamId } } } } })) throw new ConflictError("O consultor deve estar ativo e pertencer à equipe selecionada.");
    const existing = await transaction.customerAssignment.findUnique({ where: { customerId } });
    if (existing && existing.teamId === data.teamId && existing.assignedMembershipId === data.assignedMembershipId) return existing;
    if ((existing?.version ?? null) !== data.expectedVersion) throw new ConflictError("A distribuição mudou. Atualize antes de continuar.");
    const assignment = existing ? await transaction.customerAssignment.update({ where: { id: existing.id }, data: { teamId: data.teamId, assignedMembershipId: data.assignedMembershipId, assignedById: actorId(actor), version: { increment: 1 } } }) : await transaction.customerAssignment.create({ data: { tenantId: actor.tenantId, customerId, teamId: data.teamId, assignedMembershipId: data.assignedMembershipId, assignedById: actorId(actor) } });
    await transaction.customerTimeline.create({ data: { tenantId: actor.tenantId, customerId, actorId: actorId(actor), eventType: "CUSTOMER_DISTRIBUTED", summary: data.assignedMembershipId ? "Cliente atribuído a um consultor da equipe." : "Cliente direcionado à fila da equipe.", metadata: { assignmentId: assignment.id, teamId: data.teamId, membershipId: data.assignedMembershipId } } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "CUSTOMER_DISTRIBUTED", entityType: "CustomerAssignment", entityId: assignment.id, metadata: { customerId, teamId: data.teamId, membershipId: data.assignedMembershipId, version: assignment.version }, idempotencyKey: `distribution:${assignment.id}:${assignment.version}` });
    return assignment;
  });
}

export async function crmSetupDirectory(actor: CRMActor) {
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "users.read");
    const managerId = "context" in actor && actor.context.accessScope === "TEAM" ? actor.context.userId : null;
    const [teams, members] = await Promise.all([
      transaction.team.findMany({ where: { tenantId: actor.tenantId, status: "ACTIVE", ...(managerId ? { members: { some: { tenantId: actor.tenantId, userId: managerId } } } : {}) }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      transaction.membership.findMany({ where: { tenantId: actor.tenantId, role: { in: ["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT"] }, status: { in: ["ACTIVE", "INVITED"] }, user: { status: { in: ["ACTIVE", "INVITED"] } } }, select: { id: true, role: true, status: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "asc" }, take: 200 }),
    ]);
    return { teams, members };
  });
}
export async function createCRMTeam(actor: CRMActor, input: z.infer<typeof crmTeamSchema>) {
  const data = crmTeamSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "teams.create");
    const team = await transaction.team.create({ data: { tenantId: actor.tenantId, name: data.name } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "TEAM_CREATED", entityType: "Team", entityId: team.id });
    return { id: team.id, name: team.name };
  });
}
export async function inviteCRMUser(actor: CRMActor, input: z.infer<typeof crmInviteSchema>) {
  const data = crmInviteSchema.parse(input); const email = data.email.toLowerCase().trim();
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "users.create");
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`crm-invite:${email}`}, 0))`;
    if (data.teamId && !await transaction.team.findFirst({ where: { id: data.teamId, tenantId: actor.tenantId, status: "ACTIVE" } })) throw new NotFoundError();
    const user = await transaction.user.upsert({ where: { email }, create: { email, name: data.name, status: "INVITED" }, update: {}, select: { id: true, status: true } });
    if (user.status !== "INVITED") throw new ConflictError("Esta conta já possui acesso ou não está disponível para convite. O convite não pode redefinir uma senha existente.");
    if (await transaction.membership.findUnique({ where: { userId_tenantId: { tenantId: actor.tenantId, userId: user.id } } })) throw new ConflictError("O usuário já possui vínculo com esta empresa.");
    const membership = await transaction.membership.create({ data: { tenantId: actor.tenantId, userId: user.id, role: data.role, status: "INVITED" } });
    if (data.teamId) await transaction.teamMember.create({ data: { tenantId: actor.tenantId, teamId: data.teamId, userId: user.id } });
    const token = createOpaqueToken(); const expiresAt = new Date(Date.now() + 48 * 3600_000);
    await transaction.inviteToken.create({ data: { tenantId: actor.tenantId, userId: user.id, tokenHash: hashToken(token), expiresAt } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "USER_INVITED", entityType: "Membership", entityId: membership.id, metadata: { role: data.role, teamId: data.teamId ?? null } });
    return { membershipId: membership.id, activationUrl: `${process.env.APP_URL}/activate?token=${encodeURIComponent(token)}`, expiresAt };
  });
}
export async function addCRMTeamMember(actor: CRMActor, input: z.infer<typeof crmTeamMemberSchema>) {
  const data = crmTeamMemberSchema.parse(input);
  return db.$transaction(async (transaction) => {
    await authorize(transaction, actor, "teams.manage_members");
    const managerId = "context" in actor && actor.context.accessScope === "TEAM" ? actor.context.userId : null;
    if (!await transaction.team.findFirst({ where: { id: data.teamId, tenantId: actor.tenantId, status: "ACTIVE", ...(managerId ? { members: { some: { tenantId: actor.tenantId, userId: managerId } } } : {}) } })) throw new NotFoundError();
    const member = await transaction.membership.findFirst({ where: { id: data.membershipId, tenantId: actor.tenantId, status: { in: ["ACTIVE", "INVITED"] }, role: { in: ["TENANT_MASTER", "TENANT_MANAGER", "CONSULTANT"] }, user: { status: { in: ["ACTIVE", "INVITED"] } } } });
    if (!member) throw new NotFoundError();
    await transaction.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`team-member:${data.teamId}:${member.userId}`}, 0))`;
    const existing = await transaction.teamMember.findUnique({ where: { teamId_userId: { teamId: data.teamId, userId: member.userId } } });
    if (existing) return { id: existing.id };
    const stored = await transaction.teamMember.create({ data: { teamId: data.teamId, tenantId: actor.tenantId, userId: member.userId } });
    await recordEvent(transaction, { tenantId: actor.tenantId, actorUserId: actorId(actor), action: "TEAM_MEMBER_ADDED", entityType: "Team", entityId: data.teamId, metadata: { membershipId: member.id } });
    return { id: stored.id };
  });
}
