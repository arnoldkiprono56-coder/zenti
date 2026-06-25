import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpFromLine, AlertCircle, Loader2, CheckCircle2, ShieldAlert } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

export default function ResetPassword() {
  const [location] = useLocation();
  const token = new URLSearchParams(window.location.search).get("token") ?? "";

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(apiUrl("/api/auth/reset-password"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong");
      setDone(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to reset password. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-muted/30 p-4">
        <Link href="/" className="flex items-center gap-2 mb-8">
          <div className="bg-primary text-primary-foreground p-1 rounded">
            <ArrowUpFromLine className="h-6 w-6" />
          </div>
          <span className="font-bold text-2xl tracking-tight text-primary">Zenti</span>
        </Link>
        <Card className="w-full max-w-md shadow-lg">
          <CardContent className="pt-8 pb-6 flex flex-col items-center gap-4 text-center">
            <ShieldAlert className="h-12 w-12 text-destructive" />
            <div>
              <p className="font-semibold text-lg">Invalid reset link</p>
              <p className="text-sm text-muted-foreground mt-1">This link is missing a reset token. Please request a new one.</p>
            </div>
            <Link href="/forgot-password">
              <Button variant="outline">Request New Link</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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
            {done ? "Password Updated" : "Set New Password"}
          </CardTitle>
          <CardDescription>
            {done
              ? "Your password has been successfully updated"
              : "Choose a strong new password for your Zenti account"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {done ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                Your password has been updated. You can now log in with your new password.
              </p>
              <Link href="/login">
                <Button className="mt-2">Go to Login</Button>
              </Link>
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
                <Label htmlFor="newPassword">New Password</Label>
                <Input
                  id="newPassword"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm New Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  required
                />
              </div>

              <Button type="submit" className="w-full h-11" disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? "Updating…" : "Update Password"}
              </Button>
            </form>
          )}
        </CardContent>

        {!done && (
          <CardFooter className="flex justify-center border-t p-4">
            <div className="text-sm text-muted-foreground">
              Link expired?{" "}
              <Link href="/forgot-password" className="text-primary font-medium hover:underline">
                Request a new one
              </Link>
            </div>
          </CardFooter>
        )}
      </Card>
    </div>
  );
}
