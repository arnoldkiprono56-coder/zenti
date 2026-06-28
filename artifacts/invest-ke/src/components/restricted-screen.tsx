import { useState } from "react";
import { ShieldAlert, CreditCard, Loader2, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { apiUrl } from "@/lib/api-url";
import { useQueryClient } from "@tanstack/react-query";

interface RestrictedScreenProps {
  email: string;
  phone: string;
}

export function RestrictedScreen({ email, phone }: RestrictedScreenProps) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleVerificationDeposit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(apiUrl("/api/transactions/deposit"), {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${localStorage.getItem("token")}`
        },
        body: JSON.stringify({ 
          amount: 1, 
          phone: phone,
          method: "m-pesa",
          notes: "Identity Verification Deposit"
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to initiate deposit");
      
      setSuccess(true);
      // Poll for status update or tell user to wait for STK push
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to initiate verification deposit. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const checkStatus = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="flex justify-center mb-2">
          <div className="flex items-center gap-2">
            <div className="bg-primary text-primary-foreground p-1 rounded">
              <ArrowUpFromLine className="h-5 w-5" />
            </div>
            <span className="font-bold text-xl tracking-tight text-primary">Zenti</span>
          </div>
        </div>

        {/* Restricted notice card */}
        <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-amber-500/10">
              <ShieldAlert className="h-8 w-8 text-amber-500" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-amber-600">Account Restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              To protect our community from fraud, accounts using certain email providers must verify their identity.
            </p>
          </div>

          <div className="rounded-lg bg-background border border-border p-4 text-left space-y-3">
            <h2 className="text-sm font-semibold">How to verify:</h2>
            <ol className="text-xs text-muted-foreground space-y-2 list-decimal ml-4">
              <li>Make a small <strong>KES 1</strong> verification deposit.</li>
              <li>We will fetch your government-registered name from M-Pesa.</li>
              <li>Your account will be automatically unrestricted.</li>
            </ol>
          </div>

          {success ? (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-2 text-green-600 font-medium">
                <CheckCircle2 className="h-5 w-5" />
                <span>STK Push Sent!</span>
              </div>
              <p className="text-xs text-muted-foreground">
                Please check your phone and enter your M-Pesa PIN. Once the payment is confirmed, click the button below.
              </p>
              <Button onClick={checkStatus} variant="outline" className="w-full">
                I've completed the payment
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {error && <p className="text-xs text-destructive">{error}</p>}
              <Button 
                onClick={handleVerificationDeposit} 
                className="w-full h-11" 
                disabled={loading}
              >
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Pay KES 1 to Verify
              </Button>
              <p className="text-[10px] text-muted-foreground italic">
                * This deposit will be added to your available balance.
              </p>
            </div>
          )}
        </div>

        <p className="text-center text-xs text-muted-foreground">
          Need help? <a href="/support" className="text-primary hover:underline">Contact Support</a>
        </p>
      </div>
    </div>
  );
}
