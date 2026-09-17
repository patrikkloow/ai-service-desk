import { afterEach, describe, expect, it, vi } from "vitest";
import DevelopmentPage from "./page";
const mocks = vi.hoisted(() => ({protect: vi.fn(), notFound: vi.fn(() => {throw new Error("404");})}));
vi.mock("@clerk/nextjs/server", () => ({auth: {protect: mocks.protect}}));
vi.mock("next/navigation", () => ({notFound: mocks.notFound}));
vi.mock("@/components/product-shell", () => ({ProductShell: () => null}));
vi.mock("@/components/tool-console", () => ({ToolConsole: () => null}));
vi.mock("@/components/ai-orchestrator-console", () => ({AiOrchestratorConsole: () => null}));
vi.mock("@/components/conversation-case-console", () => ({ConversationCaseConsole: () => null}));
afterEach(() => {vi.unstubAllEnvs(); vi.clearAllMocks();});
describe("development-only route", () => {
 it.each(["production", "test"])("returns not-found in %s before exposing tools", async environment => {
  vi.stubEnv("NODE_ENV", environment); await expect(DevelopmentPage()).rejects.toThrow("404"); expect(mocks.protect).not.toHaveBeenCalled();
 });
 it("requires server-side Clerk authentication in development", async () => {
  vi.stubEnv("NODE_ENV", "development"); mocks.protect.mockRejectedValueOnce(new Error("sign-in required"));
  await expect(DevelopmentPage()).rejects.toThrow("sign-in required"); expect(mocks.protect).toHaveBeenCalledOnce();
 });
 it("renders development tools only after authentication", async () => {
  vi.stubEnv("NODE_ENV", "development"); mocks.protect.mockResolvedValueOnce({});
  expect(await DevelopmentPage()).toBeTruthy(); expect(mocks.protect).toHaveBeenCalledOnce();
 });
});
