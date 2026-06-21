import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminGetLogs } from "@workspace/api-client-react";
import { formatDate } from "@/lib/format";
import { ChevronLeft, ChevronRight, Activity } from "lucide-react";

export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const { data, isLoading } = useAdminGetLogs({ page, limit: 50 });
  const logsData = data as unknown as { data: Array<{id:number;userId:number;action:string;details:string;createdAt:unknown}>; total: number } | undefined;
  const logs = logsData?.data ?? (Array.isArray(data) ? data : []);
  const total = logsData?.total ?? 0;
  const totalPages = Math.ceil(total / 50);

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Activity className="h-5 w-5" />Activity Logs</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} log entries</p>
        </div>

        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-2">{Array(10).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
            ) : logs.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">No activity logs yet</p>
            ) : (
              <div className="space-y-0 divide-y font-mono text-xs">
                {logs.map((log) => (
                  <div key={log.id} className="py-2.5 grid grid-cols-[140px_100px_1fr] gap-3 hover:bg-muted/30">
                    <span className="text-muted-foreground shrink-0">{formatDate(String(log.createdAt))}</span>
                    <span className="text-primary font-medium shrink-0">User #{log.userId}</span>
                    <span className="text-foreground truncate">[{log.action}] {log.details}</span>
                  </div>
                ))}
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
