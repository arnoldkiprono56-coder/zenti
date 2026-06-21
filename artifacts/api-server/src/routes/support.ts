import { Router, Response, Request } from "express";
import { db } from "@workspace/db";
import { supportRequestsTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, AuthRequest } from "../middlewares/auth";

const router = Router();

const VALID_CATEGORIES = ["account_issue", "investment_query", "withdrawal_issue", "deposit_issue", "technical", "feature_request", "general", "other"];
const VALID_PRIORITIES = ["normal", "high", "urgent"];

router.post("/request", async (req: Request, res: Response) => {
  const { name, email, phone, subject, message, category, priority } = req.body;

  if (!name || !email || !subject || !message) {
    res.status(400).json({ error: "Name, email, subject and message are required" });
    return;
  }
  if (name.length > 100 || subject.length > 200 || message.length > 5000) {
    res.status(400).json({ error: "Input exceeds maximum allowed length" });
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "Invalid email address" });
    return;
  }

  const cat = VALID_CATEGORIES.includes(category) ? category : "general";
  const pri = VALID_PRIORITIES.includes(priority) ? priority : "normal";

  const [request] = await db.insert(supportRequestsTable).values({
    name: String(name).slice(0, 100),
    email: String(email).slice(0, 200),
    phone: phone ? String(phone).slice(0, 20) : null,
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 5000),
    category: cat,
    priority: pri,
  }).returning();

  res.status(201).json(request);
});

// Authenticated version — links request to user account
router.post("/request/auth", requireAuth, async (req: AuthRequest, res: Response) => {
  const { subject, message, category, priority } = req.body;
  if (!subject || !message) {
    res.status(400).json({ error: "Subject and message are required" });
    return;
  }

  const [user] = await db
    .select({ fullName: usersTable.fullName, email: usersTable.email, phone: usersTable.phone })
    .from(usersTable)
    .where(eq(usersTable.id, req.userId!))
    .limit(1);

  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  const cat = VALID_CATEGORIES.includes(category) ? category : "general";
  const pri = VALID_PRIORITIES.includes(priority) ? priority : "normal";

  const [request] = await db.insert(supportRequestsTable).values({
    userId: req.userId!,
    name: user.fullName,
    email: user.email,
    phone: user.phone,
    subject: String(subject).slice(0, 200),
    message: String(message).slice(0, 5000),
    category: cat,
    priority: pri,
  }).returning();

  res.status(201).json(request);
});

export default router;
