import type { Prisma } from "@prisma/client";
export async function channelCadenceState(tx: Prisma.TransactionClient, tenantId: string, connectionId: string, excludeId?: string, now = new Date()) {
  const policy = await tx.channelCadence.findFirst({ where: { tenantId, connectionId } });
  if (!policy) return { reasons: [] as string[], policy: null, dailyNewContacts: 0, dailyFollowUps: 0 };
  const hour = Number(new Intl.DateTimeFormat("en", { timeZone: policy.timeZone, hour: "2-digit", hourCycle: "h23" }).format(now));
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(new Intl.DateTimeFormat("en-US", { timeZone: policy.timeZone, weekday: "short" }).format(now));
  const date = (v: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: policy.timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(v);
  const sends = await tx.outboundDispatch.findMany({ where: { tenantId, connectionId, status: { in: ["QUEUED", "SENDING", "UNCERTAIN", "ACCEPTED"] }, OR: [{ createdAt: { gte: new Date(now.valueOf() - 27 * 3600_000) } }, { acceptedAt: { gte: new Date(now.valueOf() - 27 * 3600_000) } }, { startedAt: { gte: new Date(now.valueOf() - 27 * 3600_000) } }], ...(excludeId ? { id: { not: excludeId } } : {}) }, select: { createdAt: true, acceptedAt: true, startedAt: true, status: true, plan: { select: { outreachTurn: { select: { kind: true } } } } } });
  const day = sends.filter((v) => date(v.acceptedAt ?? v.startedAt ?? v.createdAt) === date(now));
  const hourly = sends.filter((v) => (v.acceptedAt ?? v.startedAt ?? v.createdAt).valueOf() > now.valueOf() - 3600_000);
  const recent = sends.filter((v) => v.status !== "QUEUED").some((v) => (v.acceptedAt ?? v.startedAt ?? v.createdAt).valueOf() > now.valueOf() - policy.minIntervalSeconds * 1000);
  const reasons: string[] = [];
  if (!policy.days.includes(weekday) || hour < policy.startHour || hour >= policy.endHour) reasons.push("CHANNEL_WINDOW");
  if (day.length >= policy.dailyLimit) reasons.push("CHANNEL_DAILY_LIMIT"); if (hourly.length >= policy.hourlyLimit) reasons.push("CHANNEL_HOURLY_LIMIT"); if (recent) reasons.push("CHANNEL_INTERVAL");
  return { reasons, policy, dailyNewContacts: day.filter((v) => v.plan.outreachTurn?.kind === "INITIAL").length, dailyFollowUps: day.filter((v) => v.plan.outreachTurn?.kind === "FOLLOWUP").length };
}

