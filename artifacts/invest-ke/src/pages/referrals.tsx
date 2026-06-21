import { useEffect, useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { formatKES, formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import {
  Copy, Users, TrendingUp, Gift, Clock, Trophy, Star,
  CheckCircle2, ArrowRight, Zap, Share2, ChevronDown, ChevronUp,
  AlertCircle, CalendarClock, Sparkles,
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

export default function Referrals() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [showGuide, setShowGuide] = useState(false);
  const [showAllReferrals, setShowAllReferrals] = useState(false);

  const token = localStorage.getItem("investke_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  useEffect(() => {
    Promise.all([
      fetch(apiUrl("/api/referrals/me"), { headers }).then(r => r.json()),
      fetch(apiUrl("/api/referrals/my-referrals"), { headers }).then(r => r.json()),
    ]).then(([s, r]) => {
      setStats(s);
      setReferrals(Array.isArray(r) ? r : []);
    }).finally(() => setLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const myLink = stats
    ? `${window.location.origin}${import.meta.env.BASE_URL}register?ref=${stats.referralCode}`
    : "";

  const copyLink = () => {
    if (!myLink) return;
    navigator.clipboard.writeText(myLink);
    toast({ title: "Copied!", description: "Referral link copied. Share it with friends!" });
  };

  const shareLink = async () => {
    if (!myLink) return;
    if (navigator.share) {
      await navigator.share({
        title: "Join Zenti — Earn Daily Returns",
        text: "I'm earning daily returns on Zenti. Join using my link and let's both grow our money!",
        url: myLink,
      });
    } else {
      copyLink();
    }
  };

  const tier = stats?.tier ?? "none";
  const active = stats?.activeReferrals ?? 0;
  const remaining = Math.max(0, ELITE_TARGET - active);
  const progressPct = Math.min(100, (active / ELITE_TARGET) * 100);

  const visibleReferrals = showAllReferrals ? referrals : referrals.slice(0, 5);

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-2xl">

        {/* ── HEADER ──────────────────────────────────────────────────────── */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Invite & Earn</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Share your link → your friends invest → you earn bonuses automatically
          </p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full rounded-2xl" />
            <Skeleton className="h-32 w-full rounded-2xl" />
            <Skeleton className="h-48 w-full rounded-2xl" />
          </div>
        ) : (
          <div className="space-y-5">

            {/* ── TIER STATUS CARD ─────────────────────────────────────────── */}
            {tier === "elite" && (
              <div className="rounded-2xl border-2 border-yellow-400 bg-yellow-50 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-yellow-400 text-white p-2.5 rounded-xl">
                    <Trophy className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-yellow-900 text-lg">🏆 You're Elite!</p>
                    <Badge className="bg-yellow-200 text-yellow-900 border-yellow-400 text-xs">Elite Referrer</Badge>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-yellow-700">Total Earned</p>
                    <p className="text-xl font-bold text-yellow-900">{formatKES(stats?.totalEarned ?? 0)}</p>
                  </div>
                </div>
                <p className="text-sm text-yellow-800 bg-yellow-100 rounded-xl px-4 py-3 mt-2">
                  🎉 Every Sunday, <strong>30% of your active referrals' earnings</strong> is automatically sent to your Zenti balance — no action needed!
                </p>
              </div>
            )}

            {tier === "standard" && (
              <div className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5">
                <div className="flex items-center gap-3 mb-2">
                  <div className="bg-blue-500 text-white p-2.5 rounded-xl">
                    <Star className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-blue-900 text-lg">⭐ Standard Referrer</p>
                    <Badge className="bg-blue-200 text-blue-900 border-blue-300 text-xs">Standard Tier</Badge>
                  </div>
                  <div className="ml-auto text-right">
                    <p className="text-xs text-blue-700">Total Earned</p>
                    <p className="text-xl font-bold text-blue-900">{formatKES(stats?.totalEarned ?? 0)}</p>
                  </div>
                </div>
                <p className="text-sm text-blue-800 bg-blue-100 rounded-xl px-4 py-3 mt-2">
                  📅 Every Sunday you automatically receive <strong>5–10% of your referrals' earnings</strong>. Grow to 5 active investors to upgrade to Elite (30%)!
                </p>
              </div>
            )}

            {tier === "countdown" && (
              <div className="rounded-2xl border-2 border-orange-400 bg-orange-50 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-orange-500 text-white p-2.5 rounded-xl animate-pulse">
                    <Clock className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-orange-900 text-lg">⏳ Qualifying for Elite</p>
                    <Badge className="bg-orange-200 text-orange-900 border-orange-400 text-xs">Countdown Active</Badge>
                  </div>
                  {stats?.countdownDaysLeft !== null && (
                    <div className="ml-auto text-right">
                      <p className="text-xs text-orange-700">Time Left</p>
                      <p className="text-xl font-bold text-orange-900">{stats!.countdownDaysLeft} days</p>
                    </div>
                  )}
                </div>

                <p className="text-sm text-orange-800 mb-4">
                  You've started your <strong>10-day Elite challenge</strong>! Get <strong>{remaining} more active investor{remaining !== 1 ? "s" : ""}</strong> before time runs out to unlock the <strong>30% Sunday bonus</strong>.
                </p>

                {/* Progress bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-orange-800">
                    <span>{active} of {ELITE_TARGET} active investors</span>
                    <span className="font-bold">{remaining} more needed</span>
                  </div>
                  <Progress
                    value={progressPct}
                    className="h-3 bg-orange-200 [&>div]:bg-orange-500"
                  />
                  <div className="flex justify-between">
                    {Array.from({ length: ELITE_TARGET }).map((_, i) => (
                      <div
                        key={i}
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs font-bold transition-colors ${
                          i < active
                            ? "bg-orange-500 border-orange-500 text-white"
                            : "bg-white border-orange-300 text-orange-300"
                        }`}
                      >
                        {i < active ? "✓" : i + 1}
                      </div>
                    ))}
                  </div>
                </div>

                {stats?.countdownDaysLeft !== null && stats!.countdownDaysLeft <= 3 && (
                  <div className="mt-3 flex items-center gap-2 bg-red-100 text-red-800 rounded-xl px-3 py-2 text-xs font-medium">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0" />
                    Only {stats!.countdownDaysLeft} day{stats!.countdownDaysLeft !== 1 ? "s" : ""} left — share your link NOW to qualify!
                  </div>
                )}
              </div>
            )}

            {tier === "none" && (
              <div className="rounded-2xl border-2 border-primary/30 bg-primary/5 p-5">
                <div className="flex items-center gap-3 mb-3">
                  <div className="bg-primary/20 text-primary p-2.5 rounded-xl">
                    <Gift className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-bold text-foreground text-lg">Start Earning Bonuses</p>
                    <p className="text-xs text-muted-foreground">Share your link to begin</p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mb-4">
                  When your first friend joins and makes a real investment, your <strong>10-day Elite challenge starts automatically</strong>. Get 5 friends investing within 10 days to unlock the 30% Sunday bonus!
                </p>
                {/* Teaser progress */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-medium text-muted-foreground">
                    <span>0 of 5 active investors</span>
                    <span>5 more needed for Elite</span>
                  </div>
                  <Progress value={0} className="h-3" />
                </div>
              </div>
            )}

            {/* ── QUALIFICATION TRACKER (always visible) ───────────────────── */}
            {tier !== "none" && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    Your Referral Progress
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-center">
                    <div className="rounded-xl bg-muted/50 p-3">
                      <p className="text-2xl font-bold text-primary">{stats?.totalReferrals ?? 0}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Total Invited</p>
                    </div>
                    <div className="rounded-xl bg-green-50 border border-green-200 p-3">
                      <p className="text-2xl font-bold text-green-700">{active}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Active Investors</p>
                    </div>
                    <div className={`rounded-xl p-3 ${tier === "elite" ? "bg-yellow-50 border border-yellow-200" : "bg-muted/50"}`}>
                      <p className={`text-2xl font-bold ${tier === "elite" ? "text-yellow-700" : "text-foreground"}`}>
                        {tier === "elite" ? "✓" : remaining}
                      </p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {tier === "elite" ? "Elite Unlocked" : "Still Needed"}
                      </p>
                    </div>
                  </div>

                  {tier !== "elite" && (
                    <div className="rounded-xl bg-muted/30 p-3 text-sm">
                      <div className="flex items-center gap-2 mb-1">
                        <Zap className="h-4 w-4 text-primary shrink-0" />
                        <span className="font-semibold">
                          {remaining === 0
                            ? "You have enough active investors!"
                            : `${remaining} more active investor${remaining !== 1 ? "s" : ""} to unlock Elite`}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground pl-6">
                        An "active investor" is a friend who joined through your link <strong>and</strong> made a real M-Pesa deposit into a plan.
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* ── YOUR REFERRAL LINK ───────────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Share2 className="h-4 w-4 text-primary" />
                  Your Invite Link
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="bg-muted rounded-xl px-3 py-2.5 text-sm font-mono break-all text-muted-foreground text-xs">
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
                <p className="text-xs text-center text-muted-foreground">
                  Your code: <strong className="text-foreground font-mono">{stats?.referralCode}</strong>
                </p>
              </CardContent>
            </Card>

            {/* ── HOW YOUR BONUSES WORK ────────────────────────────────────── */}
            <Card className="border-primary/20">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-primary" />
                  How Your Bonuses Work
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Bonus 1 */}
                <div className="rounded-xl border bg-green-50 border-green-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-green-500 text-white p-1.5 rounded-lg shrink-0 mt-0.5">
                      <Zap className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-green-900 text-sm">Instant Invitation Bonus — 10%</p>
                      <p className="text-xs text-green-800 mt-1">
                        The moment your friend makes their <strong>first real M-Pesa deposit</strong>, you automatically receive <strong>10% of that deposit</strong> straight into your Zenti balance. No action needed from you!
                      </p>
                      <Badge className="mt-2 bg-green-200 text-green-900 border-green-300 text-xs">Auto-credited instantly</Badge>
                    </div>
                  </div>
                </div>

                {/* Bonus 2 */}
                <div className="rounded-xl border bg-yellow-50 border-yellow-200 p-4">
                  <div className="flex items-start gap-3">
                    <div className="bg-yellow-500 text-white p-1.5 rounded-lg shrink-0 mt-0.5">
                      <CalendarClock className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <p className="font-semibold text-yellow-900 text-sm">Weekly Sunday Bonus — up to 30%</p>
                      <p className="text-xs text-yellow-800 mt-1">
                        Every Sunday, a percentage of all your active referrals' earnings that week is automatically added to your balance:
                      </p>
                      <div className="mt-2 space-y-1">
                        <div className="flex items-center gap-2 text-xs text-yellow-800">
                          <Trophy className="h-3 w-3 text-yellow-600" />
                          <span><strong>Elite (5+ active investors):</strong> You earn 30% every Sunday</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-yellow-800">
                          <Star className="h-3 w-3 text-yellow-600" />
                          <span><strong>Standard:</strong> You earn 5–10% every Sunday</span>
                        </div>
                      </div>
                      <Badge className="mt-2 bg-yellow-200 text-yellow-900 border-yellow-300 text-xs">Auto-credited every Sunday</Badge>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
                  ℹ️ <strong>Important:</strong> Only friends who make real M-Pesa deposits count. Free internship users do not count as "active investors" for referral bonuses.
                </div>
              </CardContent>
            </Card>

            {/* ── HOW TO QUALIFY (collapsible) ─────────────────────────────── */}
            <Card>
              <button
                className="w-full text-left"
                onClick={() => setShowGuide(g => !g)}
              >
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
                    <div className="flex items-start gap-3">
                      <StepBadge n={1} />
                      <div>
                        <p className="font-semibold text-sm">Copy and share your invite link</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Send your unique link to friends on WhatsApp, Facebook, or SMS. Your link is above — the more people you share with, the better.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <StepBadge n={2} />
                      <div>
                        <p className="font-semibold text-sm">Your friend signs up using your link</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          They register on Zenti and they will be linked to you automatically.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <StepBadge n={3} />
                      <div>
                        <p className="font-semibold text-sm">They deposit money and start investing</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          When your friend makes a real M-Pesa deposit, they become your "active investor." You instantly earn 10% of their deposit. ✅
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <StepBadge n={4} />
                      <div>
                        <p className="font-semibold text-sm">Your 10-day Elite challenge starts</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Once your 1st active investor joins, a 10-day countdown begins. You have <strong>10 days</strong> to get 4 more people investing to reach 5 total.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <StepBadge n={5} />
                      <div>
                        <p className="font-semibold text-sm">Reach 5 active investors → you're Elite! 🏆</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          From that point, every Sunday, 30% of your referrals' weekly earnings is automatically added to your balance — forever, as long as you keep 5 active investors.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl bg-orange-50 border border-orange-200 p-3 text-xs text-orange-800">
                    <strong>⏳ Missed the countdown?</strong> No problem — you still earn 5–10% Sunday bonus (Standard tier). Keep growing your network to stay active!
                  </div>

                  <div className="pt-1">
                    <Button onClick={shareLink} className="w-full gap-2">
                      <ArrowRight className="h-4 w-4" /> Start Now — Share Your Link
                    </Button>
                  </div>
                </CardContent>
              )}
            </Card>

            {/* ── PEOPLE YOU'VE REFERRED ───────────────────────────────────── */}
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Users className="h-4 w-4 text-primary" />
                    People You've Invited ({referrals.length})
                  </CardTitle>
                  <div className="flex gap-1.5">
                    <Badge className="bg-green-100 text-green-800 border-green-200 text-xs">{active} Active</Badge>
                    {stats!.totalReferrals - active > 0 && (
                      <Badge variant="outline" className="text-xs">{stats!.totalReferrals - active} Pending</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                {referrals.length === 0 ? (
                  <div className="text-center py-10 text-muted-foreground px-4">
                    <Users className="h-10 w-10 mx-auto mb-3 opacity-30" />
                    <p className="font-medium text-sm">No one referred yet</p>
                    <p className="text-xs mt-1">Share your link and your friends will appear here once they sign up.</p>
                    <Button onClick={shareLink} size="sm" className="mt-4 gap-2">
                      <Share2 className="h-3.5 w-3.5" /> Share My Link
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="divide-y">
                      {visibleReferrals.map(r => (
                        <div key={r.id} className="px-4 py-3 flex items-center justify-between">
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.refereeName}</p>
                            <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                          </div>
                          <div className="flex items-center gap-2 ml-3 shrink-0">
                            {r.depositBonusPaid && (
                              <Badge className="bg-green-100 text-green-800 border-green-200 text-xs gap-1">
                                <Zap className="h-2.5 w-2.5" /> Bonus Paid
                              </Badge>
                            )}
                            <Badge className={
                              r.isActive
                                ? "bg-green-100 text-green-800 border-green-200 text-xs"
                                : "bg-muted text-muted-foreground text-xs"
                            }>
                              {r.isActive ? "✓ Active" : "Not invested yet"}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>

                    {referrals.length > 5 && (
                      <div className="px-4 py-3 border-t">
                        <button
                          onClick={() => setShowAllReferrals(v => !v)}
                          className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                        >
                          {showAllReferrals
                            ? <><ChevronUp className="h-3 w-3" /> Show less</>
                            : <><ChevronDown className="h-3 w-3" /> Show all {referrals.length} people</>}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            {/* ── PAYOUT HISTORY ───────────────────────────────────────────── */}
            {(stats?.recentPayouts?.length ?? 0) > 0 && (
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
                    {stats!.recentPayouts.map(p => (
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
                        <div className="text-right">
                          <p className="font-bold text-green-600">+{formatKES(p.bonusAmount)}</p>
                          <p className="text-xs text-muted-foreground">Added to balance</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

          </div>
        )}
      </div>
    </Layout>
  );
}
