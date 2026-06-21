import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { formatKES, formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import { useQuery } from "@tanstack/react-query";
import { Trophy, Star, Clock, Users, Gift, TrendingUp, PlayCircle, Loader2 } from "lucide-react";

type Overview = {
  tiers: { elite: number; standard: number; countdown: number };
  totalReferrers: number;
  totalBonusPaid: number;
  depositBonusesPaid: number;
  activeReferralLinks: number;
  leaderboard: Array<{ referrerId: number; name: string; email: string; tier: string; totalEarned: number; payoutCount: number }>;
  recentPayouts: Array<{ id: number; referrerId: number; referrerName: string; bonusAmount: number; bonusPercent: number; isElite: boolean; payoutDate: string }>;
};

const tierStyle: Record<string, { label: string; color: string; icon: React.ElementType }> = {
  elite:     { label: "Elite",     color: "bg-yellow-100 text-yellow-800 border-yellow-200", icon: Trophy },
  standard:  { label: "Standard",  color: "bg-blue-100 text-blue-800 border-blue-200",       icon: Star },
  countdown: { label: "Countdown", color: "bg-orange-100 text-orange-800 border-orange-200", icon: Clock },
  none:      { label: "None",      color: "bg-muted text-muted-foreground",                   icon: Users },
};

function TierBadge({ tier }: { tier: string }) {
  const { label, color } = tierStyle[tier] ?? tierStyle.none;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${color}`}>{label}</span>;
}

export default function AdminReferrals() {
  const { toast } = useToast();
  const [triggering, setTriggering] = useState(false);
  const token = localStorage.getItem("investke_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const { data, isLoading, refetch } = useQuery<Overview>({
    queryKey: ["admin-referrals-overview"],
    queryFn: () => fetch(apiUrl("/api/referrals/admin/overview"), { headers }).then(r => r.json()),
  });

  const triggerSunday = async () => {
    setTriggering(true);
    try {
      const r = await fetch(apiUrl("/api/referrals/trigger-sunday-bonus"), { method: "POST", headers });
      const json = await r.json();
      if (!r.ok) throw new Error(json.error);
      toast({ title: "Sunday bonuses processed", description: json.message });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setTriggering(false);
    }
  };

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Users className="h-6 w-6 text-primary" /> Referral Management
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Overview of the referral programme, leaderboard and payouts</p>
          </div>
          <Button onClick={triggerSunday} disabled={triggering} className="gap-2 shrink-0">
            {triggering ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            Run Sunday Bonuses Now
          </Button>
        </div>

        {isLoading ? (
          <div className="space-y-4">{Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-32 w-full" />)}</div>
        ) : (
          <div className="space-y-6">
            {/* Tier stats */}
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
              {[
                { icon: Trophy, label: "Elite Referrers", value: data?.tiers.elite ?? 0, cls: "text-yellow-600" },
                { icon: Star,   label: "Standard",        value: data?.tiers.standard ?? 0, cls: "text-blue-600" },
                { icon: Clock,  label: "Countdown",       value: data?.tiers.countdown ?? 0, cls: "text-orange-600" },
                { icon: Users,  label: "Total Referrers", value: data?.totalReferrers ?? 0, cls: "text-primary" },
                { icon: TrendingUp, label: "Active Links", value: data?.activeReferralLinks ?? 0, cls: "text-green-600" },
              ].map(({ icon: Icon, label, value, cls }) => (
                <Card key={label}>
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 text-muted-foreground text-xs mb-1"><Icon className="h-3.5 w-3.5" />{label}</div>
                    <p className={`text-2xl font-bold ${cls}`}>{value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>

            {/* Money stats */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Card className="border-primary/20 bg-primary/5">
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><Gift className="h-4 w-4" />Total Sunday Bonuses Paid</div>
                  <p className="text-3xl font-bold text-primary">{formatKES(data?.totalBonusPaid ?? 0)}</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1"><TrendingUp className="h-4 w-4" />Tier 1 Deposit Bonuses Paid</div>
                  <p className="text-3xl font-bold">{data?.depositBonusesPaid ?? 0} <span className="text-base font-normal text-muted-foreground">users rewarded</span></p>
                </CardContent>
              </Card>
            </div>

            {/* Leaderboard */}
            <Card>
              <CardHeader><CardTitle className="text-base flex items-center gap-2"><Trophy className="h-4 w-4 text-yellow-500" />Referrer Leaderboard</CardTitle></CardHeader>
              <CardContent>
                {(data?.leaderboard?.length ?? 0) === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">No payouts yet — run Sunday bonuses to populate the leaderboard.</p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b text-muted-foreground text-xs">
                          <th className="pb-2 text-left w-8">#</th>
                          <th className="pb-2 text-left">Referrer</th>
                          <th className="pb-2 text-left">Tier</th>
                          <th className="pb-2 text-right">Payouts</th>
                          <th className="pb-2 text-right">Total Earned</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {data!.leaderboard.map((r, i) => (
                          <tr key={r.referrerId} className="hover:bg-muted/30">
                            <td className="py-3 text-muted-foreground font-bold">{i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}</td>
                            <td className="py-3">
                              <p className="font-medium">{r.name}</p>
                              <p className="text-xs text-muted-foreground">{r.email}</p>
                            </td>
                            <td className="py-3"><TierBadge tier={r.tier ?? "none"} /></td>
                            <td className="py-3 text-right text-muted-foreground">{r.payoutCount}</td>
                            <td className="py-3 text-right font-bold text-green-600">{formatKES(r.totalEarned)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Payouts */}
            <Card>
              <CardHeader><CardTitle className="text-base">Recent Sunday Payouts</CardTitle></CardHeader>
              <CardContent>
                {(data?.recentPayouts?.length ?? 0) === 0 ? (
                  <p className="text-center text-muted-foreground py-6 text-sm">No payouts yet.</p>
                ) : (
                  <div className="divide-y">
                    {data!.recentPayouts.map(p => (
                      <div key={p.id} className="py-3 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium">{p.referrerName}</p>
                          <p className="text-xs text-muted-foreground">{formatDate(String(p.payoutDate))} · {p.bonusPercent}% · {p.isElite ? "Elite" : "Standard"}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge className={p.isElite ? "bg-yellow-100 text-yellow-800 border-yellow-200" : "bg-blue-100 text-blue-800 border-blue-200"}>
                            {p.isElite ? "Elite" : "Standard"}
                          </Badge>
                          <span className="font-bold text-green-600">+{formatKES(p.bonusAmount)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </Layout>
  );
}
