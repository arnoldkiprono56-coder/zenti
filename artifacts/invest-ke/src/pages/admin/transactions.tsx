import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminGetTransactions, useApproveWithdrawal, useRejectWithdrawal, getAdminGetTransactionsQueryKey } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, XCircle, ChevronLeft, ChevronRight } from "lucide-react";

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
};

export default function AdminTransactions() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data, isLoading } = useAdminGetTransactions({
    page,
    type: typeFilter === "all" ? undefined : typeFilter as "deposit" | "withdrawal" | "earning",
    status: statusFilter === "all" ? undefined : statusFilter as "pending" | "completed" | "failed" | "rejected",
  });

  const txnsData = data as unknown as { data: Array<{id:number;userId:number;type:string;amount:number;method?:string|null;phoneOrAccount?:string|null;status:string;createdAt:unknown}>; total: number } | undefined;
  const transactions = txnsData?.data ?? (Array.isArray(data) ? data : []);
  const total = txnsData?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  const approveMutation = useApproveWithdrawal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Withdrawal approved and processed" });
        queryClient.invalidateQueries({ queryKey: getAdminGetTransactionsQueryKey() });
      },
      onError: () => toast({ title: "Error approving transaction", variant: "destructive" }),
    }
  });

  const rejectMutation = useRejectWithdrawal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Withdrawal rejected and refunded" });
        queryClient.invalidateQueries({ queryKey: getAdminGetTransactionsQueryKey() });
      },
      onError: () => toast({ title: "Error rejecting transaction", variant: "destructive" }),
    }
  });

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} total transactions</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex gap-3 flex-wrap">
              <Select value={typeFilter} onValueChange={v => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="deposit">Deposits</SelectItem>
                  <SelectItem value="withdrawal">Withdrawals</SelectItem>
                  <SelectItem value="earning">Earnings</SelectItem>
                </SelectContent>
              </Select>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="rejected">Rejected</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left">ID</th>
                    <th className="pb-2 text-left">User</th>
                    <th className="pb-2 text-left">Type</th>
                    <th className="pb-2 text-left">Amount</th>
                    <th className="pb-2 text-left">Method</th>
                    <th className="pb-2 text-left">Status</th>
                    <th className="pb-2 text-left">Date</th>
                    <th className="pb-2"></th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {transactions.map((txn) => (
                      <tr key={txn.id} className="hover:bg-muted/30">
                        <td className="py-2 text-muted-foreground">#{txn.id}</td>
                        <td className="py-2">User #{txn.userId}</td>
                        <td className="py-2 capitalize">{txn.type}</td>
                        <td className="py-2 font-medium">{formatKES(txn.amount)}</td>
                        <td className="py-2 capitalize text-muted-foreground">{String(txn.method ?? "").replace("_", " ") || "—"}</td>
                        <td className="py-2"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[txn.status] ?? ""}`}>{txn.status}</span></td>
                        <td className="py-2 text-xs text-muted-foreground">{formatDate(String(txn.createdAt))}</td>
                        <td className="py-2">
                          {txn.status === "pending" && txn.type === "withdrawal" && (
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-green-600 hover:text-green-700" onClick={() => approveMutation.mutate({ id: txn.id })} disabled={approveMutation.isPending}>
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-7 px-2 text-red-600 hover:text-red-700" onClick={() => rejectMutation.mutate({ id: txn.id, data: { reason: "Rejected by admin" } })} disabled={rejectMutation.isPending}>
                                <XCircle className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
