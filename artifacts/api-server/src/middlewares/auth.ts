import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { db } from "@workspace/db";
import { usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const JWT_SECRET = process.env.SESSION_SECRET || "zenti-secret-key";

export interface AuthRequest extends Request {
  userId?: number;
  userRole?: string;
}

export function signToken(userId: number): string {
  return jwt.sign({ userId }, JWT_SECRET, { expiresIn: "30d" });
}

export async function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = payload.userId;
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (user.status === "banned" || user.status === "suspended") {
      res.status(403).json({ 
        error: `Account is ${user.status}`, 
        status: user.status,
        reason: user.bannedReason 
      });
      return;
    }
    req.userRole = user.role;
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export async function requireVerified(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, payload.userId)).limit(1);
    if (!user) {
      res.status(401).json({ error: "User not found" });
      return;
    }
    if (user.status === "banned" || user.status === "suspended") {
      res.status(403).json({ 
        error: `Account is ${user.status}`, 
        status: user.status,
        reason: user.bannedReason 
      });
      return;
    }
    if (!user.isVerified) {
      res.status(403).json({
        error: "Account not verified. Please verify your phone number to continue.",
        code: "UNVERIFIED",
        phone: user.phone,
        email: user.email,
      });
      return;
    }
    next();
  } catch {
    res.status(401).json({ error: "Invalid token" });
  }
}

export async function requireAdmin(req: AuthRequest, res: Response, next: NextFunction) {
  await requireAuth(req, res, async () => {
    if (req.userRole !== "admin" && req.userRole !== "superadmin") {
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    next();
  });
}
