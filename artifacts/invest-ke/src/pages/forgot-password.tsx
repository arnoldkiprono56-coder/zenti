import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpFromLine, AlertCircle, Loader2, CheckCircle2 } from "lucide-react";
import { OtpDialog } from "@/components/otp-dialog";
import { apiUrl } from "@/lib/api-url";

async function callApi(path: string, body: object) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

type Step = "phone" | "otp" | "done";

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>("phone");
  const [phone, setPhone] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const normalizePhone = (v: string) => v.replace(/\s/g, "");

  const handleSendOtp = async () => {
    setError(null);
    const normalized = normalizePhone(phone);
    if (!/^(07|01)\d{8}$/.test(normalized)) {
      setError("Please enter a valid Kenyan phone number (07XX or 01XX).");
      return;
    }
    setLoading(true);
    try {
      const data = await callApi("/api/otp/send", { phone: normalized, reason: "Password Reset" });
      setOtpChannel(data.channel ?? "whatsapp");
      setOtpOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (newPassword.length < 8) throw new Error("Password must be at least 8 characters");
    if (newPassword !== confirmPassword) throw new Error("Passwords do not match");
    await callApi("/api/auth/reset-password", {
      phone: normalizePhone(phone),
      code,
      newPassword,
    });
  };

  const handleVerified = () => {
    setOtpOpen(false);
    setStep("done");
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
            {step === "done" ? "Password Updated" : "Reset Password"}
          </CardTitle>
          <CardDescription>
            {step === "phone" && "Enter your M-Pesa phone number to receive a reset code"}
            {step === "done" && "Your password has been successfully updated"}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {step === "done" ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <div className="h-14 w-14 rounded-full bg-green-100 flex items-center justify-center">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <p className="text-sm text-muted-foreground">
                Your password has been updated. You can now log in with your new password.
              </p>
            </div>
          ) : (
            <>
              {error && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <div className="space-y-2">
                <Label>M-Pesa Phone Number</Label>
                <Input
                  placeholder="07XXXXXXXX or 01XXXXXXXX"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>New Password</Label>
                <Input
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Confirm New Password</Label>
                <Input
                  type="password"
                  placeholder="Repeat your new password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                />
              </div>

              <Button className="w-full h-11" onClick={handleSendOtp} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                {loading ? "Sending code…" : "Send Verification Code"}
              </Button>
            </>
          )}
        </CardContent>

        <CardFooter className="flex justify-center border-t p-4">
          <div className="text-sm text-muted-foreground">
            {step === "done" ? (
              <Link href="/login" className="text-primary font-medium hover:underline">
                Go to Login
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

      <OtpDialog
        open={otpOpen}
        phone={normalizePhone(phone)}
        reason="Password Reset"
        channel={otpChannel}
        onVerified={handleVerified}
        onClose={() => setOtpOpen(false)}
        onResend={() => callApi("/api/otp/send", { phone: normalizePhone(phone), reason: "Password Reset" })}
        onVerify={handleVerify}
      />
    </div>
  );
}
