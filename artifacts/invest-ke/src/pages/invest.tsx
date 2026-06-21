import { useState, useEffect, useRef } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useGetPlans, useInitiateDeposit, useCreateInvestment, getGetDashboardSummaryQueryKey, getGetMyInvestmentsQueryKey } from "@workspace/api-client-react";
import { formatKES } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { TrendingUp, Smartphone, CheckCircle2, Loader2, XCircle } from "lucide-react";

type Step = "select" | "deposit" | "waiting" | "invest";

const POLL_INTERVAL_MS = 5000;
const POLL_TIMEOUT_MS = 90000;

export default function Invest() {
  const { data: plans = [], isLoading } = useGetPlans();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedPlan, setSelectedPlan] = useState<typeof plans[0] | null>(null);
  const [step, setStep] = useState<Step>("select");
  const [phone, setPhone] = useState("");
  const [pendingTxnId, setPendingTxnId] = useState<number | null>(null);
  const [pollSecondsLeft, setPollSecondsLeft] = useState(90);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const regularPlans = plans.filter(p => !p.isInternship && p.isActive);

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
  }

  function resetDialog() {
    stopPolling();
    setSelectedPlan(null);
    setStep("select");
    setPhone("");
    setPendingTxnId(null);
    setPollSecondsLeft(90);
  }

  useEffect(() => {
    if (step !== "waiting" || pendingTxnId === null) return;

    const startedAt = Date.now();
    setPollSecondsLeft(90);

    const poll = async () => {
      try {
        const token = localStorage.getItem("investke_token");
        const base = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
        const res = await fetch(`${base}/api/transactions/${pendingTxnId}/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return;
        const data = await res.json() as { status: string; amount: number };

        if (data.status === "completed") {
          stopPolling();
          queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
          toast({ title: "Payment confirmed!", description: "Your balance has been credited." });
          setStep("invest");
        } else if (data.status === "failed") {
          stopPolling();
          toast({ title: "Payment failed", description: "The M-Pesa prompt was declined or timed out.", variant: "destructive" });
          setStep("deposit");
        }

        const elapsed = Date.now() - startedAt;
        setPollSecondsLeft(Math.max(0, Math.round((POLL_TIMEOUT_MS - elapsed) / 1000)));
      } catch {
        // network error during poll — ignore, keep trying
      }
    };

    pollRef.current = setInterval(poll, POLL_INTERVAL_MS);
    poll();

    timeoutRef.current = setTimeout(() => {
      stopPolling();
      if (step === "waiting") {
        toast({ title: "Payment timed out", description: "No confirmation received. Please try again.", variant: "destructive" });
        setStep("deposit");
      }
    }, POLL_TIMEOUT_MS);

    return stopPolling;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pendingTxnId]);

  const depositMutation = useInitiateDeposit({
    mutation: {
      onSuccess: (data) => {
        const txnId = (data as unknown as { transactionId?: number }).transactionId;
        setPendingTxnId(txnId ?? null);
        setStep("waiting");
      },
      onError: (e: { data?: { error?: string } }) => {
        toast({ title: "Deposit failed", description: e.data?.error ?? "Could not initiate M-Pesa payment", variant: "destructive" });
      }
    }
  });

  const investMutation = useCreateInvestment({
    mutation: {
      onSuccess: () => {
        toast({ title: "Investment started!", description: "Your investment is now active and earning." });
        resetDialog();
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyInvestmentsQueryKey() });
      },
      onError: (e: { data?: { error?: string } }) => {
        toast({ title: "Investment failed", description: e.data?.error ?? "Could not start investment", variant: "destructive" });
      }
    }
  });

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Investment Plans</h1>
          <p className="text-muted-foreground mt-1">Choose a plan, deposit via M-Pesa, and start earning daily returns</p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10">
          {[
            { icon: Smartphone, step: "1", title: "Deposit via M-Pesa", desc: "Send money securely using your Safaricom M-Pesa number" },
            { icon: TrendingUp, step: "2", title: "Choose a Plan", desc: "Select a plan and invest at its fixed price" },
            { icon: CheckCircle2, step: "3", title: "Earn Daily Returns", desc: "Watch your investment grow every 24 hours" },
          ].map(({ icon: Icon, step: s, title, desc }) => (
            <div key={s} className="flex gap-3 p-4 rounded-lg bg-muted/50 border">
              <div className="bg-primary text-primary-foreground h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0">{s}</div>
              <div>
                <p className="font-semibold text-sm">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Plans grid */}
        {isLoading ? <p className="text-center text-muted-foreground py-12">Loading plans...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {regularPlans.map(plan => {
              const dailyEarning = plan.minDeposit * plan.dailyReturnPercent / 100;
              const totalEarning = dailyEarning * plan.durationDays;
              return (
                <Card key={plan.id} className="relative border-2 hover:border-primary/50 transition-colors cursor-pointer" onClick={() => { setSelectedPlan(plan); setStep("deposit"); }}>
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <CardTitle className="text-lg">{plan.name}</CardTitle>
                      <Badge className="text-base font-bold bg-green-100 text-green-800 border-green-200">{plan.dailyReturnPercent}%/day</Badge>
                    </div>
                    {plan.description && <CardDescription>{plan.description}</CardDescription>}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Plan Cost</span>
                      <span className="font-semibold text-primary">{formatKES(plan.minDeposit)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Duration</span>
                      <span className="font-medium">{plan.durationDays} days</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Daily Earning</span>
                      <span className="font-bold text-green-600">{formatKES(dailyEarning)}</span>
                    </div>
                    <div className="pt-2 border-t flex justify-between text-sm">
                      <span className="text-muted-foreground">Total Earnings</span>
                      <span className="font-bold text-primary">{formatKES(totalEarning)}</span>
                    </div>
                    <Button className="w-full mt-2">Invest Now — {formatKES(plan.minDeposit)}</Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Deposit & Invest Dialog */}
      <Dialog open={!!selectedPlan} onOpenChange={open => { if (!open) resetDialog(); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {step === "deposit" && "Deposit via M-Pesa"}
              {step === "waiting" && "Waiting for Payment"}
              {step === "invest" && "Confirm Investment"}
            </DialogTitle>
            <DialogDescription>
              {step === "deposit" && `Invest in ${selectedPlan?.name} — fixed cost ${selectedPlan ? formatKES(selectedPlan.minDeposit) : ""}`}
              {step === "waiting" && "Check your phone for the M-Pesa prompt"}
              {step === "invest" && `Confirm your investment in ${selectedPlan?.name}`}
            </DialogDescription>
          </DialogHeader>

          {/* ── Step: deposit ── */}
          {step === "deposit" && selectedPlan && (
            <div className="space-y-4">
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{selectedPlan.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Plan Cost</span><span className="font-semibold">{formatKES(selectedPlan.minDeposit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Daily Earning</span><span className="font-bold text-green-600">{formatKES(selectedPlan.minDeposit * selectedPlan.dailyReturnPercent / 100)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Earnings</span><span className="font-bold text-primary">{formatKES(selectedPlan.minDeposit * selectedPlan.dailyReturnPercent / 100 * selectedPlan.durationDays)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{selectedPlan.durationDays} days</span></div>
              </div>

              <div className="space-y-2">
                <Label>M-Pesa Phone Number</Label>
                <Input placeholder="07XXXXXXXX or 01XXXXXXXX" value={phone} onChange={e => setPhone(e.target.value)} />
                <p className="text-xs text-muted-foreground flex items-center gap-1"><Smartphone className="h-3 w-3" />Safaricom M-Pesa only — you will be prompted to pay {formatKES(selectedPlan.minDeposit)}</p>
              </div>

              <Button className="w-full" disabled={depositMutation.isPending || !phone}
                onClick={() => depositMutation.mutate({ data: { amount: selectedPlan.minDeposit, phone } })}>
                {depositMutation.isPending ? "Sending M-Pesa prompt…" : `Pay ${formatKES(selectedPlan.minDeposit)} via M-Pesa`}
              </Button>
            </div>
          )}

          {/* ── Step: waiting (polling) ── */}
          {step === "waiting" && (
            <div className="space-y-5 py-2">
              <div className="flex flex-col items-center gap-3 py-4">
                <div className="relative">
                  <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                    <Smartphone className="h-8 w-8 text-green-600" />
                  </div>
                  <Loader2 className="h-5 w-5 text-green-600 animate-spin absolute -bottom-1 -right-1 bg-white rounded-full" />
                </div>
                <div className="text-center">
                  <p className="font-semibold">M-Pesa prompt sent to {phone}</p>
                  <p className="text-sm text-muted-foreground mt-1">Enter your M-Pesa PIN when prompted on your phone</p>
                </div>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-medium">{selectedPlan ? formatKES(selectedPlan.minDeposit) : ""}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{selectedPlan?.name}</span></div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" />Checking payment status…</span>
                <span>{pollSecondsLeft}s remaining</span>
              </div>

              <Button variant="outline" className="w-full" onClick={() => { stopPolling(); setStep("deposit"); }}>
                <XCircle className="h-4 w-4 mr-2" />
                Cancel
              </Button>
            </div>
          )}

          {/* ── Step: invest ── */}
          {step === "invest" && selectedPlan && (
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2 text-green-700 font-medium mb-2"><CheckCircle2 className="h-4 w-4" />Payment confirmed!</div>
                <p className="text-sm text-green-700">Your balance has been credited. Confirm your investment below.</p>
              </div>

              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <div className="flex justify-between"><span className="text-muted-foreground">Plan</span><span className="font-medium">{selectedPlan.name}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Amount</span><span className="font-semibold">{formatKES(selectedPlan.minDeposit)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Daily Earning</span><span className="font-bold text-green-600">{formatKES(selectedPlan.minDeposit * selectedPlan.dailyReturnPercent / 100)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Earnings</span><span className="font-bold text-primary">{formatKES(selectedPlan.minDeposit * selectedPlan.dailyReturnPercent / 100 * selectedPlan.durationDays)}</span></div>
              </div>

              <Button className="w-full" disabled={investMutation.isPending}
                onClick={() => investMutation.mutate({ data: { planId: selectedPlan.id, amount: selectedPlan.minDeposit } })}>
                {investMutation.isPending ? "Starting Investment…" : "Confirm Investment"}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
