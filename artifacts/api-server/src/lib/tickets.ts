import { db } from "@workspace/db";
import { ticketsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

export type TicketType = "deposit" | "withdrawal" | "investment" | "ban" | "appeal" | "dormancy" | "otp";

function formatDate(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}

/**
 * Creates a ticket and assigns a formatted ticket number: ZEN-YYYYMMDD-NNNNN
 * Returns the full ticket with ticketNumber populated.
 */
export async function createTicket(opts: {
  type: TicketType;
  userId: number | null;
  relatedId?: number | null;
  metadata?: Record<string, unknown>;
}) {
  const [ticket] = await db
    .insert(ticketsTable)
    .values({
      type: opts.type,
      userId: opts.userId,
      relatedId: opts.relatedId ?? null,
      status: "open",
      metadata: opts.metadata ?? null,
    })
    .returning();

  const ticketNumber = `ZEN-${formatDate(ticket.createdAt)}-${String(ticket.id).padStart(5, "0")}`;

  await db
    .update(ticketsTable)
    .set({ ticketNumber })
    .where(eq(ticketsTable.id, ticket.id));

  return { ...ticket, ticketNumber };
}

/**
 * Marks a ticket as resolved/closed.
 */
export async function closeTicket(ticketId: number, status: "resolved" | "closed" = "resolved") {
  await db
    .update(ticketsTable)
    .set({ status, updatedAt: new Date() })
    .where(eq(ticketsTable.id, ticketId));
}

/**
 * Looks up a ticket by number and returns full record.
 */
export async function findTicket(ticketNumber: string) {
  const [ticket] = await db
    .select()
    .from(ticketsTable)
    .where(eq(ticketsTable.ticketNumber, ticketNumber))
    .limit(1);
  return ticket ?? null;
}
