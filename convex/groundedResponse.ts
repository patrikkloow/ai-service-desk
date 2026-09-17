import type { Finalization, ModelToolResult } from "./modelAdapter";
import { getApprovedToolDefinition } from "./toolRegistry";

export const UNKNOWN_RESPONSE =
  "Jag har inte tillräckligt med verifierad information. Vill du att personalen hjälper dig vidare?";
export const UNCERTAIN_RESPONSE =
  "Jag kan inte bekräfta resultatet. Försök inte igen innan personalen har kontrollerat vad som hände.";
const confirmations: Record<string, string> = {
  "booking.create": "Bokningen är bekräftad.",
  "booking.reschedule": "Bokningen är ombokad.",
  "booking.cancel": "Bokningen är avbokad.",
  "case.create": "Ett uppföljningsärende har skapats.",
  "human.escalate":
    "Din förfrågan är registrerad för uppföljning av personalen.",
};
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
/** Only server-returned successful results can produce authoritative action text. */
export function actionOutcome(
  name: string,
  result: unknown,
  uncertain = false,
): "success" | "failure" | "uncertain" {
  if (uncertain) return "uncertain";
  const response = record(result);
  const data = record(response?.data);
  const booking = name.startsWith("booking.");
  const reference = booking ? data?.bookingId : data?.caseId;
  const status =
    name === "booking.cancel" ? "cancelled" : booking ? "confirmed" : "open";
  if (
    response?.ok === true &&
    typeof reference === "string" &&
    reference.length > 0 &&
    data?.status === status &&
    confirmations[name]
  )
    return "success";
  return response?.ok === false ? "failure" : "uncertain";
}
export function actionResponse(
  name: string,
  result: unknown,
  uncertain = false,
): string {
  switch (actionOutcome(name, result, uncertain)) {
    case "success":
      return confirmations[name];
    case "failure":
      return "Åtgärden kunde inte genomföras. Vill du ha hjälp av personalen?";
    case "uncertain":
      return UNCERTAIN_RESPONSE;
  }
}

function quotedExcerpt(value: string, maximum: number): string {
  let excerpt = value.slice(0, maximum - 2);
  while (JSON.stringify(excerpt).length > maximum)
    excerpt = excerpt.slice(0, -1);
  return JSON.stringify(excerpt);
}

/** No arbitrary model prose is published, even on turns without a write.
 * Evidence selection/relevance remains an evaluation concern, not a semantic proof.
 */
export function groundedFinal(
  finalization: Finalization | undefined,
  results: ModelToolResult[],
): string {
  if (!finalization) return UNKNOWN_RESPONSE;
  switch (finalization.kind) {
    case "development":
      return "Development fake AI is active. Deterministiskt testläge är valt; ingen live-modell används.";
    case "unknown":
      return UNKNOWN_RESPONSE;
    case "clarify_service":
      return "Vilken tjänst behöver du hjälp med?";
    case "clarify_time":
      return "Vilket datum och vilken tid passar dig?";
    case "clarify_customer":
      return "Vilket namn är bokningen kopplad till?";
  }
  const index = finalization.resultIndex;
  if (!Number.isInteger(index) || index === undefined || index < 0)
    return UNKNOWN_RESPONSE;
  const evidence = results[index];
  if (
    !evidence ||
    getApprovedToolDefinition(evidence.toolName)?.kind !== "read"
  )
    return UNKNOWN_RESPONSE;
  const response = record(evidence.result);
  const data = record(response?.data);
  if (response?.ok !== true || !data) return UNKNOWN_RESPONSE;
  if (
    finalization.kind === "services" &&
    evidence.toolName === "service.list" &&
    Array.isArray(data.services)
  ) {
    const lines = data.services.slice(0, 8).flatMap((item) => {
      const service = record(item);
      const price = record(service?.pricing);
      if (typeof service?.name !== "string") return [];
      const amount = price?.amountMinor;
      const known =
        (price?.kind === "fixed" || price?.kind === "from") &&
        typeof amount === "number" &&
        Number.isSafeInteger(amount) &&
        amount >= 0 &&
        typeof price.currency === "string";
      // JSON quoting keeps administrator-authored labels visibly separate from confirmations.
      return [
        `${quotedExcerpt(service.name, 200)}: ${known ? `${price?.kind === "from" ? "från " : ""}${((amount as number) / 100).toLocaleString("sv-SE")} ${price?.currency}` : "pris saknas"}.`,
      ];
    });
    return lines.length
      ? `Registrerade tjänster och priser:\n${lines.join("\n")}`
      : UNKNOWN_RESPONSE;
  }
  if (
    finalization.kind === "knowledge" &&
    evidence.toolName === "knowledge.search" &&
    Array.isArray(data.entries)
  ) {
    const first = record(data.entries[0]);
    if (typeof first?.content !== "string" || !first.content.trim())
      return UNKNOWN_RESPONSE;
    return `Ur företagets kunskapsunderlag (inte en bekräftelse på någon åtgärd eller ett bindande tjänstepris):\n${quotedExcerpt(first.content, 2500)}`;
  }
  if (
    finalization.kind === "availability" &&
    evidence.toolName === "availability.check" &&
    typeof data.available === "boolean"
  ) {
    return data.available
      ? "Det kontrollerade tidsintervallet är ledigt just nu. Ingen bokning är gjord."
      : "Det kontrollerade tidsintervallet är inte ledigt. Vill du kontrollera en annan tid?";
  }
  return UNKNOWN_RESPONSE;
}
