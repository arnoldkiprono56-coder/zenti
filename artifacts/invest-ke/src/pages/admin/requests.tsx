import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import {
  MessageSquare, ChevronDown, ChevronUp,
  CheckCircle2, Clock, AlertCircle, RefreshCw,
  Ban, UserX, KeyRound, Loader2, Copy, Phone, Mail, Reply,
  Sparkles, Bot, XCircle, Send,
} from "lucide-react";

type Ticket = {
  id: number;
  userId: number | null;
  name: string;
  email: string;
  phone: string | null;
  subject: string;
  category: string;
  priority: "normal" | "high" | "urgent";
  message: string;
  status: "open" | "in_progress" | "resolved";
  adminReply: string | null;
  createdAt: string;
  updatedAt: string;
};

type AiSuggestion = {
  reply: string;
  shouldClose: boolean;
  confidence: number;
  needsHuman: boolean;
  category: string;
};

const TABS = [
  { key: "all",         label: "All",         icon: MessageSquare },
  { key: "open",        label: "Open",        icon: AlertCircle },
  { key: "in_progress", label: "In Progress", icon: Clock },
  { key: "resolved",    label: "Resolved",    icon: CheckCircle2 },
] as const;

const statusStyle: Record<string, { color: string; label: string }> = {
  open:        { color: "bg-blue-100 text-blue-800 border-blue-200",         label: "Open" },
  in_progress: { color: "bg-yellow-100 text-yellow-800 border-yellow-200",   label: "In Progress" },
  resolved:    { color: "bg-green-100 text-green-800 border-green-200",       label: "Resolved" },
};

const priorityStyle: Record<string, { color: string; label: string }> = {
  normal: { color: "bg-gray-100 text-gray-600 border-gray-200",       label: "Normal" },
  high:   { color: "bg-orange-100 text-orange-700 border-orange-200", label: "High" },
  urgent: { color: "bg-red-100 text-red-700 border-red-200",          label: "Urgent" },
};

const categoryLabels: Record<string, string> = {
  account_issue:    "Account Issue",
  investment_query: "Investment Query",
  withdrawal_issue: "Withdrawal Issue",
  deposit_issue:    "Deposit Issue",
  technical:        "Technical",
  feature_request:  "Feature Request",
  referral:         "Referral",
  general:          "General",
  other:            "Other",
};

function confidenceBadge(c: number) {
  const pct = Math.round(c * 100);
  if (pct >= 85) return <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">{pct}% confident</span>;
  if (pct >= 65) return <span className="text-xs px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 font-medium">{pct}% confident</span>;
  return <span className="text-xs px-2 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{pct}% confident</span>;
}

