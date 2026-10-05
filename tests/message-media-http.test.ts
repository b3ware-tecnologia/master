import { describe, it, expect, vi } from "vitest";
import { NextRequest } from "next/server";
vi.mock("@/lib/conversation-http", () => ({ conversationActor: vi.fn() }));
vi.mock("@/services/message-media-service", () => ({ downloadMessageMedia: vi.fn() }));
import { conversationActor } from "@/lib/conversation-http";
import { downloadMessageMedia } from "@/services/message-media-service";
import { messageMediaRoute } from "@/lib/message-media-http";
import { AuthorizationError } from "@/domain/errors";
describe("media HTTP responses", () => {
  it("returns a private attachment without exposing the provider envelope", async () => {
    vi.mocked(conversationActor).mockResolvedValue({ tenantId: "tenant", platformUserId: "admin" });
    vi.mocked(downloadMessageMedia).mockResolvedValue({ bytes: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", extension: "pdf", fileName: "whatsapp-message.pdf" });
    const response = await messageMediaRoute(new NextRequest("https://crm.example.invalid/api/platform/conversations/conv/messages/message/media?tenantId=tenant"), true, "inbox", "conv", "message");
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store"); expect(response.headers.get("x-content-type-options")).toBe("nosniff"); expect(response.headers.get("content-disposition")).toBe('attachment; filename="whatsapp-message.pdf"'); expect(response.headers.get("content-security-policy")).toContain("sandbox"); expect(await response.text()).toBe("%PDF-1.4");
  });
  it("does not return bytes after authorization fails", async () => {
    vi.mocked(conversationActor).mockRejectedValue(new AuthorizationError()); vi.mocked(downloadMessageMedia).mockClear();
    const response = await messageMediaRoute(new NextRequest("https://crm.example.invalid/api/crm/conversations/conv/messages/message/media"), false, "crm", "conv", "message");
    expect(response.status).toBe(403); expect(vi.mocked(downloadMessageMedia)).not.toHaveBeenCalled(); expect(await response.text()).not.toContain("%PDF");
  });
});
