import assert from "node:assert/strict";

// Read-only probe. Run inside Railway; never creates instances or sends messages.
const baseUrl = process.env.EVOLUTION_API_URL ?? process.env.SERVER_URL;
const apiKey = process.env.EVOLUTION_API_KEY ?? process.env.AUTHENTICATION_API_KEY;
const expectedVersion = process.env.EVOLUTION_EXPECTED_VERSION ?? "2.3.7";

async function probe() {
  assert(baseUrl && apiKey, "Evolution URL and API key must be configured");
  const parsed = new URL(baseUrl);
  assert(!parsed.username && !parsed.password && !parsed.search && !parsed.hash, "Invalid provider URL");
  assert(parsed.protocol === "https:" || (parsed.protocol === "http:" && parsed.hostname.endsWith(".railway.internal")), "HTTPS or Railway private networking required");
  const request = (path, headers = {}) => fetch(`${baseUrl.replace(/\/$/, "")}${path}`, {
    headers,
    redirect: "error",
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });

  const health = await request("/");
  assert.equal(health.status, 200, "Provider health failed");
  const root = await health.json();
  assert.equal(root.version, expectedVersion, "Unexpected Evolution version");

  const authorized = await request("/instance/fetchInstances", { apikey: apiKey });
  assert.equal(authorized.status, 200, "Configured API key rejected");
  const instances = await authorized.json();
  assert(Array.isArray(instances), "Unexpected instance-list response");
  for (const headers of [{}, { apikey: "invalid-healthcheck-key" }]) {
    const rejected = await request("/instance/fetchInstances", headers);
    assert.equal(rejected.status, 401, "Provider must reject missing/invalid credentials");
    await rejected.arrayBuffer();
  }

  console.log(JSON.stringify({
    result: "PASS",
    version: root.version,
    network: parsed.hostname.endsWith(".railway.internal") ? "private" : "public-https",
    authenticatedStatus: authorized.status,
    missingAndInvalidKeyStatus: 401,
    instanceCount: instances.length,
  }));
}

try {
  await probe();
} catch (error) {
  // Never print provider bodies, network errors, instance details, or credentials.
  console.error(JSON.stringify({ result: "FAIL", reason: error instanceof assert.AssertionError ? error.message : "Provider probe failed" }));
  process.exitCode = 1;
}
