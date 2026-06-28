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
  RefreshCw, UserCheck, UserX, ExternalLink, Briefcase,
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
  planName: string | null;
  amountInvested: number | null;
  bonusEarned: number;
  bonusExpected: number;
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
        Share your invite link below. As soon as your first friend makes a deposit, your <strong>10-day Elite challenge</strong> starts and you earn <strong>10% of their deposit instantly</strong>.
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
        You've started your <strong>10-day Elite challenge</strong>! Get <strong>{remaining} more active investor{remaining !== 1 ? "s" : ""}</strong> before time runs out to unlock <strong>30% Sunday bonus</strong>.
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
  const [showAllReferrals, setShowAllReferrals] = useState(false);
  const [applying, setApplying] = useState(false);
  const [view, setView] = useState<"benefits" | "dashboard">("benefits");
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

  useEffect(() => {
    if (stats && (stats.tier !== "none" || stats.referralCode)) {
      setView("dashboard");
    }
  }, [stats]);

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
        toast({ title: "✅ Enrolled!", description: "Check your email — your referral link and full program guide have been sent." });
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
  const isLegend = stats?.isLegend ?? false;
  const visibleReferrals = showAllReferrals ? referrals : referrals.slice(0, 6);

  const totalBonusEarned = referrals.reduce((s, r) => s + r.bonusEarned, 0);
  const totalBonusExpected = referrals.reduce((s, r) => s + r.bonusExpected, 0);

  /* ── Dashboard view ─────────────────────────────────────────────────────── */
  if (!loading && view === "dashboard" && stats && (tier !== "none" || stats.referralCode)) {
    return (
      <Layout requireAuth>
        <div className="container mx-auto px-4 py-8 max-w-2xl">

          <div className="flex items-start justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold">My Referral Dashboard</h1>
              <p className="text-muted-foreground text-sm mt-1">
                Track all your referrals, their plans, and your earnings in real time
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
                  {(tier === "elite" || isLegend) ? "✓" : Math.max(0, ELITE_TARGET - active)}
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {isLegend ? "Legend!" : tier === "elite" ? "Elite Unlocked" : "Still Needed"}
                </p>
              </div>
            </div>

            {/* Earnings summary */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-green-50 border border-green-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Zap className="h-4 w-4 text-green-600" />
                  <p className="text-xs font-semibold text-green-800">Instant Bonuses Earned</p>
                </div>
                <p className="text-xl font-bold text-green-700">{formatKES(totalBonusEarned)}</p>
                <p className="text-xs text-green-600 mt-0.5">10% already credited to you</p>
              </div>
              <div className="rounded-xl bg-amber-50 border border-amber-200 p-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="h-4 w-4 text-amber-600" />
                  <p className="text-xs font-semibold text-amber-800">Pending (Awaiting Deposit)</p>
                </div>
                <p className="text-xl font-bold text-amber-700">{formatKES(totalBonusExpected)}</p>
                <p className="text-xs text-amber-600 mt-0.5">unlocks when friends deposit</p>
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

            {/* People you've referred — full tracking table */}
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
                    <p className="text-xs text-muted-foreground mt-1">Share your link — your friends appear here the moment they sign up.</p>
                    <Button onClick={shareLink} size="sm" className="mt-4 gap-2">
                      <Share2 className="h-3.5 w-3.5" /> Share My Link
                    </Button>
                  </div>
                ) : (
                  <>
                    {/* Column headers */}
                    <div className="px-4 py-2 bg-muted/30 border-b grid grid-cols-[1fr_auto] text-xs font-semibold text-muted-foreground">
                      <span>Person &amp; Plan</span>
                      <span className="text-right">Your Earnings</span>
                    </div>
                    <div className="divide-y">
                      {visibleReferrals.map(r => (
                        <div key={r.id} className={`px-4 py-3.5 flex items-start gap-3 transition-colors ${r.isActive ? "bg-green-50/30" : ""}`}>
                          {/* Status icon */}
                          <div className={`shrink-0 w-9 h-9 rounded-full flex items-center justify-center mt-0.5 ${r.isActive ? "bg-green-100" : "bg-muted"}`}>
                            {r.isActive
                              ? <UserCheck className="h-4 w-4 text-green-600" />
                              : <UserX className="h-4 w-4 text-muted-foreground/60" />}
                          </div>

                          {/* Left: name, date, plan */}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold truncate">{r.refereeName}</p>
                            <p className="text-xs text-muted-foreground">Joined {formatDate(r.createdAt)}</p>
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              {r.isActive ? (
                                <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1 h-5">
                                  <CheckCircle2 className="h-2.5 w-2.5" /> Invested ✅
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground gap-1 h-5">
                                  <Clock className="h-2.5 w-2.5" /> Not yet invested
                                </Badge>
                              )}
                              {r.planName ? (
                                <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-xs gap-1 h-5">
                                  <Briefcase className="h-2.5 w-2.5" /> {r.planName}
                                </Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs text-muted-foreground gap-1 h-5">
                                  No plan yet
                                </Badge>
                              )}
                            </div>
                            {r.amountInvested !== null && (
                              <p className="text-xs text-muted-foreground mt-1">
                                Invested: <span className="font-medium text-foreground">{formatKES(r.amountInvested)}</span>
                              </p>
                            )}
                          </div>

                          {/* Right: earnings */}
                          <div className="shrink-0 text-right space-y-1 min-w-[90px]">
                            {r.bonusEarned > 0 ? (
                              <div>
                                <p className="text-sm font-bold text-green-600">+{formatKES(r.bonusEarned)}</p>
                                <p className="text-xs text-green-600">earned ✓</p>
                              </div>
                            ) : r.bonusExpected > 0 ? (
                              <div>
                                <p className="text-sm font-bold text-amber-600">{formatKES(r.bonusExpected)}</p>
                                <p className="text-xs text-amber-600">expected</p>
                              </div>
                            ) : (
                              <div>
                                <p className="text-sm font-bold text-muted-foreground">—</p>
                                <p className="text-xs text-muted-foreground">awaiting deposit</p>
                              </div>
                            )}
                            {r.depositBonusPaid && (
                              <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 text-xs gap-1 h-5">
                                <Zap className="h-2.5 w-2.5" /> Paid
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
                    {referrals.some(r => !r.isActive) && (
                      <div className="mx-4 mb-4 mt-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2.5 text-xs text-amber-800">
                        ⏳ <strong>Friends marked "Not yet invested"</strong> haven't deposited yet. Once they deposit via M-Pesa, they flip to <span className="text-green-700 font-semibold">Invested ✅</span> and you instantly earn 10% of their deposit!
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* Sunday payout history */}
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

            {stats.totalEarned > 0 && (
              <div className="rounded-2xl border-2 border-primary/20 bg-primary/5 p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="h-5 w-5 text-primary" />
                  <span className="font-semibold text-sm">Total Referral Earnings (All Time)</span>
                </div>
                <span className="text-xl font-bold text-primary">{formatKES(stats.totalEarned)}</span>
              </div>
            )}

            <button
              onClick={() => setView("benefits")}
              className="w-full text-xs text-muted-foreground hover:text-foreground text-center py-2 transition-colors"
            >
              View program details &amp; how bonuses work ↓
            </button>

          </div>
        </div>
      </Layout>
    );
  }

  /* ── Benefits / enroll view ─────────────────────────────────────────────── */
  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        <div className="mb-6 flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold">Invite &amp; Earn</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Read the full program below, then click Apply to get your personal invite link
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

            {/* Hero banner */}
            <div className="rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-primary/20 text-primary flex items-center justify-center mx-auto mb-3">
                <Gift className="h-7 w-7" />
              </div>
              <h2 className="text-xl font-bold mb-1">Zenti Referral Program</h2>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">
                Invite friends to invest on Zenti and earn automatic bonuses every time they deposit or earn.
              </p>
            </div>

            {/* What you earn — instant 10% */}
            <div className="rounded-xl border bg-green-50 border-green-200 p-5">
              <div className="flex items-start gap-3">
                <div className="bg-green-500 text-white p-2 rounded-xl shrink-0 mt-0.5"><Zap className="h-4 w-4" /></div>
                <div>
                  <p className="font-bold text-green-900 text-base">Instant 10% Bonus — Every First Deposit</p>
                  <p className="text-sm text-green-800 mt-1">
                    The moment your friend makes their <strong>first real M-Pesa deposit</strong>, you automatically receive <strong>10% of that amount</strong> directly into your Zenti balance — no waiting, no action needed.
                  </p>
                  <div className="mt-3 bg-white/60 rounded-lg px-3 py-2 text-xs text-green-900 font-medium">
                    Example: Friend deposits KES 5,000 → you receive <strong>KES 500 instantly</strong>
                  </div>
                  <Badge className="mt-3 bg-green-200 text-green-900 border-green-300 text-xs">⚡ Auto-credited the moment they pay</Badge>
                </div>
              </div>
            </div>

            {/* Weekly Sunday bonus */}
            <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-5">
              <div className="flex items-start gap-3">
                <div className="bg-yellow-500 text-white p-2 rounded-xl shrink-0 mt-0.5"><CalendarClock className="h-4 w-4" /></div>
                <div>
                  <p className="font-bold text-yellow-900 text-base">Weekly Sunday Bonus — Up to 40%</p>
                  <p className="text-sm text-yellow-800 mt-1 mb-3">
                    Every Sunday at 11:59 PM EAT our system runs automatically and credits a percentage of your active referrals' earnings straight to your wallet.
                  </p>
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                      <Sparkles className="h-4 w-4 text-purple-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-purple-900">Legend Tier — 35–40% every Sunday</p>
                        <p className="text-xs text-purple-700">Get 10+ active investors in your first 7 days</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                      <Trophy className="h-4 w-4 text-yellow-600 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-yellow-900">Elite Tier — 30% every Sunday</p>
                        <p className="text-xs text-yellow-700">Get 5+ active investors within 10 days</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 bg-white/60 rounded-lg px-3 py-2">
                      <Star className="h-4 w-4 text-blue-500 shrink-0" />
                      <div>
                        <p className="text-xs font-bold text-blue-900">Standard Tier — 5–10% every Sunday</p>
                        <p className="text-xs text-blue-700">Default for all enrolled members</p>
                      </div>
                    </div>
                  </div>
                  <Badge className="mt-3 bg-yellow-200 text-yellow-900 border-yellow-300 text-xs">📅 Every Sunday at 11:59 PM EAT — fully automatic</Badge>
                </div>
              </div>
            </div>

            {/* Fully automated */}
            <div className="rounded-xl border bg-muted/20 p-4">
              <div className="flex items-center gap-2 mb-3">
                <Zap className="h-4 w-4 text-primary shrink-0" />
                <p className="font-semibold text-sm">100% Automated — No Action Required From You</p>
              </div>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Instant deposit bonus</strong> — credited the moment your friend pays via M-Pesa</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Sunday bonus</strong> — calculated and credited every Sunday at 11:59 PM EAT automatically</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Real-time tracking</strong> — see your referrals, their plans, and your earnings instantly</span>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 shrink-0 mt-0.5" />
                  <span><strong className="text-foreground">Email confirmation</strong> — you receive your invite link and full guide by email when you apply</span>
                </div>
              </div>
            </div>

            {/* Step-by-step guide */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-primary" />
                  How It Works — Step by Step
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {[
                  {
                    title: "Apply and get your personal invite link",
                    desc: "Click Apply below. You'll receive your unique referral link and a full program guide by email immediately.",
                    icon: <Mail className="h-4 w-4 text-blue-600" />,
                  },
                  {
                    title: "Share your link on WhatsApp, Facebook, or SMS",
                    desc: "The more people you share with, the more you earn. Send to friends, family, and colleagues.",
                    icon: <Share2 className="h-4 w-4 text-primary" />,
                  },
                  {
                    title: "Friend signs up and makes a deposit",
                    desc: "When they deposit via M-Pesa, they become your active investor. You instantly earn 10% of their deposit — credited automatically.",
                    icon: <Zap className="h-4 w-4 text-green-600" />,
                  },
                  {
                    title: "Your 10-day Elite challenge starts",
                    desc: "Once your 1st active investor joins, the countdown starts. Get 4 more to reach Elite (30% Sunday bonus). Get 10+ in 7 days for Legend (35–40%)!",
                    icon: <Clock className="h-4 w-4 text-orange-600" />,
                  },
                  {
                    title: "Every Sunday at 11:59 PM — bonus auto-credited 🎁",
                    desc: "No action needed. Your weekly bonus goes straight to your Zenti wallet and you'll see it in your dashboard.",
                    icon: <CalendarClock className="h-4 w-4 text-purple-600" />,
                  },
                ].map((s, i) => (
                  <div key={i} className="flex items-start gap-3">
                    <StepBadge n={i + 1} />
                    <div>
                      <div className="flex items-center gap-2">
                        {s.icon}
                        <p className="font-semibold text-sm">{s.title}</p>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{s.desc}</p>
                    </div>
                  </div>
                ))}
                <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800">
                  <strong>⏳ Missed the Elite countdown?</strong> No problem — you still earn 5–10% Sunday bonus every week (Standard tier). Keep sharing and keep growing!
                </div>
              </CardContent>
            </Card>

            {/* Fraud warning */}
            <div className="rounded-2xl border-2 border-red-300 bg-red-50 p-4">
              <div className="flex items-start gap-3">
                <ShieldAlert className="h-5 w-5 text-red-600 mt-0.5 shrink-0" />
                <div>
                  <p className="font-bold text-red-900 text-sm">⚠️ Important Fraud Warning</p>
                  <p className="text-xs text-red-800 mt-1 leading-relaxed">
                    Our automated fraud system monitors all referral activity 24/7. Creating fake accounts, using bots, or inviting yourself will result in an <strong>immediate permanent ban</strong> and forfeiture of all bonuses. Only invite real people.
                  </p>
                </div>
              </div>
            </div>

            {/* Apply button — at the bottom after reading everything */}
            {tier === "none" && !stats?.referralCode ? (
              <div className="rounded-2xl border-2 border-primary bg-primary/5 p-5">
                <div className="flex items-start gap-3 mb-4">
                  <Mail className="h-5 w-5 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="font-bold text-foreground">Ready to Join?</p>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      After applying, your unique invite link will be sent to your email. You'll also see your full referral dashboard here.
                    </p>
                  </div>
                </div>
                <Button onClick={applyToProgram} disabled={applying} size="lg" className="w-full gap-2 text-base">
                  {applying
                    ? <><RefreshCw className="h-4 w-4 animate-spin" /> Enrolling…</>
                    : <><ArrowRight className="h-4 w-4" /> Apply Now — I've Read the Benefits</>}
                </Button>
                <p className="text-xs text-muted-foreground text-center mt-2">
                  Your referral link will be emailed to you immediately after applying
                </p>
              </div>
            ) : (
              <Button onClick={() => setView("dashboard")} size="lg" className="w-full gap-2">
                <Users className="h-4 w-4" /> Go to My Referral Dashboard
              </Button>
            )}

          </div>
        )}
      </div>
    </Layout>
  );
}