export default function AdminRequests() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const token = localStorage.getItem("investke_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [tab, setTab] = useState<"all" | "open" | "in_progress" | "resolved">("all");
  const [expanded, setExpanded] = useState<number | null>(null);
  const [replyDraft, setReplyDraft] = useState<Record<number, string>>({});
  const [replyLoading, setReplyLoading] = useState<number | null>(null);
  const [resetResult, setResetResult] = useState<{ tempPassword: string; email: string } | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // AI suggest state
  const [aiLoading, setAiLoading] = useState<number | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<Record<number, AiSuggestion>>({});
  const [aiSendLoading, setAiSendLoading] = useState<number | null>(null);

  const { data, isLoading } = useQuery<Ticket[]>({
    queryKey: ["admin-tickets", tab],
    queryFn: () =>
      fetch(apiUrl(`/api/support/admin/tickets${tab !== "all" ? `?status=${tab}` : ""}`), { headers }).then(r => r.json()),
  });
  const tickets = Array.isArray(data) ? data : [];

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      fetch(apiUrl(`/api/support/admin/tickets/${id}/reply`), {
        method: "POST",
        headers,
        body: JSON.stringify({ message: `Status updated to ${status}.`, resolve: status === "resolved" }),
      }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      toast({ title: "Ticket status updated" });
    },
    onError: () => toast({ title: "Error updating ticket", variant: "destructive" }),
  });

  async function sendReply(ticket: Ticket, message?: string, resolve?: boolean) {
    const reply = (message ?? replyDraft[ticket.id])?.trim();
    if (!reply) return;
    setReplyLoading(ticket.id);
    try {
      const r = await fetch(apiUrl(`/api/support/admin/tickets/${ticket.id}/reply`), {
        method: "POST",
        headers,
        body: JSON.stringify({ message: reply, resolve: resolve ?? false }),
      });
      const json = await r.json() as { error?: string };
      if (!r.ok) throw new Error(json.error);
      queryClient.invalidateQueries({ queryKey: ["admin-tickets"] });
      setReplyDraft(d => ({ ...d, [ticket.id]: "" }));
      setAiSuggestion(s => { const next = { ...s }; delete next[ticket.id]; return next; });
      toast({ title: resolve ? "✅ Ticket resolved & reply sent" : "Reply sent" });
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setReplyLoading(null);
    }
  }

  async function fetchAiSuggestion(ticket: Ticket) {
    setAiLoading(ticket.id);
    try {
      const r = await fetch(apiUrl(`/api/support/admin/tickets/${ticket.id}/ai-suggest`), {
        method: "POST", headers,
      });
      const json = await r.json() as AiSuggestion & { error?: string };
      if (!r.ok) throw new Error(json.error ?? "AI request failed");
      if (!json.reply) throw new Error("No AI reply generated — API key may not be configured");
      setAiSuggestion(s => ({ ...s, [ticket.id]: json }));
      setReplyDraft(d => ({ ...d, [ticket.id]: json.reply }));
    } catch (e: unknown) {
      toast({ title: "AI suggestion failed", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setAiLoading(null);
    }
  }

  async function sendAiReply(ticket: Ticket) {
    const suggestion = aiSuggestion[ticket.id];
    if (!suggestion) return;
    setAiSendLoading(ticket.id);
    try {
      await sendReply(ticket, suggestion.reply, suggestion.shouldClose);
    } finally {
      setAiSendLoading(null);
    }
  }

  async function userAction(action: "ban" | "suspend" | "reset", userId: number | null, email: string) {
    if (!userId) { toast({ title: "No account linked to this ticket", variant: "destructive" }); return; }
    setActionLoading(`${action}-${userId}`);
    try {
      if (action === "reset") {
        const r = await fetch(apiUrl(`/api/admin/users/${userId}/reset-password`), { method: "POST", headers });
        const json = await r.json() as { tempPassword?: string; error?: string };
        if (!r.ok) throw new Error(json.error);
        setResetResult({ tempPassword: json.tempPassword ?? "", email });
      } else {
        const status = action === "ban" ? "banned" : "suspended";
        const r = await fetch(apiUrl(`/api/admin/users/${userId}`), {
          method: "PATCH", headers,
          body: JSON.stringify({ status }),
        });
        const json = await r.json() as { error?: string };
        if (!r.ok) throw new Error(json.error);
        toast({ title: `User ${status}`, description: `${email} has been ${status}.` });
      }
    } catch (e: unknown) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Unknown error", variant: "destructive" });
    } finally {
      setActionLoading(null);
    }
  }

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquare className="h-5 w-5" /> Support Tickets
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2">
            {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
            <span className="flex items-center gap-1 text-primary text-xs font-medium bg-primary/10 px-2 py-0.5 rounded-full">
              <Bot className="h-3 w-3" /> AI Auto-Reply Active
            </span>
          </p>
        </div>

        <div className="flex gap-2 mb-5 flex-wrap">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium border transition-colors ${
                tab === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-background text-muted-foreground border-border hover:border-primary/40"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
              <span className={`ml-1 px-1.5 py-0.5 rounded-full text-xs ${tab === key ? "bg-white/20" : "bg-muted"}`}>
                {key === "all" ? tickets.length : tickets.filter(t => t.status === key).length}
              </span>
            </button>
          ))}
        </div>

        <Card>
          <CardContent className="pt-4">
            {isLoading ? (
              <div className="space-y-3">{Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-24 w-full" />)}</div>
            ) : tickets.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <MessageSquare className="h-10 w-10 mx-auto mb-3 opacity-30" />
                <p>No tickets in this category</p>
              </div>
            ) : (
              <div className="divide-y">
                {tickets.map(ticket => {
                  const isOpen = expanded === ticket.id;
                  const style = statusStyle[ticket.status] ?? statusStyle.open;
                  const pStyle = priorityStyle[ticket.priority] ?? priorityStyle.normal;
                  const ai = aiSuggestion[ticket.id];

                  return (
                    <div key={ticket.id} className="py-4">
                      <button
                        className="w-full text-left"
                        onClick={() => setExpanded(isOpen ? null : ticket.id)}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap mb-1">
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${style.color}`}>
                                {style.label}
                              </span>
                              {ticket.priority !== "normal" && (
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium border ${pStyle.color}`}>
                                  {pStyle.label}
                                </span>
                              )}
                              <span className="text-xs bg-muted px-2 py-0.5 rounded-full text-muted-foreground">
                                {categoryLabels[ticket.category] ?? ticket.category}
                              </span>
                              <span className="text-xs text-muted-foreground">#{ticket.id}</span>
                            </div>
                            <p className="font-semibold text-sm leading-tight truncate">{ticket.subject}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">
                              {ticket.name} · {ticket.email}
                              {ticket.phone && <span> · {ticket.phone}</span>}
                              {" · "}{formatDate(ticket.createdAt)}
                            </p>
                          </div>
                          <div className="shrink-0 mt-1 flex items-center gap-2">
                            {ticket.adminReply && <Reply className="h-3.5 w-3.5 text-green-500" />}
                            {isOpen ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                          </div>
                        </div>
                      </button>

                      {isOpen && (
                        <div className="mt-4 space-y-4">
                          {/* Contact details */}
                          <div className="flex gap-3 flex-wrap text-xs">
                            <a href={`mailto:${ticket.email}`} className="flex items-center gap-1 text-primary hover:underline">
                              <Mail className="h-3 w-3" />{ticket.email}
                            </a>
                            {ticket.phone && (
                              <a href={`tel:${ticket.phone}`} className="flex items-center gap-1 text-primary hover:underline">
                                <Phone className="h-3 w-3" />{ticket.phone}
                              </a>
                            )}
                          </div>

                          {/* Message */}
                          <div className="bg-muted/40 rounded-lg p-4">
                            <p className="text-xs font-medium text-muted-foreground mb-2">USER MESSAGE</p>
                            <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.message}</p>
                          </div>

                          {/* Existing admin reply */}
                          {ticket.adminReply && (
                            <div className="bg-green-50/50 dark:bg-green-950/20 border border-green-200/50 rounded-lg p-4">
                              <p className="text-xs font-medium text-green-700 dark:text-green-400 mb-2 flex items-center gap-1">
                                <Reply className="h-3 w-3" />
                                {ticket.adminReply.startsWith("🤖") ? "AI REPLY (sent)" : "ADMIN REPLY (sent)"}
                              </p>
                              <p className="text-sm leading-relaxed whitespace-pre-wrap">{ticket.adminReply}</p>
                            </div>
                          )}

                          {/* ── AI Suggestion Panel ─────────────────────────── */}
                          {ai && (
                            <div className="bg-primary/5 border-2 border-primary/20 rounded-xl p-4 space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-2">
                                  <div className="bg-primary/10 p-1.5 rounded-lg">
                                    <Bot className="h-4 w-4 text-primary" />
                                  </div>
                                  <span className="text-sm font-semibold text-primary">AI Suggested Reply</span>
                                  {confidenceBadge(ai.confidence)}
                                  {ai.needsHuman && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 font-medium">
                                      Human review suggested
                                    </span>
                                  )}
                                  {ai.shouldClose && (
                                    <span className="text-xs px-2 py-0.5 rounded-full bg-green-100 text-green-700 font-medium">
                                      Suggests close
                                    </span>
                                  )}
                                </div>
                                <button
                                  onClick={() => setAiSuggestion(s => { const n = { ...s }; delete n[ticket.id]; return n; })}
                                  className="text-muted-foreground hover:text-foreground"
                                >
                                  <XCircle className="h-4 w-4" />
                                </button>
                              </div>

                              <div className="bg-background border rounded-lg p-3 text-sm whitespace-pre-wrap leading-relaxed">
                                {ai.reply}
                              </div>

                              <div className="flex gap-2 flex-wrap">
                                <Button
                                  size="sm"
                                  className="gap-1.5"
                                  disabled={!!aiSendLoading}
                                  onClick={() => sendAiReply(ticket)}
                                >
                                  {aiSendLoading === ticket.id
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Send className="h-3.5 w-3.5" />}
                                  {ai.shouldClose ? "Send & Close Ticket" : "Send AI Reply"}
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setReplyDraft(d => ({ ...d, [ticket.id]: ai.reply }))}
                                >
                                  Edit Before Sending
                                </Button>
                              </div>
                            </div>
                          )}

                          {/* Admin reply form */}
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <p className="text-xs font-medium text-muted-foreground">
                                {ticket.adminReply ? "SEND NEW REPLY" : "REPLY TO USER"}
                              </p>
                              {!ai && ticket.status !== "resolved" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 text-xs gap-1.5 border-primary/30 text-primary hover:bg-primary/5"
                                  disabled={aiLoading === ticket.id}
                                  onClick={() => fetchAiSuggestion(ticket)}
                                >
                                  {aiLoading === ticket.id
                                    ? <Loader2 className="h-3 w-3 animate-spin" />
                                    : <Sparkles className="h-3 w-3" />}
                                  {aiLoading === ticket.id ? "Generating…" : "AI Suggest"}
                                </Button>
                              )}
                            </div>
                            <Textarea
                              rows={3}
                              placeholder="Type your reply here, or use AI Suggest above..."
                              value={replyDraft[ticket.id] ?? ""}
                              onChange={e => setReplyDraft(d => ({ ...d, [ticket.id]: e.target.value }))}
                            />
                            <div className="flex gap-2 mt-2">
                              <Button
                                size="sm" className="gap-1.5"
                                disabled={replyLoading === ticket.id || !replyDraft[ticket.id]?.trim()}
                                onClick={() => sendReply(ticket)}
                              >
                                {replyLoading === ticket.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Reply className="h-3.5 w-3.5" />}
                                Send Reply
                              </Button>
                              {ticket.status !== "resolved" && (
                                <Button
                                  size="sm" variant="outline"
                                  className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                                  disabled={replyLoading === ticket.id || !replyDraft[ticket.id]?.trim()}
                                  onClick={() => sendReply(ticket, undefined, true)}
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Send & Close
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* Status Actions */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">CHANGE STATUS</p>
                            <div className="flex gap-2 flex-wrap">
                              {ticket.status !== "open" && (
                                <Button size="sm" variant="outline" className="border-blue-300 text-blue-700 hover:bg-blue-50 gap-1.5"
                                  disabled={updateStatus.isPending}
                                  onClick={() => updateStatus.mutate({ id: ticket.id, status: "open" })}>
                                  <RefreshCw className="h-3.5 w-3.5" /> Reopen
                                </Button>
                              )}
                              {ticket.status !== "in_progress" && (
                                <Button size="sm" variant="outline" className="border-yellow-300 text-yellow-700 hover:bg-yellow-50 gap-1.5"
                                  disabled={updateStatus.isPending}
                                  onClick={() => updateStatus.mutate({ id: ticket.id, status: "in_progress" })}>
                                  <Clock className="h-3.5 w-3.5" /> Mark In Progress
                                </Button>
                              )}
                              {ticket.status !== "resolved" && (
                                <Button size="sm" variant="outline" className="border-green-300 text-green-700 hover:bg-green-50 gap-1.5"
                                  disabled={updateStatus.isPending}
                                  onClick={() => updateStatus.mutate({ id: ticket.id, status: "resolved" })}>
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Mark Resolved
                                </Button>
                              )}
                            </div>
                          </div>

                          {/* User Actions */}
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-2">USER ACTIONS</p>
                            {ticket.userId ? (
                              <div className="flex gap-2 flex-wrap">
                                <Button size="sm" variant="outline" className="border-orange-300 text-orange-700 hover:bg-orange-50 gap-1.5"
                                  disabled={!!actionLoading}
                                  onClick={() => userAction("suspend", ticket.userId, ticket.email)}>
                                  {actionLoading === `suspend-${ticket.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserX className="h-3.5 w-3.5" />}
                                  Suspend User
                                </Button>
                                <Button size="sm" variant="outline" className="border-red-300 text-red-700 hover:bg-red-50 gap-1.5"
                                  disabled={!!actionLoading}
                                  onClick={() => userAction("ban", ticket.userId, ticket.email)}>
                                  {actionLoading === `ban-${ticket.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ban className="h-3.5 w-3.5" />}
                                  Ban User
                                </Button>
                                <Button size="sm" variant="outline" className="gap-1.5"
                                  disabled={!!actionLoading}
                                  onClick={() => userAction("reset", ticket.userId, ticket.email)}>
                                  {actionLoading === `reset-${ticket.userId}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <KeyRound className="h-3.5 w-3.5" />}
                                  Reset Password
                                </Button>
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground italic">
                                Submitted without an account — no user actions available.
                              </p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!resetResult} onOpenChange={open => !open && setResetResult(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <KeyRound className="h-5 w-5" /> Password Reset
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Temporary password for <strong>{resetResult?.email}</strong>. Share it securely — user should change it immediately.
            </p>
            <div className="flex items-center gap-2 bg-muted rounded-lg px-4 py-3">
              <code className="flex-1 text-lg font-mono font-bold tracking-wider">{resetResult?.tempPassword}</code>
              <Button variant="ghost" size="sm"
                onClick={() => { navigator.clipboard.writeText(resetResult?.tempPassword ?? ""); toast({ title: "Copied!" }); }}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button className="w-full" onClick={() => setResetResult(null)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
