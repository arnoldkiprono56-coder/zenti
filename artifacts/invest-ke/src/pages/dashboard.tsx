import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Link } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api-url";
import { useGetDashboardSummary, useGetMyInvestments, useGetMyTransactions, useActivateInternship, getGetDashboardSummaryQueryKey, getGetMyInvestmentsQueryKey } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import {
  TrendingUp, Wallet, ArrowDownToLine, ArrowUpFromLine,
  Clock, CheckCircle2, Gift, Zap, Users,
  ArrowUpRight, ArrowDownLeft, Sparkles, AlertCircle, Lock,
} from "lucide-react";

const txnIcon: Record<string, React.ReactNode> = {
  deposit:    <ArrowUpRight   className="h-4 w-4 text-green-600" />,
  withdrawal: <ArrowDownLeft  className="h-4 w-4 text-red-500"   />,
  earning:    <Sparkles       className="h-4 w-4 text-primary"   />,
};
const txnColor: Record<string, string> = {
  deposit:    "text-green-600",
  withdrawal: "text-red-500",
  earning:    "text-primary",
};

interface ClaimableData {
  earnings: { id: number; investmentId: number; amount: number; earningDate: string; expiresAt: string }[];
  totalClaimable: number;
  secondsUntilExpiry: number;
  expiresAt: string | null;
}

function useClaimableEarnings(token: string | null) {
  const [data, setData] = useState<ClaimableData | null>(null);
  const [loading, setLoading] = useState(false);

  const refetch = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/earnings/claimable"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setData(await res.json() as ClaimableData);
      }
    } catch { /* silent */ } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void refetch(); }, [refetch]);

  return { data, loading, refetch };
}

function useCountdown(secondsUntilExpiry: number) {
  const [seconds, setSeconds] = useState(secondsUntilExpiry);
  useEffect(() => { setSeconds(secondsUntilExpiry); }, [secondsUntilExpiry]);
  useEffect(() => {
    if (seconds <= 0) return;
    const id = setInterval(() => setSeconds(s => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [seconds]);
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return `${h}h ${String(m).padStart(2, "0")}m ${String(s).padStart(2, "0")}s`;
}

function useCountUp(target: number, duration = 1200) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target === 0) { setValue(0); return; }
    let start = 0;
    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(target * eased);
      if (progress < 1) requestAnimationFrame(step);
      else setValue(target);
    };
    requestAnimationFrame(step);
  }, [target, duration]);
  return value;
}

const containerVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.08 } },
};

