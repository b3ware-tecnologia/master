import { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { customerScope } from "@/services/customer-scope";
import { authorizeCRMActor, type CRMActor } from "@/services/crm-service";

export const openCaseStatuses = ["NEW", "IN_PROGRESS", "WAITING_CUSTOMER"] as const;
export async function operationsOverview(actor: CRMActor, now = new Date()) {
  return db.$transaction(async (transaction) => {
    await authorizeCRMActor(transaction, actor, "crm.read");
    const customers: Prisma.CustomerWhereInput = { ...("context" in actor ? customerScope(actor.context) : { tenantId: actor.tenantId }), status: "ACTIVE" };
    const cases: Prisma.CRMCaseWhereInput = { tenantId: actor.tenantId, customer: customers };
    const open = { ...cases, status: { in: [...openCaseStatuses] } } satisfies Prisma.CRMCaseWhereInput;
    const nextDay = new Date(now.getTime() + 24 * 3600_000);
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 3600_000);
    const unassigned: Prisma.CustomerWhereInput = { ...customers, OR: [{ assignment: { is: null } }, { assignment: { is: { assignedMembershipId: null } } }] };
    const [tenant, activeCustomers, openCases, overdueCases, next24Hours, completedLast7Days, customersWaitingDistribution, returns, stages] = await Promise.all([
      transaction.tenant.findUniqueOrThrow({ where: { id: actor.tenantId }, select: { name: true } }),
      transaction.customer.count({ where: customers }), transaction.cRMCase.count({ where: open }),
      transaction.cRMCase.count({ where: { ...open, dueAt: { lt: now } } }), transaction.cRMCase.count({ where: { ...open, dueAt: { gte: now, lte: nextDay } } }),
      transaction.cRMCase.count({ where: { ...cases, status: "COMPLETED", completedAt: { gte: sevenDaysAgo, lte: now } } }),
      transaction.customer.count({ where: unassigned }),
      transaction.cRMCase.findMany({ where: { ...open, dueAt: { lte: nextDay } }, orderBy: [{ dueAt: "asc" }, { id: "asc" }], take: 20, select: { id: true, title: true, status: true, dueAt: true, customer: { select: { fullName: true, assignment: { select: { team: { select: { name: true } }, assignedMembership: { select: { user: { select: { name: true } } } } } } } } } }),
      transaction.cRMCase.groupBy({ by: ["status"], where: open, _count: { _all: true } }),
    ]);
    return { canManageDistribution: !("context" in actor) || actor.context.capabilities.includes("distribution.manage"), tenantName: tenant.name, generatedAt: now, scope: "context" in actor ? actor.context.accessScope : "TENANT", counts: { activeCustomers, openCases, overdueCases, next24Hours, completedLast7Days, customersWaitingDistribution }, stages: Object.fromEntries(openCaseStatuses.map((status) => [status, stages.find((item) => item.status === status)?._count._all ?? 0])), returns };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
}

