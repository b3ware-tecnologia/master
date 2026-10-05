import assert from "node:assert/strict";
import { db } from "@/lib/db";
import { processImportBatch } from "@/services/import-service";
const [importId, mode] = process.argv.slice(2);
const schema = process.env.ACCEPTANCE_ISOLATED_SCHEMA;
assert(schema && /^phase11_acceptance_[a-f0-9]{32}$/.test(schema)); assert.equal(new URL(process.env.DATABASE_URL!).searchParams.get("schema"), schema);
function pause(event: string) { process.send?.({ event }); return new Promise<void>((resolve) => process.once("message", () => resolve())); }
async function main() {
  try {
    const worked = await processImportBatch(100, `separate-${mode}-${process.pid}`, { importId, ...(mode === "hold" || mode === "zombie" ? { afterClaim: () => pause("CLAIMED") } : mode === "crash" ? { beforeRow: ({ rowNumber }: { rowNumber: number }) => rowNumber === 3 ? pause("ONE_ROW_COMMITTED") : Promise.resolve() } : {}) });
    process.send?.({ event: "DONE", worked });
  } finally { await db.$disconnect(); process.disconnect?.(); }
}
void main().catch(() => { process.exitCode = 1; process.disconnect?.(); });
