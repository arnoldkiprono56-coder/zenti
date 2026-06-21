import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDate } from "@/lib/format";
import { apiUrl } from "@/lib/api-url";
import {
  MessageCircle, X, Send, Plus, ChevronLeft, Loader2,
  ShieldAlert, CheckCircle2, Clock,
} from "lucide-react";

type Ticket = {
  id: number;
  subject: string;
  category: string;
  status: "open" | "in_progress" | "resolved";
  createdAt: string;
  updatedAt: string;
};

type ChatMessage = {
  id: number;
  sender: "user" | "admin" | "system";
  message: string;
  isFlagged: boolean;
  createdAt: string;
};

const CATEGORIES = [
  { value: "general", label: "General Question" },
  { value: "account_issue", label: "Account Issue" },
  { value: "investment_query", label: "Investment Query" },
  { value: "deposit_issue", label: "Deposit Problem" },
  { value: "withdrawal_issue", label: "Withdrawal Problem" },
  { value: "referral", label: "Referral Program" },
  { value: "technical", label: "Technical Problem" },
];

function statusColor(s: string) {
  if (s === "resolved") return "bg-green-100 text-green-800";
  if (s === "in_progress") return "bg-blue-100 text-blue-800";
  return "bg-yellow-100 text-yellow-800";
}

function statusLabel(s: string) {
  if (s === "resolved") return "✓ Resolved";
  if (s === "in_progress") return "● In Progress";
  return "● Open";
}

