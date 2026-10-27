import { z } from "zod";
export const dispatchCandidateSchema = z.strictObject({ id: z.string(), operationalScore: z.number().min(0).max(100), facts: z.array(z.strictObject({ id: z.string(), key: z.string(), value: z.string() })).max(12) });
export type DispatchCandidate = z.infer<typeof dispatchCandidateSchema>;
export const dispatchRankingSchema = z.strictObject({ priorities: z.array(z.strictObject({ id: z.string(), priority: z.number().int().min(0).max(100), reason: z.string().min(1).max(400), evidenceIds: z.array(z.string()).max(12) })).max(50) });
export function validateDispatchRanking(value: unknown, candidates: DispatchCandidate[]) {
  const result = dispatchRankingSchema.parse(value).priorities;
  if (result.length !== candidates.length || new Set(result.map(v => v.id)).size !== candidates.length) throw new Error("INVALID_ROUTE_COVERAGE");
  for (const item of result) {
    const candidate = candidates.find(v => v.id === item.id);
    if (!candidate || item.evidenceIds.some(id => !candidate.facts.some(f => f.id === id)) || (candidate.facts.length && !item.evidenceIds.length)) throw new Error("INVALID_ROUTE_EVIDENCE");
    if (/https?:\/\/|\b\d{11,}\b/.test(item.reason)) throw new Error("INVALID_ROUTE_REASON");
  }
  return result.sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id));
}
export function dispatchRouteOrder(value: unknown): string[] {
  return z.array(dispatchRankingSchema.shape.priorities.element).max(10000).parse(value).sort((a,b) => b.priority-a.priority || a.id.localeCompare(b.id)).map(v => v.id);
}
