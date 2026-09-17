// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { getFunctionName } from "convex/server";
import { Inbox } from "./inbox";
const mock = vi.hoisted(() => ({
 orgId: "org-a",
 ready: true,
 create: vi.fn(),
 attentionMutation: vi.fn(),
 update: vi.fn(),
 push: vi.fn(),
 replace: vi.fn(),
 ownership: "unassigned",
 attention: "requested",
}));
vi.mock("@clerk/nextjs", () => ({ useAuth: () => ({orgId: mock.orgId, userId: "staff"}) }));
vi.mock("./tenant-bootstrap", () => ({ useTenantProvisioning: () => ({isReady: mock.ready, error: null}) }));
vi.mock("next/navigation", () => ({
 usePathname: () => "/inbox",
 useRouter: () => ({push: mock.push, replace: mock.replace}),
}));
vi.mock("convex/react", () => ({
 useMutation: (reference: Parameters<typeof getFunctionName>[0]) => {
  const name = getFunctionName(reference);
  if(name === "serviceRequests:create") return mock.create;
  if(name === "serviceRequests:attention") return mock.attentionMutation;
  if(name === "serviceRequests:update") return mock.update;
  throw new Error(`Unexpected mutation: ${name}`);
 },
 useQuery: (reference: Parameters<typeof getFunctionName>[0]) => {
  const name = getFunctionName(reference);
  const row = {id: "request-1", kind: "request", title: "Kontrollera ventilation", customer: "Kund ej kopplad", attention: mock.attention, nextAction: "human_review", status: "new", updatedAt: 1, ownership: mock.ownership};
  if(name === "inbox:list") return {items: [row, {...row, id: "case-1", kind: "case", title: "Fråga om faktura"}], limited: false};
  if(name === "inbox:detail") return {...row, summary: {wants: row.title, known: "", missing: ""}, done: [], cases: [], bookings: [], messages: [], hasOlderMessages: false};
  return [];
 }
}));
beforeEach(() => {
 vi.stubGlobal("matchMedia", vi.fn(() => ({
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
 })));
 mock.orgId = "org-a";
 mock.ready = true;
 mock.ownership = "unassigned";
 mock.attention = "requested";
 mock.create.mockReset().mockResolvedValue("request-1");
 mock.attentionMutation.mockReset().mockResolvedValue(undefined);
 mock.update.mockReset().mockResolvedValue(undefined);
 mock.push.mockReset();
 mock.replace.mockReset();
});
afterEach(cleanup);
describe("operator request flows", () => {
 it("keeps standalone follow-ups in Inbox but out of Förfrågningar", () => {
  const view = render(<Inbox />);
  expect(screen.getByText("Fråga om faktura")).toBeTruthy();
  view.unmount(); render(<Inbox requestsOnly />);
  expect(screen.queryByText("Fråga om faktura")).toBeNull();
 });
 it("creates from minimal input without client authority or state-machine fields", async () => {
  render(<Inbox />); fireEvent.click(screen.getByRole("button", {name: "Ny förfrågan"}));
  fireEvent.change(screen.getByLabelText("Vad behöver kunden hjälp med?"), {target: {value: "Kontrollera ventilation"}});
  fireEvent.change(screen.getByLabelText("Anteckning (valfritt)"), {target: {value: "Kunden önskar en genomgång"}});
  fireEvent.click(screen.getByRole("button", {name: "Skapa förfrågan"}));
  await waitFor(() => expect(mock.create).toHaveBeenCalledWith({title: "Kontrollera ventilation", summary: {wants: "Kontrollera ventilation", known: "Kunden önskar en genomgång", missing: ""}}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mock.push).toHaveBeenCalledWith("/inbox?selected=request-1", {scroll: false});
 });
 it("starts manual editing collapsed and acknowledges through the existing API", async () => {
  render(<Inbox initialSelected="request-1" />);
  expect(screen.getByRole("button", {name: "Redigera förfrågan"}).getAttribute("aria-expanded")).toBe("false");
  expect(screen.queryByText("Överlämningsunderlag")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Jag tar hand om detta"}));
  await waitFor(() => expect(mock.attentionMutation).toHaveBeenCalledWith({target: "request-1", action: "acknowledge"}));
 });
 it("does not offer to replace a colleague's acknowledgment", () => {
  mock.ownership = "colleague"; mock.attention = "acknowledged";
  render(<Inbox initialSelected="request-1" />);
  expect(screen.queryByRole("button", {name: "Jag tar hand om detta"})).toBeNull();
  expect(screen.getByRole("button", {name: "Markera hjälpen som klar"})).toBeTruthy();
 });
 it("uses navigation state for request detail and ignores unknown URL ids", () => {
  const view = render(<Inbox initialSelected="unknown" />);
  expect(screen.queryByText("Redigera förfrågan")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: /Kontrollera ventilation/}));
  expect(mock.push).toHaveBeenCalledWith("/inbox?selected=request-1", {scroll: false});
  view.rerender(<Inbox initialSelected="request-1" />);
  fireEvent.click(screen.getByRole("button", {name: "← Tillbaka till listan"}));
  expect(mock.replace).toHaveBeenCalledWith("/inbox", {scroll: false});
 });
 it("clears request drafts and selection when the workspace changes", () => {
  const view = render(<Inbox />);
  fireEvent.click(screen.getByRole("button", {name: "Ny förfrågan"}));
  fireEvent.change(screen.getByLabelText("Vad behöver kunden hjälp med?"), {target: {value: "Privat utkast"}});
  mock.orgId = "org-b"; view.rerender(<Inbox />);
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.queryByDisplayValue("Privat utkast")).toBeNull();
 });
 it("does not mount tenant data while provisioning", () => {
  mock.ready = false; render(<Inbox />);
  expect(screen.queryByText("Kontrollera ventilation")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Förbereder");
 });
});