export function SupportChat() {
  const { isAuthenticated } = useAuth();
  const { toast } = useToast();
  const token = localStorage.getItem("investke_token");
  const headers = { "Content-Type": "application/json", Authorization: `Bearer ${token}` };

  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"list" | "new" | "chat">("list");
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [activeTicket, setActiveTicket] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [newMessage, setNewMessage] = useState("");

  const [newSubject, setNewSubject] = useState("");
  const [newBody, setNewBody] = useState("");
  const [newCategory, setNewCategory] = useState("general");
  const [creatingTicket, setCreatingTicket] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open && view === "list") loadTickets();
  }, [open, view]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadTickets() {
    setLoadingTickets(true);
    try {
      const r = await fetch(apiUrl("/api/support/chat/my-tickets"), { headers });
      if (r.ok) setTickets(await r.json());
    } finally {
      setLoadingTickets(false);
    }
  }

  async function openTicket(ticket: Ticket) {
    setActiveTicket(ticket);
    setView("chat");
    setLoadingMessages(true);
    try {
      const r = await fetch(apiUrl(`/api/support/chat/${ticket.id}/messages`), { headers });
      if (r.ok) {
        const data = await r.json();
        setMessages(data.messages ?? []);
      }
    } finally {
      setLoadingMessages(false);
    }
  }

  async function createTicket() {
    if (!newSubject.trim() || !newBody.trim()) {
      toast({ title: "Please fill in all fields", variant: "destructive" });
      return;
    }
    setCreatingTicket(true);
    try {
      const r = await fetch(apiUrl("/api/support/chat/new"), {
        method: "POST",
        headers,
        body: JSON.stringify({ subject: newSubject, message: newBody, category: newCategory }),
      });
      const data = await r.json();
      if (r.ok) {
        toast({ title: "Support ticket opened!", description: "Check your email for confirmation." });
        setNewSubject("");
        setNewBody("");
        setNewCategory("general");
        setView("list");
        await loadTickets();
      } else {
        toast({ title: "Error", description: data.error ?? "Could not create ticket", variant: "destructive" });
      }
    } finally {
      setCreatingTicket(false);
    }
  }

  async function sendMessage() {
    if (!newMessage.trim() || !activeTicket) return;
    setSending(true);
    try {
      const r = await fetch(apiUrl(`/api/support/chat/${activeTicket.id}/message`), {
        method: "POST",
        headers,
        body: JSON.stringify({ message: newMessage }),
      });
      const data = await r.json();
      if (r.ok) {
        setMessages(m => [...m, data]);
        setNewMessage("");
      } else {
        toast({ title: "Error", description: data.error ?? "Could not send", variant: "destructive" });
      }
    } finally {
      setSending(false);
    }
  }

  if (!isAuthenticated) return null;

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-primary text-white rounded-full px-4 py-3 shadow-xl hover:bg-primary/90 transition-all"
        aria-label="Support chat"
      >
        {open ? <X className="h-5 w-5" /> : <MessageCircle className="h-5 w-5" />}
        <span className="text-sm font-semibold">{open ? "Close" : "Support"}</span>
        {tickets.some(t => t.status !== "resolved") && !open && (
          <span className="absolute -top-1 -right-1 h-3 w-3 bg-red-500 rounded-full border-2 border-white" />
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-20 right-6 z-50 w-[360px] max-h-[560px] bg-white border rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-primary text-white px-4 py-3 flex items-center gap-2 shrink-0">
            {view !== "list" && (
              <button
                onClick={() => { setView("list"); setActiveTicket(null); setMessages([]); }}
                className="mr-1 p-1 hover:bg-white/20 rounded"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <MessageCircle className="h-4 w-4 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm leading-tight">
                {view === "list" ? "Support Chat" : view === "new" ? "New Conversation" : (activeTicket?.subject ?? "Conversation")}
              </p>
              <p className="text-xs text-white/70">We reply within 24 hours</p>
            </div>
            {view === "list" && (
              <button
                onClick={() => setView("new")}
                className="shrink-0 bg-white/20 hover:bg-white/30 rounded-lg p-1.5"
                title="New conversation"
              >
                <Plus className="h-4 w-4" />
              </button>
            )}
          </div>

          {/* ── Ticket List ────────────────────────────────────────────────── */}
          {view === "list" && (
            <div className="flex-1 overflow-y-auto">
              {loadingTickets ? (
                <div className="flex items-center justify-center py-10">
                  <Loader2 className="h-6 w-6 animate-spin text-primary" />
                </div>
              ) : tickets.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <MessageCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground opacity-30" />
                  <p className="text-sm font-medium text-muted-foreground">No conversations yet</p>
                  <p className="text-xs text-muted-foreground mt-1">Click + to start a new conversation</p>
                  <Button size="sm" onClick={() => setView("new")} className="mt-4 gap-2">
                    <Plus className="h-3.5 w-3.5" /> New Conversation
                  </Button>
                </div>
              ) : (
                <div className="divide-y">
                  {tickets.map(t => (
                    <button
                      key={t.id}
                      onClick={() => openTicket(t)}
                      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-sm font-medium leading-tight line-clamp-1">{t.subject}</p>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${statusColor(t.status)}`}>
                          {statusLabel(t.status)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        Updated {formatDate(t.updatedAt)}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── New Ticket Form ─────────────────────────────────────────────── */}
          {view === "new" && (
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Category</label>
                <select
                  value={newCategory}
                  onChange={e => setNewCategory(e.target.value)}
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
                >
                  {CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Subject</label>
                <input
                  value={newSubject}
                  onChange={e => setNewSubject(e.target.value)}
                  placeholder="Brief description of your issue"
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background"
                  maxLength={200}
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 block">Message</label>
                <textarea
                  value={newBody}
                  onChange={e => setNewBody(e.target.value)}
                  placeholder="Describe your issue in detail…"
                  className="w-full text-sm border rounded-lg px-3 py-2 bg-background resize-none"
                  rows={4}
                  maxLength={2000}
                />
                <p className="text-xs text-muted-foreground text-right mt-0.5">{newBody.length}/2000</p>
              </div>
              <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-800 flex items-start gap-2">
                <ShieldAlert className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                <span>Every conversation is linked to your account and a copy is sent to your registered email.</span>
              </div>
              <Button onClick={createTicket} disabled={creatingTicket} className="w-full gap-2">
                {creatingTicket ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                {creatingTicket ? "Sending…" : "Send Message"}
              </Button>
            </div>
          )}

          {/* ── Chat View ──────────────────────────────────────────────────── */}
          {view === "chat" && (
            <>
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-muted/20">
                {activeTicket?.status === "resolved" && (
                  <div className="flex items-center justify-center gap-1.5 text-xs text-green-700 bg-green-50 rounded-lg py-2">
                    <CheckCircle2 className="h-3.5 w-3.5" /> This conversation has been resolved
                  </div>
                )}
                {loadingMessages ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                  </div>
                ) : (
                  messages.map(m => (
                    <div
                      key={m.id}
                      className={`flex ${m.sender === "user" ? "justify-end" : "justify-start"}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${
                          m.sender === "user"
                            ? "bg-primary text-white rounded-br-sm"
                            : m.sender === "admin"
                              ? "bg-white border rounded-bl-sm"
                              : "bg-muted/60 text-muted-foreground text-xs italic"
                        }`}
                      >
                        {m.sender === "admin" && (
                          <p className="text-xs font-semibold text-primary mb-1">Support Team</p>
                        )}
                        <p className="leading-relaxed">{m.message}</p>
                        <p className={`text-xs mt-1 ${m.sender === "user" ? "text-white/70" : "text-muted-foreground"}`}>
                          {formatDate(m.createdAt)}
                        </p>
                        {m.isFlagged && (
                          <p className="text-xs mt-1 text-amber-300 flex items-center gap-1">
                            <ShieldAlert className="h-3 w-3" /> Flagged for review
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Input */}
              {activeTicket?.status !== "resolved" ? (
                <div className="border-t p-3 flex gap-2 shrink-0 bg-white">
                  <input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void sendMessage(); } }}
                    placeholder="Type your message…"
                    className="flex-1 text-sm border rounded-lg px-3 py-2 bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                    maxLength={2000}
                    disabled={sending}
                  />
                  <Button size="sm" onClick={sendMessage} disabled={sending || !newMessage.trim()} className="shrink-0">
                    {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  </Button>
                </div>
              ) : (
                <div className="border-t p-3 flex items-center justify-center shrink-0 bg-white">
                  <button
                    onClick={() => { setView("new"); setActiveTicket(null); }}
                    className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" /> Open a new conversation
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