const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export default function Dashboard() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("investke_token") : null;

  const { data: summary, isLoading: summaryLoading } = useGetDashboardSummary();
  const { data: investments = [], isLoading: invLoading } = useGetMyInvestments();
  const { data: transactions = [] } = useGetMyTransactions();
  const { data: claimable, loading: claimLoading, refetch: refetchClaimable } = useClaimableEarnings(token);

  const [claiming, setClaiming] = useState(false);

  const activeInvestments = investments.filter(i => i.status === "active");
  const recentTransactions = transactions.slice(0, 6);
  const countdown = useCountdown(claimable?.secondsUntilExpiry ?? 0);

  const balanceDisplay = useCountUp(summary?.balance ?? 0);
  const earnedDisplay = useCountUp(summary?.totalEarned ?? 0);
  const todayDisplay = useCountUp(summary?.todayEarnings ?? 0);

  const activateInternship = useActivateInternship({
    mutation: {
      onSuccess: () => {
        toast({ title: "Internship package activated!", description: "You will earn KES 200 over the next 2 days — claim daily before 11:59 PM!" });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyInvestmentsQueryKey() });
        void refetchClaimable();
      },
      onError: (e: { data?: { error?: string } }) => {
        toast({ title: "Error", description: e.data?.error ?? "Could not activate", variant: "destructive" });
      }
    }
  });

  async function handleClaim() {
    if (!token || claiming) return;
    setClaiming(true);
    try {
      const res = await fetch(apiUrl("/api/earnings/claim"), {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      });
      const data = await res.json() as { ok?: boolean; claimed?: number; message?: string; error?: string };
      if (res.ok && data.ok) {
        toast({ title: "✅ Earnings Claimed!", description: data.message ?? `Claimed ${formatKES(data.claimed ?? 0)}` });
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        void refetchClaimable();
      } else {
        toast({ title: "Could not claim", description: data.error ?? "Try again later", variant: "destructive" });
      }
    } catch {
      toast({ title: "Network error", description: "Please try again", variant: "destructive" });
    } finally {
      setClaiming(false);
    }
  }

  const hasClaimable = (claimable?.totalClaimable ?? 0) > 0;
  const canWithdraw = summary?.canWithdraw ?? false;

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-6 max-w-5xl">

        {/* Greeting */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut" }}
          className="mb-6"
        >
          <h1 className="text-2xl font-bold">Hi, {user?.fullName?.split(" ")[0]} 👋</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Here's your investment overview</p>
        </motion.div>

        {/* ── CLAIM EARNINGS BANNER ─────────────────────────────────────────── */}
        {hasClaimable && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mb-5 rounded-xl border-2 border-green-500 bg-green-50 dark:bg-green-950/20 p-4 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="bg-green-500 text-white p-2 rounded-lg shrink-0 animate-pulse">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-green-800 dark:text-green-300 text-sm">
                    💸 {formatKES(claimable!.totalClaimable)} Ready to Claim!
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-400 mt-0.5">
                    ⚠️ Expires in <strong>{countdown}</strong> — Unclaimed earnings are lost forever!
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <Button
                  onClick={handleClaim}
                  disabled={claiming || claimLoading}
                  className="flex-1 sm:flex-none bg-green-600 hover:bg-green-700 text-white shrink-0 font-bold"
                >
                  {claiming ? "Claiming..." : "✅ Claim Now"}
                </Button>
                <Link href="/earnings/history">
                  <Button variant="outline" size="sm" className="shrink-0 text-xs border-green-300 text-green-700 hover:bg-green-100">
                    History
                  </Button>
                </Link>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── WITHDRAWAL LOCK NOTICE ──────────────────────────────────────── */}
        {activeInvestments.length > 0 && !canWithdraw && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="mb-5 rounded-xl border border-orange-200 bg-orange-50 dark:bg-orange-950/20 p-4"
          >
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-orange-500 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-orange-800 dark:text-orange-300 text-sm">Withdrawal Locked</p>
                <p className="text-xs text-orange-700 dark:text-orange-400 mt-0.5">
                  You can only withdraw on the <strong>last day</strong> of your active investment.
                  {summary?.withdrawalUnlocksAt && (
                    <> Unlocks on <strong>{formatDate(summary.withdrawalUnlocksAt)}</strong>.</>
                  )}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* ── WITHDRAWAL UNLOCKED NOTICE ─────────────────────────────────── */}
        {canWithdraw && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.35, ease: "easeOut" }}
            className="mb-5 rounded-xl border-2 border-primary bg-primary/5 p-4 shadow-sm"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <CheckCircle2 className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-primary text-sm">🎉 Withdrawal Available Today!</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Today is the last day of your investment. You can withdraw your earnings now.</p>
                </div>
              </div>
              <Link href="/withdraw" className="contents">
                <Button className="w-full sm:w-auto shrink-0">Withdraw Now</Button>
              </Link>
            </div>
          </motion.div>
        )}

        {/* Action buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: "easeOut", delay: 0.05 }}
          className="grid grid-cols-2 sm:flex sm:flex-row gap-3 mb-6"
        >
          <Link href="/invest" className="contents">
            <Button className="w-full sm:w-auto gap-2">
              <ArrowUpFromLine className="h-4 w-4" /> Deposit & Invest
            </Button>
          </Link>
          <Link href="/withdraw" className="contents">
            <Button variant="outline" className="w-full sm:w-auto gap-2" disabled={!canWithdraw}>
              <ArrowDownToLine className="h-4 w-4" /> Withdraw
            </Button>
          </Link>
          <Link href="/referrals" className="contents">
            <Button variant="ghost" className="w-full sm:w-auto gap-2 col-span-2 sm:col-span-1 border border-dashed">
              <Users className="h-4 w-4" /> Invite & Earn
            </Button>
          </Link>
        </motion.div>

        {/* Internship Banner */}
        {user?.isInternshipEligible && !user?.internshipActivated && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 }}
            className="mb-5 rounded-xl border-2 border-primary/30 bg-primary/5 p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3"
          >
            <div className="flex items-center gap-3">
              <div className="bg-primary/10 p-2 rounded-lg shrink-0">
                <Gift className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-primary text-sm">2-Day Internship Package Available</p>
                <p className="text-xs text-muted-foreground">Earn KES 200 over 2 days — for new members. Claim daily before 11:59 PM!</p>
              </div>
            </div>
            <Button size="sm" onClick={() => activateInternship.mutate()} disabled={activateInternship.isPending} className="shrink-0 w-full sm:w-auto">
              {activateInternship.isPending ? "Activating..." : "Activate Now"}
            </Button>
          </motion.div>
        )}

        {/* Internship Progress */}
        {user?.internshipActivated && summary?.internshipProgress !== null && summary?.internshipProgress !== undefined && (
          <div className="mb-5 rounded-xl border border-primary/20 bg-primary/5 p-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Zap className="h-4 w-4 text-primary" />
                <span className="font-semibold text-primary text-sm">Internship Progress</span>
              </div>
              <span className="text-sm font-bold text-primary">{summary.internshipProgress.toFixed(1)}%</span>
            </div>
            <Progress value={summary.internshipProgress} className="h-2.5" />
            <div className="flex items-center justify-between mt-1.5">
              <p className="text-xs text-muted-foreground">2-day package running — KES 200 total target.</p>
              {hasClaimable && (
                <span className="text-xs font-semibold text-green-600 animate-pulse">● Claim available!</span>
              )}
            </div>
          </div>
        )}

        {/* Claiming info box */}
        {activeInvestments.length > 0 && !hasClaimable && (
          <div className="mb-5 rounded-xl border border-blue-200 bg-blue-50 dark:bg-blue-950/20 p-3">
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 text-blue-500 shrink-0" />
              <p className="text-xs text-blue-700 dark:text-blue-300">
                <strong>Daily claiming:</strong> Your earnings are generated daily. Log in before 11:59 PM each day and click "Claim Now" or they expire.
              </p>
            </div>
          </div>
        )}

        {/* KPI Stats */}
        {summaryLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            {Array(4).fill(0).map((_, i) => (
              <Card key={i}><CardContent className="p-4"><Skeleton className="h-10 w-full" /></CardContent></Card>
            ))}
          </div>
        ) : (
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="show"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6"
          >
            <motion.div variants={cardVariants}>
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><Wallet className="h-3.5 w-3.5" />Balance</div>
                  <p className="text-xl font-bold text-primary">{formatKES(balanceDisplay)}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={cardVariants}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3.5 w-3.5" />Total Earned</div>
                  <p className="text-xl font-bold text-green-600">{formatKES(earnedDisplay)}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={cardVariants}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><Sparkles className="h-3.5 w-3.5" />Claimed Today</div>
                  <p className="text-xl font-bold">{formatKES(todayDisplay)}</p>
                </CardContent>
              </Card>
            </motion.div>
            <motion.div variants={cardVariants}>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-1.5 text-muted-foreground text-xs mb-1"><CheckCircle2 className="h-3.5 w-3.5" />Active Plans</div>
                  <p className="text-xl font-bold">{summary?.activeInvestments ?? 0}</p>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Active Investments */}
          <Card className="lg:col-span-3">
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Active Investments</CardTitle>
              <Link href="/invest">
                <Button variant="ghost" size="sm" className="h-7 text-xs">+ Invest More</Button>
              </Link>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {invLoading ? (
                <div className="space-y-3"><Skeleton className="h-20 w-full" /><Skeleton className="h-20 w-full" /></div>
              ) : activeInvestments.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <TrendingUp className="h-9 w-9 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No active investments yet</p>
                  <Link href="/invest">
                    <Button size="sm" className="mt-3">Start Investing</Button>
                  </Link>
                </div>
              ) : (
                <div className="space-y-3">
                  {activeInvestments.map((inv, idx) => (
                    <motion.div
                      key={inv.id}
                      initial={{ opacity: 0, x: -12 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.35, delay: idx * 0.07 }}
                      className="rounded-xl border bg-muted/20 p-4"
                    >
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="font-semibold text-sm">{inv.plan?.name ?? "Investment Plan"}</p>
                          <p className="text-xs text-muted-foreground">{formatKES(inv.amountInvested)} invested</p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600 text-sm">+{formatKES(inv.dailyEarning ?? 0)}<span className="font-normal text-muted-foreground text-xs">/day</span></p>
                          <p className="text-xs text-muted-foreground">{formatKES(inv.totalEarned)} earned</p>
                        </div>
                      </div>
                      <Progress value={inv.progressPercent ?? 0} className="h-1.5" />
                      <div className="flex justify-between mt-1.5">
                        <p className="text-xs text-muted-foreground">{(inv.progressPercent ?? 0).toFixed(1)}% complete</p>
                        <Badge variant="secondary" className="text-xs h-4">Active</Badge>
                      </div>
                      {inv.completesAt && (
                        <p className="text-xs text-muted-foreground mt-1.5">
                          🔒 Withdraw on: <strong>{formatDate(String(inv.completesAt))}</strong>
                        </p>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Transactions */}
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-3 pt-4 px-5">
              <CardTitle className="text-sm font-semibold">Recent Activity</CardTitle>
              <Link href="/transactions">
                <Button variant="ghost" size="sm" className="h-7 text-xs">View All</Button>
              </Link>
            </CardHeader>
            <CardContent className="px-5 pb-5">
              {recentTransactions.length === 0 ? (
                <div className="text-center py-10 text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-30" />
                  <p className="text-sm">No transactions yet</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {recentTransactions.map((txn, idx) => (
                    <motion.div
                      key={txn.id}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: idx * 0.05 }}
                      className="flex items-center gap-3 py-2.5 border-b last:border-0"
                    >
                      <div className="bg-muted rounded-full p-1.5 shrink-0">
                        {txnIcon[txn.type] ?? <Sparkles className="h-4 w-4 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium capitalize leading-tight">{txn.type}</p>
                        <p className="text-xs text-muted-foreground truncate">{formatDate(String(txn.createdAt))}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`font-semibold text-sm ${txnColor[txn.type] ?? "text-foreground"}`}>
                          {txn.type === "withdrawal" ? "−" : "+"}{formatKES(txn.amount)}
                        </p>
                        <span className={`text-xs ${txn.status === "completed" ? "text-green-600" : txn.status === "pending" ? "text-yellow-600" : "text-red-500"}`}>
                          {txn.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
