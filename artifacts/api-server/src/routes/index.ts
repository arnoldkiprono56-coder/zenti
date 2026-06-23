import { Router, type IRouter } from "express";
import { requireVerified } from "../middlewares/auth";
import healthRouter from "./health";
import authRouter from "./auth";
import plansRouter from "./plans";
import investmentsRouter from "./investments";
import transactionsRouter from "./transactions";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import supportRouter from "./support";
import statsRouter from "./stats";
import referralsRouter from "./referrals";
import cronRouter from "./cron";
import otpRouter from "./otp";
import earningsRouter from "./earnings";
import appealsRouter from "./appeals";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/auth", authRouter);
router.use("/otp", otpRouter);
router.use("/plans", plansRouter);

// All routes below require a verified account
router.use("/investments", requireVerified, investmentsRouter);
router.use("/transactions", requireVerified, transactionsRouter);
router.use("/dashboard", requireVerified, dashboardRouter);
router.use("/admin", requireVerified, adminRouter);
router.use("/support", requireVerified, supportRouter);
router.use("/stats", requireVerified, statsRouter);
router.use("/referrals", requireVerified, referralsRouter);
router.use("/earnings", requireVerified, earningsRouter);
router.use("/cron", cronRouter);
router.use("/appeals", appealsRouter);

export default router;
