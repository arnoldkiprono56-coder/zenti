import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useGetDashboardSummary, useGetMyTransactions, useRequestWithdrawal, useGetSettings, getGetDashboardSummaryQueryKey, getGetMyTransactionsQueryKey } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowDownToLine, Clock, Info, Lock } from "lucide-react";
import { OtpDialog } from "@/components/otp-dialog";
import { apiUrl } from "@/lib/api-url";

async function callApi(path: string, method: "POST" | "GET" = "POST", body?: object) {
  const token = localStorage.getItem("investke_token");
  const res = await fetch(apiUrl(path), {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function Withdraw() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: summary } = useGetDashboardSummary();
  const { data: transactions = [] } = useGetMyTransactions();
  const { data: settings } = useGetSettings();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("");
  const [phoneOrAccount, setPhoneOrAccount] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);

  const pendingWithdrawals = transactions.filter(t => t.type === "withdrawal" && t.status === "pending");
  const balance = summary?.balance ?? 0;
  const lockedBalance = (summary as any)?.lockedBalance ?? 0;
  const withdrawable = Math.max(0, balance - lockedBalance);
  const amt = parseFloat(amount || "0");

  const feePercent = (settings as any)?.withdrawalFeePercent ?? 10;
  const dailyLimit = (settings as any)?.dailyWithdrawalLimitKES ?? 50000;
  const cooldownHours = (settings as any)?.withdrawalCooldownHours ?? 24;

  const feeAmount = amt > 0 ? parseFloat((amt * feePercent / 100).toFixed(2)) : 0;
  const netAmount = amt > 0 ? parseFloat((amt - feeAmount).toFixed(2)) : 0;

  const withdrawMutation = useRequestWithdrawal({
    mutation: {
      onSuccess: () => {
        toast({ title: "Withdrawal requested", description: "Your withdrawal is being processed. You will be notified once approved." });
        setAmount("");
        setPhoneOrAccount("");
        queryClient.invalidateQueries({ queryKey: getGetDashboardSummaryQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetMyTransactionsQueryKey() });
      },
      onError: (e: { data?: { error?: string } }) => {
        toast({ title: "Withdrawal failed", description: e.data?.error ?? "Could not process withdrawal", variant: "destructive" });
      }
    }
  });

  const handleWithdrawClick = async () => {
    setSendingOtp(true);
    try {
      await callApi("/api/otp/send-withdrawal");
      setOtpOpen(true);
    } catch (err: unknown) {
      toast({
        title: "Could not send OTP",
        description: err instanceof Error ? err.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerify = async (code: string) => {
    const phone = summary?.phone ?? "";
    await callApi("/api/otp/verify", "POST", { phone, code });
  };

  const handleVerified = () => {
    setOtpOpen(false);
    withdrawMutation.mutate({ data: { amount: amt, method: method as "mpesa" | "airtel_money" | "bank", phoneOrAccount } });
  };

  const handleResend = async () => {
    await callApi("/api/otp/send-withdrawal");
  };

  const phone = (summary as any)?.phone ?? "";
  const isValidAmt = amt >= 200 && amt <= withdrawable;
  const canSubmit = !withdrawMutation.isPending && !sendingOtp && !!method && !!phoneOrAccount && isValidAmt;

  return (
    <Layout requireAuth>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Withdraw Funds</h1>
          <p className="text-muted-foreground text-sm mt-1">Transfer your earnings to your preferred account</p>
        </div>

        {/* Balance */}
        <Card className="mb-6 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Withdrawable Balance</p>
                <p className="text-3xl font-bold text-primary">{formatKES(withdrawable)}</p>
                {lockedBalance > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total balance: {formatKES(balance)} · <span className="text-amber-600 font-medium">{formatKES(lockedBalance)} on hold</span>
                  </p>
                )}
              </div>
              <ArrowDownToLine className="h-10 w-10 text-primary/30" />
            </div>
          </CardContent>
        </Card>

        {/* Earnings hold warning */}
        {lockedBalance > 0 && (
          <Card className="mb-6 border-amber-200/70 bg-amber-50/40 dark:bg-amber-950/10">
            <CardContent className="p-4 flex items-start gap-3">
              <Lock className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground space-y-1">
                <p className="font-semibold text-amber-800 dark:text-amber-400">KES {formatKES(lockedBalance)} of your earnings are on hold</p>
                <p>Investment earnings are held once you've earned a cumulative total of KES 200. To unlock automatically, make a deposit of <strong>KES 500 or more</strong>. Your moderator can also release it manually.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Limits info */}
        <Card className="mb-6 border-blue-200/50 bg-blue-50/30 dark:bg-blue-950/10">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-4 w-4 text-blue-500 mt-0.5 shrink-0" />
            <div className="text-xs text-muted-foreground space-y-0.5">
              <p><strong className="text-foreground">Fee:</strong> {feePercent}% is deducted from each withdrawal</p>
              {dailyLimit > 0 && <p><strong className="text-foreground">Daily limit:</strong> {formatKES(dailyLimit)} per day</p>}
              {cooldownHours > 0 && <p><strong className="text-foreground">Cooldown:</strong> One withdrawal every {cooldownHours} hours</p>}
              <p><strong className="text-foreground">Minimum:</strong> KES 200 gross</p>
            </div>
          </CardContent>
        </Card>

        {/* Form */}
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">New Withdrawal</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Withdrawal Method</Label>
              <Select value={method} onValueChange={setMethod}>
                <SelectTrigger><SelectValue placeholder="Select method" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="mpesa">M-Pesa (Safaricom)</SelectItem>
                  <SelectItem value="airtel_money">Airtel Money</SelectItem>
                  <SelectItem value="bank">Bank Account</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>{method === "bank" ? "Account Number" : "Phone Number"}</Label>
              <Input
                placeholder={method === "bank" ? "Enter bank account number" : "07XXXXXXXX or 01XXXXXXXX"}
                value={phoneOrAccount}
                onChange={e => setPhoneOrAccount(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Amount to Withdraw (KES)</Label>
              <Input type="number" placeholder="Min: 200" value={amount} onChange={e => setAmount(e.target.value)} min={200} />
              {amt > 0 && amt > withdrawable && (
                <p className="text-xs text-red-500">Amount exceeds your withdrawable balance ({formatKES(withdrawable)})</p>
              )}
              {amt > 0 && amt < 200 && (
                <p className="text-xs text-amber-500">Minimum withdrawal is KES 200</p>
              )}
            </div>

            {/* Fee breakdown */}
            {amt >= 200 && amt <= withdrawable && (
              <div className="bg-muted rounded-lg p-4 space-y-2 text-sm">
                <p className="font-medium text-xs text-muted-foreground uppercase tracking-wide">Withdrawal Breakdown</p>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Gross withdrawal</span>
                  <span className="font-medium">{formatKES(amt)}</span>
                </div>
                <div className="flex justify-between text-red-500">
                  <span>Processing fee ({feePercent}%)</span>
                  <span>− {formatKES(feeAmount)}</span>
                </div>
                <Separator />
                <div className="flex justify-between font-semibold text-green-600 dark:text-green-400">
                  <span>You will receive</span>
                  <span>{formatKES(netAmount)}</span>
                </div>
              </div>
            )}

            <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground space-y-1">
              <p>⚡ A WhatsApp OTP will be sent to your registered number to confirm the withdrawal.</p>
              <p>Withdrawals are reviewed within 24 hours before processing.</p>
            </div>

            <Button
              className="w-full"
              disabled={!canSubmit}
              onClick={handleWithdrawClick}
            >
              {(withdrawMutation.isPending || sendingOtp) ? "Sending code…" : "Request Withdrawal"}
            </Button>
          </CardContent>
        </Card>

        {/* Pending Withdrawals */}
        {pendingWithdrawals.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4" />Pending Withdrawals</CardTitle></CardHeader>
            <CardContent>
              <div className="divide-y">
                {pendingWithdrawals.map(txn => (
                  <div key={txn.id} className="py-3 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium">{formatKES(txn.amount)}</p>
                      {(txn as any).fee > 0 && (
                        <p className="text-xs text-muted-foreground">Fee: {formatKES((txn as any).fee)} · Net: {formatKES(txn.amount - (txn as any).fee)}</p>
                      )}
                      <p className="text-xs text-muted-foreground capitalize">{txn.method?.replace("_", " ")} — {txn.phoneOrAccount}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(String(txn.createdAt))}</p>
                    </div>
                    <Badge variant="secondary">Pending Review</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      <OtpDialog
        open={otpOpen}
        phone={phone}
        reason="Funds Withdrawal"
        onVerified={handleVerified}
        onClose={() => setOtpOpen(false)}
        onResend={handleResend}
        onVerify={handleVerify}
      />
    </Layout>
  );
}
