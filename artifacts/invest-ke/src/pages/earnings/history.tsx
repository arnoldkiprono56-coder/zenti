import { useEffect, useState, useCallback } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { apiUrl } from "@/lib/api-url";
import { formatKES } from "@/lib/format";
import { CheckCircle2, Clock, XCircle, TrendingUp, Calendar, RefreshCw } from "lucide-react";
import { Link } from "wouter";

interface EarningRecord {
  id: number;
  investmentId: number;
  amount: number;
  earningDate: string;
  claimed: boolean;
  claimedAt: string | null;
  expired: boolean;
  expiresAt: string;
  createdAt: string;
}

function StatusBadge({ claimed, expired }: { claimed: boolean; expired: boolean }) {
  if (claimed) return <Badge className="bg-green-100 text-green-800 border-green-200 gap-1"><CheckCircle2 className="h-3 w-3" /> Claimed</Badge>;
  if (expired) return <Badge className="bg-red-100 text-red-800 border-red-200 gap-1"><XCircle className="h-3 w-3" /> Expired</Badge>;
  return <Badge className="bg-yellow-100 text-yellow-800 border-yellow-200 gap-1 animate-pulse"><Clock className="h-3 w-3" /> Pending</Badge>;
}

export default function EarningsHistory() {
  useAuth();
  const token = typeof localStorage !== "undefined" ? localStorage.getItem("investke_token") : null;
  const [records, setRecords] = useState<EarningRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchHistory = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/earnings/history"), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load history");
      setRecords(await res.json() as EarningRecord[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => { void fetchHistory(); }, [fetchHistory]);

  const totalClaimed = records.filter(r => r.claimed).reduce((s, r) => s + r.amount, 0);
  const totalExpired = records.filter(r => r.expired).reduce((s, r) => s + r.amount, 0);
  const claimedCount = records.filter(r => r.claimed).length;
  const expiredCount = records.filter(r => r.expired).length;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-3xl">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <TrendingUp className="h-6 w-6 text-primary" />
              Earnings History
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Your daily claiming record — last 30 entries
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void fetchHistory()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-4 mb-6">
          <Card className="border-green-200 bg-green-50">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-green-700 font-medium mb-1">Total Claimed</p>
              <p className="text-xl font-bold text-green-800">{formatKES(totalClaimed)}</p>
              <p className="text-xs text-green-600 mt-1">{claimedCount} day{claimedCount !== 1 ? "s" : ""} claimed</p>
            </CardContent>
          </Card>
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-5 pb-4">
              <p className="text-xs text-red-700 font-medium mb-1">Total Expired</p>
              <p className="text-xl font-bold text-red-800">{formatKES(totalExpired)}</p>
              <p className="text-xs text-red-600 mt-1">{expiredCount} day{expiredCount !== 1 ? "s" : ""} missed</p>
            </CardContent>
          </Card>
        </div>

        {expiredCount > 0 && (
          <div className="mb-5 p-3 bg-orange-50 border border-orange-200 rounded-xl text-sm text-orange-800">
            ⚠️ You missed claiming on <strong>{expiredCount}</strong> day{expiredCount !== 1 ? "s" : ""}, losing{" "}
            <strong>{formatKES(totalExpired)}</strong>. Log in daily before <strong>11:59 PM Kenya Time</strong> to claim!
          </div>
        )}

        {/* History table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Daily Log
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {loading ? (
              <div className="space-y-3 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full rounded-lg" />
                ))}
              </div>
            ) : error ? (
              <div className="text-center py-10 text-muted-foreground">
                <XCircle className="h-8 w-8 mx-auto mb-2 text-red-400" />
                <p>Failed to load history</p>
                <Button variant="ghost" size="sm" className="mt-2" onClick={() => void fetchHistory()}>Try again</Button>
              </div>
            ) : records.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <TrendingUp className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p className="font-medium">No earnings history yet</p>
                <p className="text-sm mt-1">Activate an investment plan to start earning</p>
                <Button asChild size="sm" className="mt-4">
                  <Link href="/invest">Browse Plans</Link>
                </Button>
              </div>
            ) : (
              <div className="divide-y">
                {records.map((record) => {
                  const date = new Date(record.createdAt).toLocaleDateString("en-KE", {
                    timeZone: "Africa/Nairobi",
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  });
                  const claimedTime = record.claimedAt
                    ? new Date(record.claimedAt).toLocaleTimeString("en-KE", {
                        timeZone: "Africa/Nairobi",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : null;

                  return (
                    <div key={record.id} className="flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium">{record.earningDate}</p>
                        <p className="text-xs text-muted-foreground">
                          {record.claimed && claimedTime
                            ? `Claimed at ${claimedTime}`
                            : record.expired
                            ? "Expired — not claimed in time"
                            : "Pending claim"}
                        </p>
                      </div>
                      <div className="flex items-center gap-3 ml-3">
                        <span className={`text-sm font-bold ${record.claimed ? "text-green-700" : record.expired ? "text-red-500 line-through opacity-60" : "text-yellow-700"}`}>
                          {formatKES(record.amount)}
                        </span>
                        <StatusBadge claimed={record.claimed} expired={record.expired} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <div className="mt-6 text-center">
          <Button asChild variant="outline">
            <Link href="/dashboard">← Back to Dashboard</Link>
          </Button>
        </div>
      </div>
    </Layout>
  );
}
