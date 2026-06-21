import { Router, Response } from "express";
import { db } from "@workspace/db";
import { plansTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth, requireAdmin, AuthRequest } from "../middlewares/auth";

const router = Router();

router.get("/", async (_req, res: Response) => {
  const plans = await db.select().from(plansTable).orderBy(plansTable.minDeposit);
  res.json(plans.map(serializePlan));
});

router.post("/", requireAdmin, async (req: AuthRequest, res: Response) => {
  const { name, description, minDeposit, dailyReturnPercent, durationDays, isActive, isInternship, internshipFixedEarning } = req.body;
  const [plan] = await db.insert(plansTable).values({
    name,
    description,
    minDeposit: String(minDeposit),
    dailyReturnPercent: String(dailyReturnPercent),
    durationDays,
    isActive: isActive ?? true,
    isInternship: isInternship ?? false,
    internshipFixedEarning: internshipFixedEarning != null ? String(internshipFixedEarning) : null,
  }).returning();
  res.status(201).json(serializePlan(plan));
});

router.get("/:id", async (req, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id)).limit(1);
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(serializePlan(plan));
});

router.patch("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  const updates: Record<string, unknown> = {};
  const { name, description, minDeposit, dailyReturnPercent, durationDays, isActive } = req.body;
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (minDeposit !== undefined) updates.minDeposit = String(minDeposit);
  if (dailyReturnPercent !== undefined) updates.dailyReturnPercent = String(dailyReturnPercent);
  if (durationDays !== undefined) updates.durationDays = durationDays;
  if (isActive !== undefined) updates.isActive = isActive;
  updates.updatedAt = new Date();
  const [plan] = await db.update(plansTable).set(updates).where(eq(plansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ error: "Plan not found" }); return; }
  res.json(serializePlan(plan));
});

router.delete("/:id", requireAdmin, async (req: AuthRequest, res: Response) => {
  const id = parseInt(String(req.params["id"]));
  await db.delete(plansTable).where(eq(plansTable.id, id));
  res.json({ message: "Plan deleted" });
});

export function serializePlan(plan: typeof plansTable.$inferSelect) {
  return {
    id: plan.id,
    name: plan.name,
    description: plan.description,
    minDeposit: parseFloat(plan.minDeposit),
    dailyReturnPercent: parseFloat(plan.dailyReturnPercent),
    durationDays: plan.durationDays,
    isActive: plan.isActive,
    isInternship: plan.isInternship,
    internshipFixedEarning: plan.internshipFixedEarning ? parseFloat(plan.internshipFixedEarning) : null,
    createdAt: plan.createdAt,
  };
}

export default router;
