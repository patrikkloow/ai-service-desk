import { v } from "convex/values";
import { query } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { requireCurrentTenant } from "./tenant";
import { owned } from "./serviceRequests";
import { workTarget } from "./workValidators";

type Work = Doc<"serviceRequests"> | Doc<"cases">;
function item(record: Work, currentActor: string) {
  const request = "summary" in record;
  const attention = request
    ? record.attention
    : record.status === "resolved"
      ? "resolved"
      : record.acknowledgedBy
        ? "acknowledged"
        : "requested";
  return {
    id: record._id,
    kind: request ? ("request" as const) : ("case" as const),
    title: record.title,
    preview: request
      ? record.summary.wants.slice(0, 180)
      : record.description?.slice(0, 180),
    priority: request ? null : record.priority,
    customerId: record.customerId,
    conversationId: request
      ? record.initialConversationId
      : record.conversationId,
    attention,
    reason: request
      ? record.attentionReason
      : record.description?.slice(0, 2000),
    nextAction: request
      ? record.nextAction
      : record.status === "open"
        ? ("human_review" as const)
        : ("none" as const),
    status: record.status,
    updatedAt: record.updatedAt,
    ownership: record.acknowledgedBy
      ? record.acknowledgedBy === currentActor
        ? ("mine" as const)
        : ("colleague" as const)
      : ("unassigned" as const),
  };
}

/** Bounded tenant-indexed queue; linked cases appear inside their request only. */
export const list = query({
  args: { view: v.union(v.literal("attention"), v.literal("all")) },
  handler: async (ctx, args) => {
    const { organization, identity } = await requireCurrentTenant(ctx);
    const requests =
      args.view === "all"
        ? await ctx.db
            .query("serviceRequests")
            .withIndex("by_organizationId_and_updatedAt", (q) =>
              q.eq("organizationId", organization._id),
            )
            .order("desc")
            .take(100)
        : (
            await Promise.all(
              (["requested", "acknowledged"] as const).map((state) =>
                ctx.db
                  .query("serviceRequests")
                  .withIndex(
                    "by_organizationId_and_attention_and_updatedAt",
                    (q) =>
                      q
                        .eq("organizationId", organization._id)
                        .eq("attention", state),
                  )
                  .order("desc")
                  .take(100),
              ),
            )
          ).flat();
    const cases = await ctx.db
      .query("cases")
      .withIndex(
        "by_organizationId_and_serviceRequestId_and_status_and_updatedAt",
        (q) => {
          const base = q
            .eq("organizationId", organization._id)
            .eq("serviceRequestId", undefined);
          return args.view === "attention" ? base.eq("status", "open") : base;
        },
      )
      .order("desc")
      .take(100);
    const rows = await Promise.all(
      [...requests, ...cases].map(async (record) => {
        const customer = record.customerId
          ? await owned(ctx, record.customerId, organization._id)
          : null;
        return {
          ...item(record, identity.tokenIdentifier),
          customer: customer?.name ?? "Kund ej kopplad",
        };
      }),
    );
    const rank = (s: string) =>
      s === "requested" ? 0 : s === "acknowledged" ? 1 : 2;
    rows.sort(
      (a, b) =>
        rank(a.attention) - rank(b.attention) ||
        b.updatedAt - a.updatedAt ||
        a.id.localeCompare(b.id),
    );
    return {
      items: rows,
      limited: requests.length >= 100 || cases.length >= 100,
    };
  },
});

export const detail = query({
  args: { target: workTarget },
  handler: async (ctx, args) => {
    const { organization, identity } = await requireCurrentTenant(ctx);
    const record = await owned(ctx, args.target, organization._id);
    const request = "summary" in record ? record : null;
    const row = item(record, identity.tokenIdentifier);
    const customer = record.customerId
      ? await owned(ctx, record.customerId, organization._id)
      : null;
    const conversation = row.conversationId
      ? await owned(ctx, row.conversationId, organization._id)
      : null;
    const messages = conversation
      ? await ctx.db
          .query("conversationMessages")
          .withIndex(
            "by_organizationId_and_conversationId_and_createdAt",
            (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("conversationId", conversation._id),
          )
          .order("desc")
          .take(50)
      : [];
    const events = conversation
      ? await ctx.db
          .query("conversationEvents")
          .withIndex(
            "by_organizationId_and_conversationId_and_createdAt",
            (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("conversationId", conversation._id),
          )
          .order("desc")
          .take(50)
      : [];
    const labels: Record<string, string> = {
      booking_created: "Bokning skapad",
      booking_rescheduled: "Bokning ombokad",
      booking_cancelled: "Bokning avbokad",
      case_created: "Uppföljningsärende skapat",
      human_escalated: "Mänsklig hjälp efterfrågad",
    };
    const cases = request
      ? await ctx.db
          .query("cases")
          .withIndex(
            "by_organizationId_and_serviceRequestId_and_status_and_updatedAt",
            (q) =>
              q
                .eq("organizationId", organization._id)
                .eq("serviceRequestId", request._id),
          )
          .take(50)
      : [];
    // Booking context comes only from an explicit request link or a validated event reference.
    const bookingIds = new Set(
      events
        .filter((e) => e.entityType === "booking" && e.entityId)
        .map((e) => e.entityId!),
    );
    if (request?.bookingId) bookingIds.add(request.bookingId);
    const bookings = [];
    for (const value of [...bookingIds].slice(0, 10)) {
      const id = ctx.db.normalizeId("bookings", value);
      if (id) {
        const booking = await owned(ctx, id, organization._id);
        bookings.push({
          id: booking._id,
          service: booking.serviceName,
          startTime: booking.startTime,
          status: booking.status,
        });
      }
    }
    return {
      ...row,
      bookingId: request?.bookingId,
      customerId: record.customerId,
      serviceId: request?.serviceId,
      customer: customer?.name ?? "Kund ej kopplad",
      summary: request?.summary ?? {
        wants: record.title,
        known: "",
        missing: "",
      },
      done: [...new Set(events.map((e) => labels[e.type]).filter(Boolean))],
      cases: cases.map((c) => ({
        id: c._id,
        title: c.title,
        status: c.status,
      })),
      bookings,
      messages: messages.reverse().map((m) => ({
        id: m._id,
        sender: m.senderType,
        content: m.content,
        createdAt: m.createdAt,
      })),
      hasOlderMessages: messages.length === 50,
    };
  },
});
