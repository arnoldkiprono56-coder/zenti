import { useEffect, useState, useRef } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatKES, formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import {
  Copy, Users, TrendingUp, Gift, Clock, Trophy, Star,
  CheckCircle2, ArrowRight, Zap, Share2, ChevronDown, ChevronUp,
  AlertTriangle, CalendarClock, Sparkles, ShieldAlert, Mail,
  RefreshCw, UserCheck, UserX, ExternalLink,
} from "lucide-react";

type ReferralStats = {
  referralCode: string;
  referralLink: string;
  tier: "none" | "countdown" | "elite" | "standard";
  countdownDaysLeft: number | null;
  countdownDeadline: string | null;
  activeReferrals: number;
  totalReferrals: number;
  totalEarned: number;
  isLegend: boolean;
  recentPayouts: Array<{
    id: number;
    bonusAmount: number;
    bonusPercent: number;
    isElite: boolean;
    payoutDate: string;
  }>;
};

type ReferralRecord = {
  id: number;
  refereeId: number;
  refereeName: string;
  refereeEmail: string;
  isActive: boolean;
  depositBonusPaid: boolean;
  createdAt: string;
};

const ELITE_TARGET = 5;

function StepBadge({ n }: { n: number }) {
  return (
    <div className="w-8 h-8 rounded-full bg-primary text-white text-sm font-bold flex items-center justify-center shrink-0">
      {n}
    </div>
  );
}

