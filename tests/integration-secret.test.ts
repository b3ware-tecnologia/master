import {afterEach,describe,it,expect,vi} from "vitest";
import {encryptIntegrationSecret,decryptIntegrationSecret} from "@/lib/integration-secret";
afterEach(()=>vi.unstubAllEnvs());
describe("protected integration credentials",()=>{
it("authenticates tenant and ciphertext and uses fresh nonces",()=>{vi.stubEnv("INTEGRATION_ENCRYPTION_KEY","synthetic-protection-key-for-tests-only");const secret="sk-synthetic-do-not-use";const one=encryptIntegrationSecret(secret,"tenant-a");const two=encryptIntegrationSecret(secret,"tenant-a");expect(one).not.toContain(secret);expect(one).not.toBe(two);expect(decryptIntegrationSecret(one,"tenant-a")).toBe(secret);expect(()=>decryptIntegrationSecret(one,"tenant-b")).toThrow();expect(()=>decryptIntegrationSecret(one.slice(0,-5)+"AAAAA","tenant-a")).toThrow();});
it("fails closed without the server encryption key",()=>{vi.stubEnv("INTEGRATION_ENCRYPTION_KEY","");expect(()=>encryptIntegrationSecret("sk-synthetic","tenant-a")).toThrow();});
});
