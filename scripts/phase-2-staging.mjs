import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { PrismaClient } from "@prisma/client";

// Dedicated schema keeps fixture jobs invisible to the running staging worker.
if (process.env.RAILWAY_ENVIRONMENT_NAME?.toLowerCase() !== "staging") {
  throw new Error("This runner requires the Railway staging environment");
}
const schema = `phase2_acceptance_${randomUUID().replaceAll("-", "")}`;
const url = new URL(process.env.DATABASE_URL);
url.searchParams.set("schema", schema);
const database = new PrismaClient({ datasourceUrl: url.toString() });
const env = { ...process.env, DATABASE_URL: url.toString(), PHASE2_ISOLATED_SCHEMA: schema };
function run(args) {
  const result = spawnSync("pnpm", args, { env, stdio: "inherit", shell: process.platform === "win32" });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Phase 2 command failed (exit ${result.status})`);
}
try {
  console.log(`PHASE_2_ISOLATED_SCHEMA=${schema}`);
  run(["prisma", "migrate", "deploy"]);
  run(["harness:phase2"]);
} finally {
  // schema is generated here, never read from user input or an environment variable.
  await database.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
  const remaining = await database.$queryRaw`SELECT schema_name FROM information_schema.schemata WHERE schema_name = ${schema}`;
  if (remaining.length) throw new Error("Acceptance schema cleanup failed");
  await database.$disconnect();
  console.log("PASS ISOLATED_SCHEMA_CLEANUP");
}