function TierBanner({ stats, shareLink }: { stats: ReferralStats; shareLink: () => void }) {
  const { tier, isLegend, activeReferrals: active, countdownDaysLeft } = stats;
  const remaining = Math.max(0, ELITE_TARGET - active);
  const progressPct = Math.min(100, (active / ELITE_TARGET) * 100);

  if (tier === "none" && stats.referralCode) return (
    <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-primary/20 text-primary p-2.5 rounded-xl"><Gift className="h-5 w-5" /></div>
        <div>
          <p className="font-bold text-foreground text-lg">🎉 You're Enrolled!</p>
          <Badge className="bg-primary/10 text-primary border-primary/20 text-xs">Referral Program Active</Badge>
        </div>
      </div>
      <p className="text-sm text-muted-foreground bg-muted/40 rounded-xl px-4 py-3 mt-2">
        Share your invite link below. As soon as your first friend makes a deposit, your <strong>10-day Elite challenge</strong> starts automatically and you earn <strong>10% of their deposit instantly</strong>.
      </p>
    </div>
  );

  if (isLegend) return (
    <div className="rounded-2xl border-2 border-purple-400 bg-purple-50 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-purple-500 text-white p-2.5 rounded-xl"><Sparkles className="h-5 w-5" /></div>
        <div>
          <p className="font-bold text-purple-900 text-lg">🌟 You're a Legend!</p>
          <Badge className="bg-purple-200 text-purple-900 border-purple-400 text-xs">Legend Tier — Top Earner</Badge>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-purple-700">Total Earned</p>
          <p className="text-xl font-bold text-purple-900">{formatKES(stats.totalEarned)}</p>
        </div>
      </div>
      <p className="text-sm text-purple-800 bg-purple-100 rounded-xl px-4 py-3 mt-2">
        🎉 You got 10+ active investors in your first week! Every Sunday you automatically receive <strong>35–40% of your referrals' earnings</strong> — the highest bonus tier on Zenti!
      </p>
    </div>
  );

  if (tier === "elite") return (
    <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-yellow-400 text-white p-2.5 rounded-xl"><Trophy className="h-5 w-5" /></div>
        <div>
          <p className="font-bold text-yellow-900 text-lg">🏆 You're Elite!</p>
          <Badge className="bg-yellow-200 text-yellow-900 border-yellow-400 text-xs">Elite Referrer</Badge>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-yellow-700">Total Earned</p>
          <p className="text-xl font-bold text-yellow-900">{formatKES(stats.totalEarned)}</p>
        </div>
      </div>
      <p className="text-sm text-yellow-800 bg-yellow-100 rounded-xl px-4 py-3 mt-2">
        🎉 Every Sunday at 11:59 PM, <strong>30% of your active referrals' earnings</strong> is automatically sent to your Zenti balance — no action needed!
      </p>
    </div>
  );

  if (tier === "standard") return (
    <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className="bg-blue-500 text-white p-2.5 rounded-xl"><Star className="h-5 w-5" /></div>
        <div>
          <p className="font-bold text-blue-900 text-lg">⭐ Standard Referrer</p>
          <Badge className="bg-blue-200 text-blue-900 border-blue-300 text-xs">Standard Tier</Badge>
        </div>
        <div className="ml-auto text-right">
          <p className="text-xs text-blue-700">Total Earned</p>
          <p className="text-xl font-bold text-blue-900">{formatKES(stats.totalEarned)}</p>
        </div>
      </div>
      <p className="text-sm text-blue-800 bg-blue-100 rounded-xl px-4 py-3 mt-2">
        📅 Every Sunday at 11:59 PM our system automatically credits <strong>5–10% of your referrals' earnings</strong>. Get 5 active investors to upgrade to Elite (30%)!
      </p>
    </div>
  );

  if (tier === "countdown") return (
    <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="bg-orange-500 text-white p-2.5 rounded-xl animate-pulse"><Clock className="h-5 w-5" /></div>
        <div>
          <p className="font-bold text-orange-900 text-lg">⏳ Qualifying for Elite</p>
          <Badge className="bg-orange-200 text-orange-900 border-orange-400 text-xs">Countdown Active</Badge>
        </div>
        {countdownDaysLeft !== null && (
          <div className="ml-auto text-right">
            <p className="text-xs text-orange-700">Time Left</p>
            <p className="text-xl font-bold text-orange-900">{countdownDaysLeft} days</p>
          </div>
        )}
      </div>
      <p className="text-sm text-orange-800 mb-4">
        You've started your <strong>10-day Elite challenge</strong>! Get <strong>{remaining} more active investor{remaining !== 1 ? "s" : ""}</strong> before time runs out to unlock <strong>30% Sunday bonus</strong>. Get 10+ this week for the <strong>Legend bonus (35–40%)</strong>!
      </p>
      <div className="space-y-1.5">
        <div className="flex justify-between text-xs font-medium text-orange-800">
          <span>{active} of {ELITE_TARGET} active investors</span>
          <span className="font-bold">{remaining} more needed</span>
        </div>
        <Progress value={progressPct} className="h-3 bg-orange-200 [&>div]:bg-orange-500" />
        <div className="flex justify-between">
          {Array.from({ length: ELITE_TARGET }).map((_, i) => (
            <div key={i} className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${i < active ? "bg-orange-500 border-orange-500 text-white" : "bg-white border-orange-300 text-orange-300"}`}>
              {i < active ? "✓" : i + 1}
            </div>
          ))}
        </div>
      </div>
      {countdownDaysLeft !== null && countdownDaysLeft <= 3 && (
        <div className="mt-3 flex items-center gap-2 bg-red-100 text-red-800 rounded-xl px-3 py-2 text-xs font-medium">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          Only {countdownDaysLeft} day{countdownDaysLeft !== 1 ? "s" : ""} left — share your link NOW!
        </div>
      )}
      <Button onClick={shareLink} className="w-full mt-4 gap-2 bg-orange-500 hover:bg-orange-600">
        <Share2 className="h-4 w-4" /> Share Now to Unlock Elite
      </Button>
    </div>
  );

  return null;
}

export default function Referrals() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<"program" | "dashboard">("program");
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoRefreshRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const token = localStorage.getItem("investke_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    else setIsRefreshing(true);
    try {
      const [s, r] = await Promise.all([
        fetch(apiUrl("/api/referrals/me"), { headers }).then(r => r.json()),
        fetch(apiUrl("/api/referrals/my-referrals"), { headers }).then(r => r.json()),
      ]);
      setStats(s);
      setReferrals(Array.isArray(r) ? r : []);
      setLastRefreshed(new Date());
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Switch to dashboard view if already enrolled or just applied
  useEffect(() => {
    if (stats && (stats.tier !== "none" || stats.referralCode)) {
      setView("dashboard");
    }
  }, [stats]);

  // Auto-refresh every 30 s when on dashboard
  useEffect(() => {
    if (view === "dashboard") {
      autoRefreshRef.current = setInterval(() => loadData(true), 30_000);
    } else {
      if (autoRefreshRef.current) clearInterval(autoRefreshRef.current);
    }
    return () => { if (autoRefreshRef.current) clearInterval(autoRefreshRef.current); };
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

  const myLink = stats?.referralLink ?? "";

  const copyLink = () => {
    if (!myLink) return;
    navigator.clipboard.writeText(myLink);
    toast({ title: "Copied!", description: "Referral link copied. Share it with friends!" });
  };

  const shareLink = async () => {
    if (!myLink) return;
    if (navigator.share) {
      await navigator.share({ title: "Join Zenti — Earn Daily Returns", text: "I'm earning daily returns on Zenti. Join using my link and let's both grow our money!", url: myLink });
    } else {
      copyLink();
    }
  };

  const applyToProgram = async () => {
    setApplying(true);
    try {
      const r = await fetch(apiUrl("/api/referrals/apply"), { method: "POST", headers });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "✅ Enrolled!", description: "Check your email for your referral link and full program guide." });
        await loadData();
        setView("dashboard");
      } else {
        toast({ title: "Error", description: data.error ?? "Could not enroll", variant: "destructive" });
      }
    } finally {
      setApplying(false);
    }
  };

  const tier = stats?.tier ?? "none";
  const active = stats?.activeReferrals ?? 0;
  const remaining = Math.max(0, ELITE_TARGET - active);
  const isLegend = stats?.isLegend ?? false;
  const visibleReferrals = showAllReferrals ? referrals : referrals.slice(0, 6);

  /* ── Dashboard view (enrolled users) ─────────────────────────────────────── */
  if (!loading && view === "dashboard" && stats && (tier !== "none" || stats.referralCode)) {
    return (
      <Layout requireAuth>
        <div className="container mx-auto px-4 py-8 max-w-2xl">

          {/* Header */}
          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">My Referral Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Your referrals update in real time — active as soon as friends deposit
              </p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => loadData(true)} disabled={isRefreshing} className="gap-1.5 text-xs shrink-0">
              <RefreshCw className={`h-3.5 w-3.5 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>

          {lastRefreshed && (
            <p className="text-xs text-muted-foreground mb-4 text-right">
              Last updated {lastRefreshed.toLocaleTimeString("en-KE", { hour: "2-digit", minute: "2-digit", second: "2-digit" })} · auto-refreshes every 30s
            </p>
          )}

          <div className="space-y-5">

            {/* Tier banner */}
            <TierBanner stats={stats} shareLink={shareLink} />

            {/* Stats row */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-xl bg-muted/50 p-3 text-center">
                <p className="text-2xl font-bold text-foreground">{stats.totalReferrals}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Total Invited</p>
              </div>
              <div className="rounded-xl bg-green-50 border border-green-200 p-3 text-center">
                <p className="text-2xl font-bold text-green-700">{active}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Active Investors</p>
              </div>
              <div className={`rounded-xl p-3 text-center ${isLegend ? "bg-purple-50 border border-purple-200" : tier === "elite" ? "bg-yellow-50 border border-yellow-200" : "bg-muted/50"}`}>
                <p className={`text-2xl font-bold ${isLegend ? "text-purple-700" : tier === "elite" ? "text-yellow-700" : "text-foreground"}`}>
                  {(tier === "elite" || isLegend) ? "✓" : remaining}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isLegend ? "Legend!" : tier === "elite" ? "Elite Unlocked" : "Still Needed"}
                </p>
              </div>
            </div>

            {/* Referral link card */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  Your Invite Link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-muted rounded-xl px-3 py-2.5 text-xs font-mono break-all text-muted-foreground select-all">
                  {myLink}
                </div>
                <div className="flex gap-2">
                  <Button onClick={shareLink} className="flex-1 gap-2">
                    <Share2 className="h-4 w-4" /> Share Link
                  </Button>
                  <Button variant="outline" onClick={copyLink} className="gap-2 shrink-0">
                    <Copy className="h-4 w-4" /> Copy
                  </Button>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>Your code: <strong className="text-foreground font-mono">{stats.referralCode}</strong></span>
                  <a href={myLink} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-primary hover:underline">
                    Preview <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              </CardContent>
            </Card>

            {/* People you've referred — the main real-time tracker */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    People You've Invited
                    <span className="text-muted-foreground font-normal text-sm">({referrals.length})</span>
                  </CardTitle>
                  <div className="flex items-center gap-1.5">
                    <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{active} Active</Badge>
                    {referrals.length - active > 0 && (
                      <Badge variant="outline" className="text-xs text-muted-foreground">{referrals.length - active} Waiting</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {referrals.length === 0 ? (
                  <div className="text-center py-10 px-4">
                    <Users className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
                    <p className="font-medium text-sm text-muted-foreground">No one referred yet</p>
                    <p className="text-xs text-muted-foreground mt-1">Share your link — your friends will appear here the moment they sign up.</p>
                    <Button onClick={shareLink} size="sm" className="mt-4 gap-2">
                      <Share2 className="h-3.5 w-3.5" /> Share My Link
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Legend row */}
                    <div className="px-4 py-2 bg-muted/30 border-b grid grid-cols-3 text-xs font-semibold text-muted-foreground">
                      <span>Name</span>
                      <span className="text-center">Joined</span>
                      <span className="text-right">Status</span>
                    </div>
                    <div className="divide-y">
                      {visibleReferrals.map(r => (
                        <div key={r.id} className={`px-4 py-3 flex items-center gap-3 transition-colors ${r.isActive ? "bg-green-50/40" : ""}`}>
                          {/* Icon */}
                          <div className={`shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${r.isActive ? "bg-green-100" : "bg-muted"}`}>
                            {r.isActive
                              ? <UserCheck className="h-4 w-4 text-green-600" />
                              : <UserX className="h-4 w-4 text-muted-foreground/60" />}
                          </div>
                          {/* Name + date */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium truncate">{r.refereeName}</p>
                            <p className="text-xs text-muted-foreground">Joined {formatDate(r.createdAt)}</p>
                          </div>
                          {/* Status badges */}
                          <div className="flex flex-col items-end gap-1 shrink-0">
                            {r.isActive ? (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
                                <CheckCircle2 className="h-2.5 w-2.5" /> Invested ✅
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-xs text-muted-foreground gap-1">
                                <Clock className="h-2.5 w-2.5" /> Not yet invested
                              </Badge>
                            )}
                            {r.depositBonusPaid && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs gap-1">
                                <Zap className="h-2.5 w-2.5" /> Bonus paid
                              </Badge>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    {referrals.length > 6 && (
                      <div className="px-4 py-3 border-t">
                        <button onClick={() => setShowAllReferrals(v => !v)} className="text-xs text-primary font-medium flex items-center gap-1 hover:underline">
                          {showAllReferrals
                            ? <><ChevronUp className="h-3 w-3" /> Show less</>
                            : <><ChevronDown className="h-3 w-3" /> Show all {referrals.length} people</>}
                        </button>
                      </div>
                    )}
                    {/* Help tip for pending referrals */}
                    {referrals.some(r => !r.isActive) && (
                      <div className="mx-4 mb-4 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                        ⏳ <strong>Friends marked "Not yet invested"</strong> have signed up but haven't made a deposit yet. Share your link and encourage them — once they deposit via M-Pesa, they flip to <span className="text-green-700 font-semibold">Invested ✅</span> and you instantly earn 10% of their deposit!
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Payout history */}
            {(stats.recentPayouts?.length ?? 0) > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 text-primary" />
                    Sunday Bonus History
                    <Badge className="text-xs bg-primary/10 text-primary border-primary/20 ml-auto">Auto-credited</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="divide-y">
                    {stats.recentPayouts.map(p => (
                      <div key={p.id} className="px-4 py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{formatDate(p.payoutDate)}</p>
                          <p className="text-xs text-muted-foreground">
                            {p.bonusPercent}% Sunday bonus
                            <span className={`ml-1.5 font-medium ${p.isElite ? "text-yellow-700" : "text-blue-600"}`}>
                              {p.isElite ? "• Elite" : "• Standard"}
                            </span>
                          </p>
                        </div>
                        <p className="font-bold text-green-600">+{formatKES(p.bonusAmount)}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Total earned summary */}
            {stats.totalEarned > 0 && (
              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">Total Referral Earnings</span>
                </div>
                <span className="text-xl font-bold text-primary">{formatKES(stats.totalEarned)}</span>
              </div>
            )}

            {/* View program info toggle */}
            <button
              onClick={() => setView("program")}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 transition-colors"
            >
              View program details & how bonuses work ↓
            </button>

          </div>
        </div>
      </Layout>
    );
  }

  /* ── Program / enroll view ─────────────────────────────────────────────── */
  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invite & Earn</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Share your link → friends invest → you earn bonuses automatically every Sunday at 11:59 PM
            </p>
          </div>
          {(tier !== "none" || stats?.referralCode) && (
            <Button variant="outline" size="sm" onClick={() => setView("dashboard")} className="gap-1.5 text-xs shrink-0">
              <Users className="h-3.5 w-3.5" /> My Dashboard
            </Button>
          )}
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* Fraud warning */}
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-red-900 text-sm">⚠️ Important Fraud Warning</p>
                  <p className="text-xs text-red-800 mt-1 leading-relaxed">
                    Our automated fraud system monitors all referral activity 24/7. Creating fake accounts, using bots, or inviting yourself will result in an <strong>immediate permanent ban</strong> and loss of all bonuses. Only invite real people.
                  </p>
                </div>
              </div>
            </div>

            {/* Enroll card — only shown when tier is none */}
            {tier === "none" && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-primary/20 text-primary p-2.5 rounded-xl"><Gift className="h-5 w-5" /></div>
                  <div>
                    <p className="font-bold text-foreground text-lg">Join the Referral Program</p>
                    <p className="text-xs text-muted-foreground">Get your link & receive confirmation by email</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  Click "Apply Now" to officially join the referral program. You'll receive your personal invite link and a full program guide by email.
                </p>
                <div className="rounded-xl bg-muted/40 p-3 mb-4 space-y-1.5">
                  <p className="text-xs font-semibold text-foreground">What you get when you apply:</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600 shrink-0" />
                    <span>Your unique referral link instantly</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Mail className="h-3.5 w-3.5 text-blue-600 shrink-0" />
                    <span>Email confirmation with full program guide</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Zap className="h-3.5 w-3.5 text-yellow-600 shrink-0" />
                    <span>10% instant bonus on your friends' first deposits</span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="h-3.5 w-3.5 text-purple-600 shrink-0" />
                    <span>Up to 40% auto-credited Sunday bonus (Legend tier)</span>
                  </div>
                </div>
                <Button onClick={applyToProgram} disabled={applying} className="w-full gap-2">
                  {applying ? "Enrolling…" : <><ArrowRight className="h-4 w-4" /> Apply Now — Join the Program</>}
                </Button>
              </div>
            )}

            {/* Auto-credit info */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <p className="font-semibold text-sm">This is a Fully Automated B2C System</p>
              </div>
              <div className="space-y-1.5 text-xs text-muted-foreground">
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold shrink-0">✓</span>
                  <span><strong>Invitation bonus:</strong> Auto-credited instantly when your friend makes their first deposit — no action from you</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold shrink-0">✓</span>
                  <span><strong>Sunday bonus:</strong> System runs automatically every Sunday at 11:59 PM EAT — credited directly to your Zenti wallet</span>
                </div>
                <div className="flex items-start gap-2">
                  <span className="text-green-600 font-bold shrink-0">✓</span>
                  <span><strong>No minimum withdrawal</strong> for referral bonuses — funds land in your Zenti wallet</span>
                </div>
              </div>
            </div>

            {/* Bonus breakdown */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  How Your Bonuses Work
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="rounded-xl border bg-green-50 border-green-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-green-500 text-white p-1.5 rounded-lg shrink-0 mt-0.5"><Zap className="h-3.5 w-3.5" /></div>
                    <div>
                      <p className="font-semibold text-green-900 text-sm">Instant Invitation Bonus — 10%</p>
                      <p className="text-xs text-green-800 mt-1">The moment your friend makes their <strong>first real M-Pesa deposit</strong>, you automatically receive <strong>10% of that deposit</strong> straight into your Zenti balance.</p>
                      <Badge className="mt-2 bg-green-200 text-green-900 border-green-300 text-xs">⚡ Auto-credited instantly</Badge>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-500 text-white p-1.5 rounded-lg shrink-0 mt-0.5"><CalendarClock className="h-3.5 w-3.5" /></div>
                    <div>
                      <p className="font-semibold text-yellow-900 text-sm">Weekly Sunday Bonus — up to 40%</p>
                      <p className="text-xs text-yellow-800 mt-1 mb-2">Every Sunday at 11:59 PM our system runs automatically. Your referral bonus is calculated and credited:</p>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs text-yellow-800">
                          <Sparkles className="h-3 w-3 text-purple-600" />
                          <span><strong>Legend (10+ in first week):</strong> 35–40% every Sunday</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-yellow-800">
                          <Trophy className="h-3 w-3 text-yellow-600" />
                          <span><strong>Elite (5+ in 10 days):</strong> 30% every Sunday</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-yellow-800">
                          <Star className="h-3 w-3 text-blue-500" />
                          <span><strong>Standard:</strong> 5–10% every Sunday</span>
                        </div>
                      </div>
                      <Badge className="mt-2 bg-yellow-200 text-yellow-900 border-yellow-300 text-xs">📅 Auto-credited every Sunday at 11:59 PM EAT</Badge>
                    </div>
                  </div>
                </div>
                <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                  ℹ️ <strong>Important:</strong> Only friends who make real M-Pesa deposits count as "active investors". Free internship users do not qualify.
                </div>
              </CardContent>
            </Card>

            {/* Step-by-step guide */}
            <Card>
              <button className="w-full text-left" onClick={() => setShowGuide(g => !g)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-primary" />
                      How to Qualify for Elite (Step by Step)
                    </CardTitle>
                    {showGuide ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </CardHeader>
              </button>
              {showGuide && (
                <CardContent className="pt-0 space-y-4">
                  <div className="space-y-4">
                    {[
                      { title: "Apply and get your unique invite link", desc: "Click \"Apply Now\" above. You get your link instantly and receive a full guide by email." },
                      { title: "Share your link on WhatsApp, Facebook, or SMS", desc: "The more people you share with, the more you earn. Send to friends, family, and colleagues." },
                      { title: "Your friend signs up and makes a deposit", desc: "When they deposit via M-Pesa, they become your \"active investor\". You instantly earn 10% of their deposit. ✅" },
                      { title: "Your 10-day Elite challenge starts automatically", desc: "Once your 1st active investor joins, the 10-day countdown starts. Get 4 more to reach Elite. Get 10+ in 7 days for the Legend tier!" },
                      { title: "Every Sunday at 11:59 PM — bonus auto-credited 🎁", desc: "Our system runs automatically. No action needed. Your bonus goes straight to your Zenti wallet." },
                    ].map((s, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <StepBadge n={i + 1} />
                        <div>
                          <p className="font-semibold text-sm">{s.title}</p>
                          <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800">
                    <strong>⏳ Missed the countdown?</strong> No problem — you still earn 5–10% Sunday bonus (Standard tier). Keep growing!
                  </div>
                  {tier !== "none" && (
                    <Button onClick={shareLink} className="w-full gap-2">
                      <ArrowRight className="h-4 w-4" /> Share Your Link Now
                    </Button>
                  )}
                </CardContent>
              )}
            </Card>

          </div>
        )}
      </div>
    </Layout>
  );
}
