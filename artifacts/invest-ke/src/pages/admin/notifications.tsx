import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import {
  MessageSquareMore, RefreshCw, Send, ShieldCheck,
  Wifi, WifiOff, Mail, ToggleLeft, CheckCircle2, XCircle,
  BellRing, Info,
} from "lucide-react";

function authHeaders() {
  const token = localStorage.getItem("investke_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

type VerificationMethod = "auto" | "whatsapp" | "email";

const METHOD_OPTIONS: { value: VerificationMethod; label: string; description: string; icon: React.ReactNode }[] = [
  {
    value: "auto",
    label: "Auto (Recommended)",
    description: "Uses WhatsApp when connected. Falls back to email automatically if the bot is offline.",
    icon: <ToggleLeft className="h-5 w-5 text-blue-600" />,
  },
  {
    value: "whatsapp",
    label: "WhatsApp Only",
    description: "Always sends OTPs via WhatsApp. Email is never used.",
    icon: <MessageSquareMore className="h-5 w-5 text-green-600" />,
  },
  {
    value: "email",
    label: "Email Only",
    description: "Always sends OTPs via email (SMTP). WhatsApp is never used.",
    icon: <Mail className="h-5 w-5 text-purple-600" />,
  },
];

export default function AdminNotifications() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: settings, isLoading: settingsLoading } = useGetSettings();

  // WhatsApp status
  const { data: waStatus, isLoading: waLoading, refetch: refetchWa, isFetching: waFetching } = useQuery({
    queryKey: ["admin-whatsapp-status"],
    queryFn: async () => {
      const res = await fetch("/api/admin/whatsapp/status", { headers: authHeaders() });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json() as Promise<{ connected: boolean; phone?: string; error?: string }>;
    },
    refetchInterval: 30_000,
  });

  // Local state for SMTP settings form
  const [smtpForm, setSmtpForm] = useState({
    smtpHost: "",
    smtpPort: "",
    smtpFromEmail: "",
    smtpFromName: "",
  });
  const [smtpFormDirty, setSmtpFormDirty] = useState(false);

  // Sync settings → form (only if not dirty)
  if (settings && !smtpFormDirty && (
    smtpForm.smtpHost !== (settings.smtpHost ?? "smtp.gmail.com") ||
    smtpForm.smtpPort !== (settings.smtpPort ?? "587") ||
    smtpForm.smtpFromEmail !== (settings.smtpFromEmail ?? "") ||
    smtpForm.smtpFromName !== (settings.smtpFromName ?? "Zenti")
  )) {
    setSmtpForm({
      smtpHost: settings.smtpHost ?? "smtp.gmail.com",
      smtpPort: settings.smtpPort ?? "587",
      smtpFromEmail: settings.smtpFromEmail ?? "",
      smtpFromName: settings.smtpFromName ?? "Zenti",
    });
  }

  // Test inputs
  const [testEmail, setTestEmail] = useState("");
  const [testWaPhone, setTestWaPhone] = useState("");

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings saved" });
        setSmtpFormDirty(false);
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => toast({ title: "Error saving settings", variant: "destructive" }),
    },
  });

  const smtpTestMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/admin/email/test-smtp", {
        method: "POST",
        headers: authHeaders(),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as { ok: boolean; error?: string };
    },
    onSuccess: (data) => {
      if (data.ok) {
        toast({ title: "SMTP connection verified", description: "Your SMTP settings are working correctly." });
      } else {
        toast({ title: "SMTP connection failed", description: data.error ?? "Check your SMTP credentials.", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "SMTP test failed", description: err.message, variant: "destructive" }),
  });

  const emailOtpMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await fetch("/api/admin/email/test-otp", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ email, reason: "Admin Test" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as { ok: boolean; delivered: boolean; error?: string };
    },
    onSuccess: (data) => {
      if (data.delivered) {
        toast({ title: "Test email sent", description: `OTP email delivered to ${testEmail}` });
      } else {
        toast({ title: "Not delivered", description: data.error ?? "Email not delivered", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "Test email failed", description: err.message, variant: "destructive" }),
  });

  const waOtpMutation = useMutation({
    mutationFn: async (phone: string) => {
      const res = await fetch("/api/admin/whatsapp/test-otp", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ phone, reason: "Admin Test" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      return data as { ok: boolean; delivered: boolean; error?: string };
    },
    onSuccess: (data) => {
      if (data.delivered) {
        toast({ title: "WhatsApp OTP sent", description: `Test OTP delivered to ${testWaPhone}` });
      } else {
        toast({ title: "Not delivered", description: data.error ?? "Not delivered", variant: "destructive" });
      }
    },
    onError: (err: Error) => toast({ title: "WhatsApp test failed", description: err.message, variant: "destructive" }),
  });

  const currentMethod: VerificationMethod = (settings?.verificationMethod as VerificationMethod) ?? "auto";
  const waConnected = waStatus?.connected === true;

  function selectMethod(method: VerificationMethod) {
    updateMutation.mutate({ data: { verificationMethod: method } });
  }

  function saveSmtp() {
    updateMutation.mutate({ data: smtpForm });
  }

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BellRing className="h-5 w-5 text-primary" /> Notifications & Verification
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure how OTPs and alerts are delivered to users
          </p>
        </div>

        {/* ── Verification Method ────────────────────────── */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> OTP Delivery Method
            </CardTitle>
          </CardHeader>
          <CardContent>
            {settingsLoading ? (
              <div className="space-y-3">{[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}</div>
            ) : (
              <div className="space-y-3">
                {METHOD_OPTIONS.map(opt => {
                  const selected = currentMethod === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => selectMethod(opt.value)}
                      disabled={updateMutation.isPending}
                      className={`w-full text-left p-4 rounded-lg border-2 transition-all flex items-start gap-3 ${
                        selected
                          ? "border-primary bg-primary/5"
                          : "border-border hover:border-primary/40 hover:bg-muted/40"
                      }`}
                    >
                      <div className="mt-0.5 shrink-0">{opt.icon}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{opt.label}</span>
                          {selected && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-primary/10 text-primary border-primary/20 border">
                              Active
                            </Badge>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{opt.description}</p>
                      </div>
                      <div className="shrink-0 mt-0.5">
                        {selected
                          ? <CheckCircle2 className="h-4 w-4 text-primary" />
                          : <div className="h-4 w-4 rounded-full border-2 border-muted-foreground/30" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Auto-mode info banner */}
            {currentMethod === "auto" && (
              <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-3">
                <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
                <p className="text-xs text-blue-700 leading-relaxed">
                  <strong>Auto mode:</strong> Each OTP request checks the WhatsApp bot status live.
                  If connected → WhatsApp. If disconnected → email. No manual switching needed.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* ── WhatsApp Status ──────────────────────────── */}
          <Card className={`border-2 ${waConnected ? "border-green-300 bg-green-50/50" : waLoading ? "" : "border-red-300 bg-red-50/50"}`}>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <MessageSquareMore className="h-4 w-4" /> WhatsApp Bot
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => refetchWa()} disabled={waFetching}>
                  <RefreshCw className={`h-3.5 w-3.5 mr-1 ${waFetching ? "animate-spin" : ""}`} /> Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {waLoading ? (
                <div className="space-y-2"><Skeleton className="h-6 w-32" /><Skeleton className="h-4 w-48" /></div>
              ) : (
                <div className="flex items-center gap-3">
                  <div className={`p-2.5 rounded-full ${waConnected ? "bg-green-100" : "bg-red-100"}`}>
                    {waConnected
                      ? <Wifi className="h-5 w-5 text-green-600" />
                      : <WifiOff className="h-5 w-5 text-red-500" />}
                  </div>
                  <div>
                    <Badge variant={waConnected ? "default" : "destructive"} className={waConnected ? "bg-green-600" : ""}>
                      {waConnected ? "Connected" : "Disconnected"}
                    </Badge>
                    {waConnected && waStatus?.phone && (
                      <p className="text-xs text-muted-foreground mt-1">+{waStatus.phone}</p>
                    )}
                    {!waConnected && waStatus?.error && (
                      <p className="text-xs text-red-600 mt-1">{waStatus.error}</p>
                    )}
                  </div>
                </div>
              )}
              <div className="space-y-2 pt-1">
                <Label className="text-xs">Send test OTP</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="07XXXXXXXX"
                    value={testWaPhone}
                    onChange={e => setTestWaPhone(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!testWaPhone || waOtpMutation.isPending}
                    onClick={() => waOtpMutation.mutate(testWaPhone)}
                    className="shrink-0"
                  >
                    {waOtpMutation.isPending
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {waOtpMutation.isSuccess && (
                  <p className={`text-xs ${waOtpMutation.data?.delivered ? "text-green-600" : "text-red-500"}`}>
                    {waOtpMutation.data?.delivered ? "✓ Delivered" : `✗ ${waOtpMutation.data?.error ?? "Not delivered"}`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── Email Status ─────────────────────────────── */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Mail className="h-4 w-4" /> Email (SMTP)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-3 mb-1">
                <div className="p-2.5 rounded-full bg-purple-100">
                  <Mail className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    {process.env.NODE_ENV !== undefined ? (
                      <Badge className="bg-purple-600">
                        {smtpForm.smtpHost || "smtp.gmail.com"}:{smtpForm.smtpPort || "587"}
                      </Badge>
                    ) : null}
                    <Badge variant="outline" className="text-xs">
                      {settings?.smtpFromEmail ? "Configured" : "Using env SMTP_USER"}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    From: {settings?.smtpFromName ?? "Zenti"} &lt;{settings?.smtpFromEmail || "SMTP_USER"}&gt;
                  </p>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Send test email OTP</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="test@example.com"
                    type="email"
                    value={testEmail}
                    onChange={e => setTestEmail(e.target.value)}
                    className="h-8 text-sm"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={!testEmail || emailOtpMutation.isPending}
                    onClick={() => emailOtpMutation.mutate(testEmail)}
                    className="shrink-0"
                  >
                    {emailOtpMutation.isPending
                      ? <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      : <Send className="h-3.5 w-3.5" />}
                  </Button>
                </div>
                {emailOtpMutation.isSuccess && (
                  <p className={`text-xs ${emailOtpMutation.data?.delivered ? "text-green-600" : "text-red-500"}`}>
                    {emailOtpMutation.data?.delivered ? "✓ Delivered" : `✗ ${emailOtpMutation.data?.error ?? "Not delivered"}`}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* ── SMTP Configuration ───────────────────────────── */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Mail className="h-4 w-4 text-primary" /> SMTP Configuration
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 flex items-start gap-2">
              <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-800 leading-relaxed">
                <strong>Credentials are stored as server secrets</strong> (<code>SMTP_USER</code> / <code>SMTP_PASS</code>).
                Only the host, port, and display name are saved here. For Gmail, use App Passwords with 2FA enabled.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">SMTP Host</Label>
                <Input
                  placeholder="smtp.gmail.com"
                  value={smtpForm.smtpHost}
                  onChange={e => { setSmtpForm(f => ({ ...f, smtpHost: e.target.value })); setSmtpFormDirty(true); }}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">SMTP Port</Label>
                <Input
                  placeholder="587"
                  value={smtpForm.smtpPort}
                  onChange={e => { setSmtpForm(f => ({ ...f, smtpPort: e.target.value })); setSmtpFormDirty(true); }}
                />
                <p className="text-xs text-muted-foreground">587 (TLS) or 465 (SSL)</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label className="text-sm">From Email</Label>
                <Input
                  placeholder="noreply@yourdomain.com"
                  type="email"
                  value={smtpForm.smtpFromEmail}
                  onChange={e => { setSmtpForm(f => ({ ...f, smtpFromEmail: e.target.value })); setSmtpFormDirty(true); }}
                />
                <p className="text-xs text-muted-foreground">Leave blank to use SMTP_USER</p>
              </div>
              <div className="space-y-1.5">
                <Label className="text-sm">From Name</Label>
                <Input
                  placeholder="Zenti"
                  value={smtpForm.smtpFromName}
                  onChange={e => { setSmtpForm(f => ({ ...f, smtpFromName: e.target.value })); setSmtpFormDirty(true); }}
                />
              </div>
            </div>

            <div className="flex gap-3 pt-1">
              <Button
                variant="outline"
                disabled={smtpTestMutation.isPending}
                onClick={() => smtpTestMutation.mutate()}
                className="flex items-center gap-2"
              >
                {smtpTestMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Testing…</>
                  : <><CheckCircle2 className="h-4 w-4" /> Test Connection</>}
              </Button>
              <Button
                disabled={updateMutation.isPending || !smtpFormDirty}
                onClick={saveSmtp}
                className="flex items-center gap-2"
              >
                {updateMutation.isPending
                  ? <><RefreshCw className="h-4 w-4 animate-spin" /> Saving…</>
                  : "Save SMTP Settings"}
              </Button>
            </div>

            {smtpTestMutation.isSuccess && (
              <div className={`flex items-center gap-2 text-sm p-2 rounded ${smtpTestMutation.data?.ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700"}`}>
                {smtpTestMutation.data?.ok
                  ? <><CheckCircle2 className="h-4 w-4" /> Connection verified successfully</>
                  : <><XCircle className="h-4 w-4" /> {smtpTestMutation.data?.error ?? "Connection failed"}</>}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </Layout>
  );
}
