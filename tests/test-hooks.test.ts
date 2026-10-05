import { afterEach, describe, expect, it, vi } from "vitest";
import { assertTestHooksAllowed } from "@/services/test-hooks";
import { processOutboxBatchDetailed } from "@/services/outbox-service";

afterEach(() => vi.unstubAllEnvs());

describe("fault injection environment guard", () => {
  it("blocks production and unknown Railway environments before any outbox query", async () => {
    for (const environment of ["production", "Production", "preview"]) {
      vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", environment);
      const findMany = vi.fn();
      await expect(processOutboxBatchDetailed(1, { outboxEvent: { findMany } } as never, { afterClaim: async () => undefined })).rejects.toThrow("disabled");
      expect(findMany).not.toHaveBeenCalled();
    }
  });
  it("allows staging even with a production Node build, and blocks local production", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", "staging");
    expect(() => assertTestHooksAllowed(true)).not.toThrow();
    vi.stubEnv("RAILWAY_ENVIRONMENT_NAME", undefined);
    expect(() => assertTestHooksAllowed(true)).toThrow("disabled");
    expect(() => assertTestHooksAllowed(false)).not.toThrow();
  });
});
