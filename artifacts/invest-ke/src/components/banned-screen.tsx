import { useState } from "react";
import { ShieldX, AlertCircle, CheckCircle2, Loader2, ArrowUpFromLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { apiUrl } from "@/lib/api-url";

interface BannedScreenProps {
  email?: string;
  reason?: string;
  supportEmail?: string;
}

export function BannedScreen({ email, reason, supportEmail = "support@zenti.run.place" }: BannedScreenProps) {
  const [showAppeal, setShowAppeal] = useState(false);
  const [appealEmail, setAppealEmail] = useState(email ?? "");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch(apiUrl("/api/appeals/submit"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: appealEmail, message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to submit appeal");
      setSubmitted(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to submit appeal. Please try again.");
    } finally {
      setSubmitting(false);
    }
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

        {/* Ban notice card */}
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center space-y-4">
          <div className="flex justify-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <ShieldX className="h-8 w-8 text-destructive" />
            </div>
          </div>

          <div>
            <h1 className="text-xl font-bold text-destructive">Account Suspended</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Your account has been suspended due to a policy violation.
            </p>
          </div>

          {reason && (
            <div className="rounded-lg bg-background border border-border p-3 text-left">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Reason</p>
              <p className="text-sm text-foreground">{reason}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            If you believe this is a mistake, you can submit an appeal below.
            Our team reviews appeals within 48 hours.
          </p>
        </div>

        {/* Appeal section */}
        {submitted ? (
          <div className="rounded-2xl border border-green-200 bg-green-50 dark:bg-green-950/20 p-6 text-center space-y-3">
            <div className="flex justify-center">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
            <h2 className="font-semibold text-green-800 dark:text-green-400">Appeal Submitted</h2>
            <p className="text-sm text-muted-foreground">
              Your appeal has been received. We will review it within 48 hours and notify you at{" "}
              <strong>{appealEmail}</strong>.
            </p>
          </div>
        ) : showAppeal ? (
          <div className="rounded-2xl border border-border bg-card p-6 space-y-4">
            <h2 className="font-semibold text-base">Submit an Appeal</h2>
            <p className="text-xs text-muted-foreground">
              Explain why you believe your account should be reinstated. Be specific and honest.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="appeal-email">Email Address</Label>
                <Input
                  id="appeal-email"
                  type="email"
                  placeholder="Your account email"
                  value={appealEmail}
                  onChange={(e) => setAppealEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="appeal-message">Your Appeal Message</Label>
                <Textarea
                  id="appeal-message"
                  placeholder="Explain why you believe your account should be reinstated. Include any relevant context or evidence..."
                  rows={5}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  required
                  minLength={30}
                />
                <p className="text-xs text-muted-foreground">Minimum 30 characters</p>
              </div>
              <div className="flex gap-2">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setShowAppeal(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1" disabled={submitting || message.trim().length < 30}>
                  {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  {submitting ? "Submitting…" : "Submit Appeal"}
                </Button>
              </div>
            </form>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <Button onClick={() => setShowAppeal(true)} className="w-full h-11">
              Submit an Appeal
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              Need help?{" "}
              <a href={`mailto:${supportEmail}`} className="text-primary hover:underline">
                Contact {supportEmail}
              </a>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
