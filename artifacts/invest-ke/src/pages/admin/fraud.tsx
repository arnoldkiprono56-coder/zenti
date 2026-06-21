import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminGetFraudFlags } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { AlertTriangle } from "lucide-react";

const severityColors: Record<string, string> = {
  low: "bg-yellow-100 text-yellow-800",
  medium: "bg-orange-100 text-orange-800",
  high: "bg-red-100 text-red-800",
};

export default function AdminFraud() {
  const { data, isLoading } = useAdminGetFraudFlags();
  const flagsData = data as unknown as Array<{id:number;userId:number;flagType:string;severity:string;description:string;resolved:boolean;createdAt:unknown}> | undefined;
  const flags = Array.isArray(flagsData) ? flagsData : [];

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-red-500" />Fraud Detection</h1>
          <p className="text-muted-foreground text-sm mt-1">{flags.length} flagged items</p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : flags.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <AlertTriangle className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No fraud flags detected</p>
              </div>
            ) : (
              <div className="divide-y">
                {flags.map(flag => (
                  <div key={flag.id} className="py-4 flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityColors[flag.severity] ?? ""}`}>{flag.severity}</span>
                        <span className="text-sm font-medium">{flag.flagType}</span>
                      </div>
                      <p className="text-sm text-muted-foreground">{flag.description}</p>
                      <p className="text-xs text-muted-foreground mt-1">User #{flag.userId} · {formatDate(String(flag.createdAt))}</p>
                    </div>
                    <Badge variant={flag.resolved ? "outline" : "destructive"} className="shrink-0">
                      {flag.resolved ? "Resolved" : "Open"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
