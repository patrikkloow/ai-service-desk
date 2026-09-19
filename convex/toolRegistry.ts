export type ToolKind = "read" | "write";

export const APPROVED_TOOL_DEFINITIONS = [
  {
    name: "knowledge.search",
    kind: "read",
    description: "Search active tenant knowledge sources.",
    input: "query, optional limit",
    output: "knowledge sources",
  },
  {
    name: "customer.find",
    kind: "read",
    description: "Find active customers by one exact identifier.",
    input: "by, value, optional limit",
    output: "minimal customer matches",
  },
  {
    name: "service.list",
    kind: "read",
    description: "List active tenant services and structured pricing.",
    input: "none",
    output: "services",
  },
  {
    name: "availability.check",
    kind: "read",
    description: "Check whether a time interval is bookable.",
    input: "startTime, endTime, optional serviceId and resourceId",
    output: "availability status and server-selected resource reference",
  },
  {
    name: "business.profile",
    kind: "read",
    description:
      "Ask the server to present configured business identity and public contact details. The model never receives those values.",
    input: "none",
    output: "server-composed customer response",
  },
  {
    name: "business.hours",
    kind: "read",
    description:
      "Ask the server to present normal weekly opening hours. These are not booking availability. The model never receives those values.",
    input: "none",
    output: "server-composed customer response",
  },
  {
    name: "booking.create",
    kind: "write",
    description: "Create a confirmed booking through the booking domain rules.",
    input:
      "customerId, serviceId, startTime, endTime, optional resourceId and notes; active conversation context is attached by the server",
    output: "booking reference and status",
  },
  {
    name: "booking.reschedule",
    kind: "write",
    description:
      "Reschedule a confirmed booking through the booking domain rules.",
    input:
      "bookingId, startTime, endTime, optional resourceId; active conversation context is attached by the server",
    output: "booking reference and status",
  },
  {
    name: "booking.cancel",
    kind: "write",
    description: "Cancel a confirmed booking through the booking domain rules.",
    input: "bookingId; active conversation context is attached by the server",
    output: "booking reference and status",
  },
  {
    name: "case.create",
    kind: "write",
    description:
      "Create a tenant-scoped case with optional customer or conversation context.",
    input:
      "title, optional description, priority, customerId; active conversation context is attached by the server when present",
    output: "case reference and status",
  },
  {
    name: "human.escalate",
    kind: "write",
    description:
      "Mark a conversation for human follow-up without resolving it.",
    input: "reason; the active conversation is attached by the server",
    output: "escalation case reference and whether it was created",
  },
] as const;

export type ApprovedToolName =
  (typeof APPROVED_TOOL_DEFINITIONS)[number]["name"];

export function getApprovedToolDefinition(name: string) {
  return APPROVED_TOOL_DEFINITIONS.find(
    (definition) => definition.name === name,
  );
}
