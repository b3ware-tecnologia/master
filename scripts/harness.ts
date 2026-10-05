import { execFileSync } from "node:child_process";
import { checkDatabaseConnection, db } from "@/lib/db";
import { parseEnvironment } from "@/lib/env";
import { checkRedisConnection, closeRedisConnection } from "@/lib/redis";
import { GET as health } from "@/app/health/route";
import { GET as ready } from "@/app/ready/route";
import { startWorker } from "@/workers";

function run(command: string, arguments_: string[]) {
  execFileSync(command, arguments_, { stdio: "inherit", env: process.env, shell: process.platform === "win32" });
}

function verifyGitRevision(mode: "local" | "staging") {
  if (process.env.RAILWAY_GIT_COMMIT_SHA) {
    console.log(`Railway Git revision: ${process.env.RAILWAY_GIT_COMMIT_SHA}`);
    return;
  }

  if (mode === "local") run("git", ["rev-parse", "--verify", "HEAD"]);
  else console.log("Railway direct deployment: revision verified by deployment source");
}

async function main() {
  const mode = process.argv[2] === "staging" ? "staging" : "local";
  verifyGitRevision(mode);
  run("pnpm", ["lint"]);
  run("pnpm", ["typecheck"]);
  run("pnpm", ["test"]);
  run("pnpm", ["build"]);
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = "postgresql://local:local@localhost:5432/local";
  run("pnpm", ["prisma", "validate"]);
  if (mode === "local") {
    console.log("PASS: LOCAL_HARNESS GIT LINT TYPECHECK TESTS BUILD PRISMA DEDUP IDEMPOTENCY IMPORT_LOCK IMPORT_RETRY");
    return;
  }

  parseEnvironment();
  await checkDatabaseConnection();
  await checkRedisConnection();
  await startWorker({ checkDatabase: checkDatabaseConnection, checkRedis: checkRedisConnection, waitForShutdown: async () => undefined });

  if ((await health()).status !== 200 || (await ready()).status !== 200) {
    throw new Error("Health checks did not pass");
  }

  console.log("PASS: STAGING_HARNESS GIT ENV LINT TYPECHECK TESTS BUILD PRISMA DATABASE REDIS WORKER HEALTH READY");
}

void main().finally(async () => {
  await closeRedisConnection();
  await db.$disconnect();
}).catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
