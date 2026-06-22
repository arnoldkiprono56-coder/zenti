import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation } from "@tanstack/react-query";
import { MessageSquareMore, RefreshCw, Send, ShieldCheck, Wifi, WifiOff } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

function authHeaders() {
  const token = localStorage.getItem("investke_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function fetchStatus(): Promise<{ connected: boolean; user?: string; phone?: string; error?: string }> {
  const res = await fetch(apiUrl("/api/admin/whatsapp/status"), { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function sendTestOtp(body: { phone: string; reason: string }) {
  const res = await fetch(apiUrl("/api/admin/whatsapp/test-otp"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

async function sendTestMessage(body: { phone: string; text: string }) {
  const res = await fetch(apiUrl("/api/admin/whatsapp/test-message"), {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
  return data;
}

export default function AdminWhatsApp() {
  const { toast } = useToast();

  const [otpPhone, setOtpPhone] = useState("");
  const [otpReason, setOtpReason] = useState("Admin Test");
  const [msgPhone, setMsgPhone] = useState("");
  const [msgText, setMsgText] = useState("");

  const { data: status, isLoading: statusLoading, refetch, isFetching } = useQuery({
    queryKey: ["admin-whatsapp-status"],
    queryFn: fetchStatus,
    refetchInterval: 30_000,
  });

  const otpMutation = useMutation({
    mutationFn: sendTestOtp,
    onSuccess: (data) => {
      if (data.delivered) {
        toast({ title: "OTP sent", description: `Test OTP delivered to ${otpPhone}` });
      } else {
        toast({ title: "Not delivered", description: data.error ?? "Gateway returned not delivered", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send OTP", description: err.message, variant: "destructive" });
    },
  });

  const msgMutation = useMutation({
    mutationFn: sendTestMessage,
    onSuccess: (data) => {
      if (data.delivered) {
        toast({ title: "Message sent", description: `Message delivered to ${msgPhone}` });
        setMsgText("");
      } else {
        toast({ title: "Not delivered", description: data.error ?? "Gateway returned not delivered", variant: "destructive" });
      }
    },
    onError: (err: Error) => {
      toast({ title: "Failed to send message", description: err.message, variant: "destructive" });
    },
  });

  const connected = status?.connected === true;

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <MessageSquareMore className="h-5 w-5 text-primary" /> WhatsApp Gateway
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Monitor connectivity and send test messages</p>
        </div>

        {/* Status Card */}
        <Card className={`mb-6 border-2 ${connected ? "border-green-300 bg-green-50" : statusLoading ? "" : "border-red-300 bg-red-50"}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4" /> Gateway Status
              </CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
                <RefreshCw className={`h-4 w-4 mr-1 ${isFetching ? "animate-spin" : ""}`} />
                Refresh
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {statusLoading ? (
              <div className="space-y-2">
                <Skeleton className="h-6 w-40" />
                <Skeleton className="h-4 w-64" />
              </div>
            ) : (
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-full ${connected ? "bg-green-100" : "bg-red-100"}`}>
                  {connected
                    ? <Wifi className="h-6 w-6 text-green-600" />
                    : <WifiOff className="h-6 w-6 text-red-500" />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant={connected ? "default" : "destructive"} className={connected ? "bg-green-600" : ""}>
                      {connected ? "Connected" : "Disconnected"}
                    </Badge>
                  </div>
                  {connected && status?.phone && (
                    <p className="text-sm text-muted-foreground">Phone: <span className="font-mono font-medium text-foreground">+{status.phone}</span></p>
                  )}
                  {!connected && status?.error && (
                    <p className="text-sm text-red-600 mt-1">{status.error}</p>
                  )}
                  {!connected && !status?.error && (
                    <p className="text-sm text-muted-foreground mt-1">Gateway is not reachable. Check the Railway deployment.</p>
                  )}
                  <p className="text-xs text-muted-foreground mt-2">Auto-refreshes every 30 seconds</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Test OTP */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-primary" /> Send Test OTP
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="otp-phone">Phone Number</Label>
                <Input
                  id="otp-phone"
                  placeholder="07XXXXXXXX"
                  value={otpPhone}
                  onChange={(e) => setOtpPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="otp-reason">Reason</Label>
                <Input
                  id="otp-reason"
                  placeholder="e.g. Admin Test"
                  value={otpReason}
                  onChange={(e) => setOtpReason(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={!otpPhone || otpMutation.isPending}
                onClick={() => otpMutation.mutate({ phone: otpPhone, reason: otpReason })}
              >
                {otpMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Send OTP</>
                )}
              </Button>
              {otpMutation.isSuccess && (
                <p className={`text-xs text-center ${otpMutation.data?.delivered ? "text-green-600" : "text-red-500"}`}>
                  {otpMutation.data?.delivered ? "✓ Delivered successfully" : `✗ ${otpMutation.data?.error ?? "Not delivered"}`}
                </p>
              )}
            </CardContent>
          </Card>

          {/* Test Custom Message */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <MessageSquareMore className="h-4 w-4 text-primary" /> Send Custom Message
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="msg-phone">Phone Number</Label>
                <Input
                  id="msg-phone"
                  placeholder="07XXXXXXXX"
                  value={msgPhone}
                  onChange={(e) => setMsgPhone(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="msg-text">Message</Label>
                <textarea
                  id="msg-text"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 resize-none"
                  placeholder="Type your message here…"
                  value={msgText}
                  onChange={(e) => setMsgText(e.target.value)}
                />
              </div>
              <Button
                className="w-full"
                disabled={!msgPhone || !msgText || msgMutation.isPending}
                onClick={() => msgMutation.mutate({ phone: msgPhone, text: msgText })}
              >
                {msgMutation.isPending ? (
                  <><RefreshCw className="h-4 w-4 mr-2 animate-spin" />Sending…</>
                ) : (
                  <><Send className="h-4 w-4 mr-2" />Send Message</>
                )}
              </Button>
              {msgMutation.isSuccess && (
                <p className={`text-xs text-center ${msgMutation.data?.delivered ? "text-green-600" : "text-red-500"}`}>
                  {msgMutation.data?.delivered ? "✓ Delivered successfully" : `✗ ${msgMutation.data?.error ?? "Not delivered"}`}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
