import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useGetMyTransactions } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { ArrowDownToLine, ArrowUpFromLine, TrendingUp } from "lucide-react";

const statusColors: Record<string, string> = {
  completed: "bg-green-100 text-green-800",
  pending: "bg-yellow-100 text-yellow-800",
  failed: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
};

export default function Transactions() {
  const { data: transactions = [], isLoading } = useGetMyTransactions();
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const filtered = transactions.filter(t => {
    if (typeFilter !== "all" && t.type !== typeFilter) return false;
    if (statusFilter !== "all" && t.status !== statusFilter) return false;
    return true;
  });

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Transaction History</h1>
          <p className="text-muted-foreground text-sm mt-1">All your deposits, withdrawals, and earnings</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-3 justify-between items-start sm:items-center">
              <CardTitle className="text-base">Transactions ({filtered.length})</CardTitle>
              <div className="flex gap-2">
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="deposit">Deposits</SelectItem>
                    <SelectItem value="withdrawal">Withdrawals</SelectItem>
                    <SelectItem value="earning">Earnings</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : filtered.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>No transactions found</p>
              </div>
            ) : (
              <div className="divide-y">
                {filtered.map(txn => (
                  <div key={txn.id} className="py-4 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${txn.type === "deposit" ? "bg-blue-100" : txn.type === "earning" ? "bg-green-100" : "bg-orange-100"}`}>
                        {txn.type === "deposit" ? <ArrowDownToLine className="h-4 w-4 text-blue-600" /> :
                         txn.type === "earning" ? <TrendingUp className="h-4 w-4 text-green-600" /> :
                         <ArrowUpFromLine className="h-4 w-4 text-orange-600" />}
                      </div>
                      <div>
                        <p className="font-medium text-sm capitalize">{txn.type}</p>
                        <p className="text-xs text-muted-foreground">{formatDate(String(txn.createdAt))}</p>
                        {txn.method && <p className="text-xs text-muted-foreground capitalize">{txn.method.replace("_", " ")}</p>}
                        {txn.reference && <p className="text-xs text-muted-foreground font-mono">Ref: {txn.reference}</p>}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-bold ${txn.type === "withdrawal" ? "text-red-600" : "text-green-600"}`}>
                        {txn.type === "withdrawal" ? "-" : "+"}{formatKES(txn.amount)}
                      </p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusColors[txn.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {txn.status}
                      </span>
                    </div>
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
