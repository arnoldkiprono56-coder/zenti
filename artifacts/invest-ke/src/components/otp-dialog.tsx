import { useState, useRef, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MessageCircle, Mail, Loader2, CheckCircle2, AlertCircle, RotateCcw } from "lucide-react";

interface OtpDialogProps {
  open: boolean;
  phone: string;
  email?: string;
  reason: string;
  channel?: "whatsapp" | "email";
  whatsappFailed?: boolean;
  onVerified: () => void;
  onClose: () => void;
  onResend: () => Promise<void>;
  onVerify: (code: string) => Promise<void>;
}

export function OtpDialog({
  open,
  phone,
  email,
  reason,
  channel,
  whatsappFailed,
  onVerified,
  onClose,
  onResend,
  onVerify,
}: OtpDialogProps) {
  const [digits, setDigits] = useState<string[]>(Array(6).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [countdown, setCountdown] = useState(60);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (!open) {
      setDigits(Array(6).fill(""));
      setError(null);
      setCountdown(60);
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown, open]);

  const maskedPhone = phone.replace(/^(07|01)(\d{2})(\d{4})(\d{2})$/, "$1$2****$4");
  const isEmail = channel === "email";
  const maskedEmail = email ? email.replace(/^(.{2})(.*)(@.*)$/, (_, a, b, c) => a + "*".repeat(Math.min(b.length, 4)) + c) : "";

  const handleDigitChange = (idx: number, val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[idx] = cleaned;
    setDigits(next);
    setError(null);
    if (cleaned && idx < 5) {
      inputRefs.current[idx + 1]?.focus();
    }
    if (next.every((d) => d !== "") && cleaned) {
      submitCode(next.join(""));
    }
  };

  const handleKeyDown = (idx: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && !digits[idx] && idx > 0) {
      inputRefs.current[idx - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setDigits(pasted.split(""));
      submitCode(pasted);
    }
  };

  const submitCode = async (code: string) => {
    setVerifying(true);
    setError(null);
    try {
      await onVerify(code);
      onVerified();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Invalid or expired OTP";
      setError(msg);
      setDigits(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } finally {
      setVerifying(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    setError(null);
    try {
      await onResend();
      setCountdown(60);
      setDigits(Array(6).fill(""));
      inputRefs.current[0]?.focus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to resend OTP";
      setError(msg);
    } finally {
      setResending(false);
    }
  };

  const code = digits.join("");

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-sm" onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-3">
            <div className={`p-3 rounded-full ${isEmail ? "bg-purple-500/10" : "bg-green-500/10"}`}>
              {isEmail
                ? <Mail className="h-7 w-7 text-purple-600" />
                : <MessageCircle className="h-7 w-7 text-green-600" />}
            </div>
          </div>
          <DialogTitle className="text-center">
            {isEmail ? "Email Verification" : "WhatsApp Verification"}
          </DialogTitle>
          <DialogDescription className="text-center text-sm">
            {isEmail
              ? <>We sent a 6-digit code to your email<br /><span className="font-semibold text-foreground">{maskedEmail || email}</span></>
              : <>We sent a 6-digit code to your WhatsApp<br /><span className="font-semibold text-foreground">{maskedPhone}</span></>}
            <br />
            <span className="text-xs text-muted-foreground">Reason: {reason}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 mt-2">
          {whatsappFailed && !error && (
            <Alert className="py-2 border-amber-300 bg-amber-50 text-amber-800">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-xs">
                WhatsApp delivery failed. Your code was saved — tap <strong>Resend code</strong> below to try again once the gateway is back online.
              </AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive" className="py-2">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex gap-2 justify-center" onPaste={handlePaste}>
            {digits.map((d, i) => (
              <Input
                key={i}
                ref={(el) => { inputRefs.current[i] = el; }}
                value={d}
                onChange={(e) => handleDigitChange(i, e.target.value)}
                onKeyDown={(e) => handleKeyDown(i, e)}
                maxLength={1}
                inputMode="numeric"
                className="w-10 h-12 text-center text-xl font-bold p-0 border-2 focus:border-primary"
                disabled={verifying}
              />
            ))}
          </div>

          {verifying && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Verifying…
            </div>
          )}

          <Button
            className="w-full"
            disabled={code.length < 6 || verifying}
            onClick={() => submitCode(code)}
          >
            {verifying ? (
              <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Verifying…</>
            ) : (
              <><CheckCircle2 className="mr-2 h-4 w-4" />Verify Code</>
            )}
          </Button>

          <div className="text-center text-xs text-muted-foreground">
            {countdown > 0 ? (
              <span>Resend available in {countdown}s</span>
            ) : (
              <button
                onClick={handleResend}
                disabled={resending}
                className="text-primary hover:underline flex items-center gap-1 mx-auto disabled:opacity-50"
              >
                {resending ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <RotateCcw className="h-3 w-3" />
                )}
                Resend code
              </button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
