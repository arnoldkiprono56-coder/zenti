import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpFromLine, AlertCircle, Loader2, CheckCircle2, Mail } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setError("Please enter a valid email address.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/forgot-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-muted/30 p-4">
      <Link href="/" className="flex items-center gap-2 mb-8">
        <div className="bg-primary text-primary-foreground p-1 rounded">
          <ArrowUpFromLine className="h-6 w-6" />
        </div>
        <span className="font-bold text-2xl tracking-tight text-primary">Zenti</span>
      </Link>

      <Card className="w-full max-w-md shadow-lg border-border">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">
            {sent ? "Check your inbox" : "Reset Password"}
          </CardTitle>
          <CardDescription>
            {sent
              ? `We've sent a secure reset link to ${email}`
              : "Enter your account email — we'll send you a secure link to reset your password"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <div className="h-16 w-16 rounded-full bg-green-100 flex items-center justify-center">
                <Mail className="h-8 w-8 text-green-600" />
              </div>
              <div className="space-y-2">
                <p className="text-sm text-muted-foreground">
                  Click the link in the email to set a new password. The link expires in <strong>1 hour</strong>.
                </p>
                <p className="text-xs text-muted-foreground">
                  Didn't get it? Check your spam folder, or{" "}
                  <button
                    className="text-primary underline hover:no-underline"
                    onClick={() => { setSent(false); setError(null); }}
                  >
                    try again
                  </button>.
                </p>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email Address</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? "Sending…" : "Send Reset Link"}
              </Button>
            </form>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4">
          <div className="text-sm text-muted-foreground">
            {sent ? (
              <Link href="/login" className="text-primary font-medium hover:underline">
                Back to Login
              </Link>
            ) : (
              <>
                Remember your password?{" "}
                <Link href="/login" className="text-primary font-medium hover:underline">
                  Log in
                </Link>
              </>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
