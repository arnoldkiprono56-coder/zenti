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
import { Copy, Users, TrendingUp, Gift, Clock, Trophy, Star } from "lucide-react";

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

function tierLabel(tier: string) {
  if (tier === "elite") return { label: "Elite Referrer", color: "bg-yellow-100 text-yellow-800 border-yellow-300", icon: Trophy };
  if (tier === "standard") return { label: "Standard Referrer", color: "bg-blue-100 text-blue-800 border-blue-300", icon: Star };
  if (tier === "countdown") return { label: "Qualifying…", color: "bg-orange-100 text-orange-800 border-orange-300", icon: Clock };
  return { label: "Getting Started", color: "bg-muted text-muted-foreground border-border", icon: Gift };
}

export default function Referrals() {
  const { toast } = useToast();
  const [stats, setStats] = useState<ReferralStats | null>(null);
  const [referrals, setReferrals] = useState<ReferralRecord[]>([]);
  const [loading, setLoading] = useState(true);

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
  }, []);

  const copyLink = () => {
    if (!stats) return;
    const link = `${window.location.origin}${import.meta.env.BASE_URL}register?ref=${stats.referralCode}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Copied!", description: "Referral link copied to clipboard." });
  };

  const tier = stats ? tierLabel(stats.tier) : tierLabel("none");
  const TierIcon = tier.icon;

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Referral Program</h1>
          <p className="text-muted-foreground text-sm mt-1">Invite friends and earn from their activity</p>
        </div>

        {loading ? (
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <div className="space-y-6">
            {/* Tier Status */}
            <Card className="border-2 border-primary/20 bg-primary/5">
              <CardContent className="p-6">
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className="bg-primary/10 p-3 rounded-xl">
                      <TierIcon className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <Badge className={`mb-1 ${tier.color}`}>{tier.label}</Badge>
                      <p className="text-sm text-muted-foreground">
                        {stats?.tier === "elite" && "You earn 30% of your referrals' Sunday earnings"}
                        {stats?.tier === "standard" && "You earn 5–10% of your referrals' Sunday earnings"}
                        {stats?.tier === "countdown" && `${stats.activeReferrals}/5 active referrals — get 5 before countdown ends to unlock Elite`}
                        {stats?.tier === "none" && "Invite someone with an active investment to start the countdown"}
                      </p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs text-muted-foreground">Total Earned</p>
                    <p className="text-2xl font-bold text-primary">{formatKES(stats?.totalEarned ?? 0)}</p>
                  </div>
                </div>

                {stats?.tier === "countdown" && stats.countdownDaysLeft !== null && (
                  <div className="mt-4">
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">Countdown to Elite</span>
                      <span className="font-bold text-orange-600">{stats.countdownDaysLeft} days left</span>
                    </div>
                    <Progress value={((10 - stats.countdownDaysLeft) / 10) * 100} className="h-2 [&>div]:bg-orange-500" />
                    <p className="text-xs text-muted-foreground mt-1">
                      Reach 5 active referrals before the countdown hits 0 to unlock Elite (30% Sunday bonus)
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Stats Row */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Users className="h-3 w-3" />Total Referred</div>
                  <p className="text-2xl font-bold">{stats?.totalReferrals ?? 0}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><TrendingUp className="h-3 w-3" />Active Investors</div>
                  <p className="text-2xl font-bold text-green-600">{stats?.activeReferrals ?? 0}</p>
                </CardContent>
              </Card>
              <Card className="col-span-2 sm:col-span-1">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Gift className="h-3 w-3" />Bonuses Earned</div>
                  <p className="text-2xl font-bold text-primary">{formatKES(stats?.totalEarned ?? 0)}</p>
                </CardContent>
              </Card>
            </div>

            {/* Referral Link */}
            <Card>
              <CardHeader><CardTitle className="text-base">Your Referral Link</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="flex gap-2">
                  <div className="flex-1 bg-muted rounded-lg px-3 py-2 text-sm font-mono break-all text-muted-foreground">
                    {window.location.origin}{import.meta.env.BASE_URL}register?ref={stats?.referralCode}
                  </div>
                  <Button variant="outline" size="sm" onClick={copyLink} className="shrink-0">
                    <Copy className="h-4 w-4 mr-1" /> Copy
                  </Button>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
                  <p><span className="font-semibold text-foreground">Tier 1 (everyone):</span> Earn 10% of your referee's first real deposit — instantly.</p>
                  <p><span className="font-semibold text-foreground">Elite (5+ active in 10 days):</span> Earn 30% of their Sunday earnings every week.</p>
                  <p><span className="font-semibold text-foreground">Standard (missed countdown):</span> Earn 5–10% of their Sunday earnings every week.</p>
                  <p className="text-orange-600 font-medium">Only referrals who make real deposits count — internship users are excluded.</p>
                </div>
              </CardContent>
            </Card>

            {/* Referral List */}
            <Card>
              <CardHeader><CardTitle className="text-base">People You've Referred ({referrals.length})</CardTitle></CardHeader>
              <CardContent>
                {referrals.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No referrals yet. Share your link to get started.</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {referrals.map(r => (
                      <div key={r.id} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{r.refereeName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(r.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          {r.depositBonusPaid && (
                            <Badge variant="secondary" className="text-xs">Bonus Paid</Badge>
                          )}
                          <Badge className={r.isActive ? "bg-green-100 text-green-800 border-green-200 text-xs" : "bg-muted text-muted-foreground text-xs"}>
                            {r.isActive ? "Active Investor" : "No Investment Yet"}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Payout History */}
            {(stats?.recentPayouts?.length ?? 0) > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Sunday Payout History</CardTitle></CardHeader>
                <CardContent>
                  <div className="divide-y">
                    {stats!.recentPayouts.map(p => (
                      <div key={p.id} className="py-3 flex items-center justify-between">
                        <div>
                          <p className="text-sm font-medium">{formatDate(p.payoutDate)}</p>
                          <p className="text-xs text-muted-foreground">{p.bonusPercent}% bonus — {p.isElite ? "Elite" : "Standard"}</p>
                        </div>
                        <p className="font-bold text-green-600">+{formatKES(p.bonusAmount)}</p>
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
