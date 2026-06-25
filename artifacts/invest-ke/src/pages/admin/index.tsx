import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import { useAdminGetStats, useAdminGetTransactions } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import {
  Users, TrendingUp, DollarSign, AlertTriangle,
  ArrowDownToLine, ClipboardList, ShieldAlert,
  Settings, MessageSquare, Gift, Activity,
  CheckCircle2, Clock, BarChart3, MessageSquareMore, ShieldX,
  Search, Ticket,
} from "lucide-react";

function getToken() { return localStorage.getItem("investke_token") ?? ""; }

export default function AdminDashboard() {
  const { data: stats, isLoading } = useAdminGetStats();
  const { data: txns } = useAdminGetTransactions({ status: "pending" });
  const pendingTxns = Array.isArray(txns) ? txns.slice(0, 5) : [];

  const [ticketQuery, setTicketQuery] = useState("");
  const [ticketResult, setTicketResult] = useState<any>(null);
  const [ticketError, setTicketError] = useState("");
  const [ticketLoading, setTicketLoading] = useState(false);

  async function lookupTicket() {
    const q = ticketQuery.trim().toUpperCase();
    if (!q) return;
    setTicketLoading(true);
    setTicketError("");
    setTicketResult(null);
    try {
      const res = await fetch(apiUrl(`/api/admin/ticket/${encodeURIComponent(q)}`), {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      const data = await res.json();
      if (!res.ok) { setTicketError(data.error ?? "Ticket not found"); return; }
      setTicketResult(data);
    } catch {
      setTicketError("Network error — could not reach server");
    } finally {
      setTicketLoading(false);
    }
  }

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <ShieldAlert className="h-6 w-6 text-primary" /> Admin Dashboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Platform management and oversight</p>
          </div>
        </div>

        {/* KPI Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {isLoading ? (
            Array(4).fill(0).map((_, i) => (
              <Card key={i}><CardContent className="p-6"><Skeleton className="h-14 w-full" /></CardContent></Card>
            ))
          ) : (
            <>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Users className="h-3.5 w-3.5" />Total Users</div>
                  <p className="text-2xl font-bold">{stats?.totalUsers ?? 0}</p>
                  <p className="text-xs text-green-600 mt-0.5">+{stats?.newUsersToday ?? 0} today</p>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><DollarSign className="h-3.5 w-3.5" />Total Deposited</div>
                  <p className="text-2xl font-bold">{formatKES(stats?.totalDeposited ?? 0)}</p>
                </CardContent>
              </Card>
              <Card className={pendingTxns.length > 0 ? "border-amber-300 bg-amber-50" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><Clock className="h-3.5 w-3.5" />Pending Withdrawals</div>
                  <p className="text-2xl font-bold text-amber-600">{stats?.pendingWithdrawals ?? 0}</p>
                  {(stats?.pendingWithdrawals ?? 0) > 0 && (
                    <Link href="/admin/transactions"><p className="text-xs text-amber-600 underline mt-0.5">Review now</p></Link>
                  )}
                </CardContent>
              </Card>
              <Card className={(stats?.fraudFlagsOpen ?? 0) > 0 ? "border-red-300 bg-red-50" : ""}>
                <CardContent className="p-5">
                  <div className="flex items-center gap-2 text-muted-foreground text-xs mb-2"><AlertTriangle className="h-3.5 w-3.5" />Fraud Flags</div>
                  <p className="text-2xl font-bold text-red-600">{stats?.fraudFlagsOpen ?? 0}</p>
                  {(stats?.fraudFlagsOpen ?? 0) > 0 && (
                    <Link href="/admin/fraud"><p className="text-xs text-red-500 underline mt-0.5">Review now</p></Link>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        {/* Quick Nav */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-8">
          {[
            { icon: Users,           label: "User Management",    href: "/admin/users",        desc: "Search, edit, suspend users" },
            { icon: TrendingUp,      label: "Investment Plans",   href: "/admin/plans",        desc: "Create & manage plans" },
            { icon: ArrowDownToLine, label: "Transactions",       href: "/admin/transactions", desc: "Approve withdrawals" },
            { icon: Gift,            label: "Referrals",          href: "/admin/referrals",    desc: "Leaderboard & bonuses" },
            { icon: AlertTriangle,   label: "Fraud Detection",    href: "/admin/fraud",        desc: "Review flagged activity" },
            { icon: MessageSquare,   label: "Support Requests",   href: "/admin/requests",     desc: "User support messages" },
            { icon: Activity,        label: "Activity Logs",      href: "/admin/logs",         desc: "Platform-wide audit log" },
            { icon: Settings,        label: "Platform Settings",  href: "/admin/settings",     desc: "Company info & maintenance" },
            { icon: MessageSquareMore, label: "Notifications",      href: "/admin/notifications", desc: "OTP delivery method & email/WhatsApp" },
            { icon: ShieldX,          label: "Ban Appeals",         href: "/admin/appeals",       desc: "Review & resolve user ban appeals" },
          ].map(({ icon: Icon, label, href, desc }) => (
            <Link key={href} href={href}>
              <Card className="hover:border-primary/50 hover:shadow-sm cursor-pointer transition-all h-full group">
                <CardContent className="p-4 flex flex-col gap-2">
                  <Icon className="h-5 w-5 text-primary group-hover:scale-110 transition-transform" />
                  <div>
                    <p className="text-sm font-semibold leading-tight">{label}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-tight">{desc}</p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        {/* Pending Withdrawals + Quick Action */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="lg:col-span-2">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-amber-500" /> Pending Withdrawals
              </CardTitle>
              <Link href="/admin/transactions">
                <Button variant="ghost" size="sm">View All</Button>
              </Link>
            </CardHeader>
            <CardContent>
              {!pendingTxns.length ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-30 text-green-500" />
                  <p className="text-sm">All caught up — no pending withdrawals</p>
                </div>
              ) : (
                <div className="divide-y">
                  {pendingTxns.map((txn) => (
                    <div key={txn.id} className="py-3 flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          User #{txn.userId} — <span className="text-primary">{formatKES(txn.amount)}</span>
                        </p>
                        <p className="text-xs text-muted-foreground capitalize">
                          {String(txn.method ?? "").replace("_", " ")} · {txn.phoneOrAccount}
                        </p>
                        <p className="text-xs text-muted-foreground">{formatDate(String(txn.createdAt))}</p>
                      </div>
                      <Link href="/admin/transactions">
                        <Badge variant="secondary" className="cursor-pointer hover:bg-primary hover:text-primary-foreground transition-colors">
                          Review
                        </Badge>
                      </Link>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick links panel */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" /> Quick Links
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {[
                { href: "/admin/referrals",    label: "Referral Leaderboard", icon: Gift,            cls: "text-yellow-600" },
                { href: "/admin/transactions", label: "Approve Withdrawals",  icon: ArrowDownToLine, cls: "text-green-600" },
                { href: "/admin/fraud",        label: "Fraud Flags",          icon: AlertTriangle,   cls: "text-red-600" },
                { href: "/admin/logs",         label: "Activity Logs",        icon: Activity,        cls: "text-primary" },
                { href: "/admin/requests",     label: "Support Requests",     icon: MessageSquare,   cls: "text-blue-600" },
                { href: "/admin/appeals",      label: "Ban Appeals",           icon: ShieldX,         cls: "text-destructive" },
              ].map(({ href, label, icon: Icon, cls }) => (
                <Link key={href} href={href}>
                  <div className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-muted cursor-pointer transition-colors">
                    <Icon className={`h-4 w-4 shrink-0 ${cls}`} />
                    <span className="text-sm font-medium">{label}</span>
                  </div>
                </Link>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Ticket Lookup */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Ticket className="h-4 w-4 text-primary" /> Ticket Lookup
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2">
              <Input
                placeholder="e.g. ZEN-DEP-20260625-00001"
                value={ticketQuery}
                onChange={e => setTicketQuery(e.target.value)}
                onKeyDown={e => e.key === "Enter" && lookupTicket()}
                className="font-mono text-sm"
              />
              <Button onClick={lookupTicket} disabled={ticketLoading} className="shrink-0">
                <Search className="h-4 w-4 mr-2" />
                {ticketLoading ? "Searching…" : "Search"}
              </Button>
            </div>

            {ticketError && (
              <p className="text-sm text-destructive mt-3 flex items-center gap-1">
                <AlertTriangle className="h-3.5 w-3.5" /> {ticketError}
              </p>
            )}

            {ticketResult && (
              <div className="mt-4 space-y-3">
                {/* Ticket row */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border">
                  <div className="flex items-center gap-2">
                    <Ticket className="h-4 w-4 text-primary shrink-0" />
                    <div>
                      <p className="text-sm font-mono font-semibold">{ticketResult.ticket.ticketNumber}</p>
                      <p className="text-xs text-muted-foreground capitalize">
                        Type: <strong>{ticketResult.ticket.type}</strong> · Status: <strong>{ticketResult.ticket.status}</strong>
                      </p>
                      <p className="text-xs text-muted-foreground">{formatDate(ticketResult.ticket.createdAt)}</p>
                    </div>
                  </div>
                  <Badge variant={ticketResult.ticket.status === "open" ? "default" : ticketResult.ticket.status === "resolved" ? "secondary" : "outline"} className="capitalize">
                    {ticketResult.ticket.status}
                  </Badge>
                </div>

                {/* User row */}
                {ticketResult.user && (
                  <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4 text-blue-600 shrink-0" />
                      <div>
                        <p className="text-sm font-semibold">{ticketResult.user.fullName}</p>
                        <p className="text-xs text-muted-foreground">{ticketResult.user.email} · {ticketResult.user.phone}</p>
                      </div>
                    </div>
                    <Link href={`/admin/users`}>
                      <Badge variant="outline" className="cursor-pointer hover:bg-primary hover:text-primary-foreground">
                        User #{ticketResult.user.id}
                      </Badge>
                    </Link>
                  </div>
                )}

                {/* Related transaction/investment row */}
                {ticketResult.related && (
                  <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
                    <p className="text-xs font-semibold text-green-700 dark:text-green-300 mb-1.5 uppercase tracking-wide">
                      {ticketResult.ticket.type === "investment" ? "Investment" : "Transaction"}
                    </p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {ticketResult.related.amount !== undefined && (
                        <>
                          <span className="text-muted-foreground">Amount</span>
                          <span className="font-semibold">{formatKES(ticketResult.related.amount)}</span>
                        </>
                      )}
                      {ticketResult.related.status && (
                        <>
                          <span className="text-muted-foreground">Status</span>
                          <span className="capitalize font-medium">{ticketResult.related.status}</span>
                        </>
                      )}
                      {ticketResult.related.method && (
                        <>
                          <span className="text-muted-foreground">Method</span>
                          <span className="capitalize">{String(ticketResult.related.method).replace(/_/g, " ")}</span>
                        </>
                      )}
                      {ticketResult.related.createdAt && (
                        <>
                          <span className="text-muted-foreground">Date</span>
                          <span>{formatDate(ticketResult.related.createdAt)}</span>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
