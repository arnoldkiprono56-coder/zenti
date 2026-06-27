import { useState } from "react";
import { useLocation, Link } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { motion } from "framer-motion";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpFromLine, AlertCircle, Loader2 } from "lucide-react";
import { OtpDialog } from "@/components/otp-dialog";
import { BannedScreen } from "@/components/banned-screen";
import { apiUrl } from "@/lib/api-url";

const loginSchema = z.object({
  email: z.string().email({ message: "Please enter a valid email address." }),
  password: z.string().min(1, { message: "Password is required." }),
});

type LoginValues = z.infer<typeof loginSchema>;

function getKenyaDate(): string {
  return new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function isTrustedToday(email: string): boolean {
  try {
    const raw = localStorage.getItem("investke_device_trust");
    if (!raw) return false;
    const trust = JSON.parse(raw) as { email: string; date: string };
    return trust.email === email && trust.date === getKenyaDate();
  } catch { return false; }
}

function setTrustedDevice(email: string): void {
  localStorage.setItem(
    "investke_device_trust",
    JSON.stringify({ email, date: getKenyaDate() }),
  );
}

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

export default function Login() {
  const [, setLocation] = useLocation();
  const { login, isLoggingIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [bannedInfo, setBannedInfo] = useState<{ email: string; reason?: string } | null>(null);
  const [pendingValues, setPendingValues] = useState<LoginValues | null>(null);
  const [pendingPhone, setPendingPhone] = useState<string | null>(null);
  const [otpOpen, setOtpOpen] = useState(false);
  const [sendingOtp, setSendingOtp] = useState(false);
  const [whatsappFailed, setWhatsappFailed] = useState(false);
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp");

  const form = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const sendOtp = async (phone: string, email?: string) => {
    const data = await callApi("/api/otp/send", { phone, email, reason: "Login" });
    const ch: "whatsapp" | "email" = data.channel ?? "whatsapp";
    setOtpChannel(ch);
    setWhatsappFailed(ch === "email" ? false : !!data.whatsappFailed);
    return data as { channel?: "whatsapp" | "email" };
  };

  if (bannedInfo) {
    return <BannedScreen email={bannedInfo.email} reason={bannedInfo.reason} />;
  }

  const onSubmit = async (values: LoginValues) => {
    setError(null);
    setSendingOtp(true);
    try {
      const pre = await callApi("/api/auth/pre-login", { email: values.email, password: values.password });
      if (pre.banned) {
        setBannedInfo({ email: values.email, reason: pre.reason });
        return;
      }

      if (pre.skipOtp) {
        login({ data: values }, {
          onSuccess: () => setLocation("/dashboard"),
          onError: (err: any) => setError(err.message || "Login failed. Please try again."),
        });
        return;
      }

      if (isTrustedToday(values.email)) {
        login({ data: values }, {
          onSuccess: () => setLocation("/dashboard"),
          onError: (err: any) => setError(err.message || "Login failed. Please try again."),
        });
        return;
      }

      const phone: string = pre.phone;
      await sendOtp(phone, values.email);
      setPendingValues(values);
      setPendingPhone(phone);
      setOtpOpen(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to log in. Please check your credentials.");
    } finally {
      setSendingOtp(false);
    }
  };

  const handleVerify = async (code: string) => {
    if (!pendingPhone) return;
    await callApi("/api/otp/verify", { phone: pendingPhone, code });
  };

  const handleVerified = () => {
    if (!pendingValues) return;
    setTrustedDevice(pendingValues.email);
    setOtpOpen(false);
    login({ data: pendingValues }, {
      onSuccess: () => setLocation("/dashboard"),
      onError: (err: any) => setError(err.message || "Login failed. Please try again."),
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-muted/30 p-4">
      <motion.div
        initial={{ opacity: 0, y: -16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
      >
        <Link href="/" className="flex items-center gap-2 mb-8">
          <div className="bg-primary text-primary-foreground p-1 rounded">
            <ArrowUpFromLine className="h-6 w-6" />
          </div>
          <span className="font-bold text-2xl tracking-tight text-primary">Zenti</span>
        </Link>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-lg border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Welcome back</CardTitle>
            <CardDescription>
              Enter your credentials to access your account
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                {error && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.97 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.2 }}
                  >
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  </motion.div>
                )}

                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email Address</FormLabel>
                      <FormControl>
                        <Input placeholder="name@example.com" type="email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <div className="flex items-center justify-between">
                        <FormLabel>Password</FormLabel>
                        <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                          Forgot password?
                        </Link>
                      </div>
                      <FormControl>
                        <Input placeholder="••••••••" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <Button type="submit" className="w-full h-12 text-lg font-medium mt-6" disabled={sendingOtp || isLoggingIn}>
                  {(sendingOtp || isLoggingIn) ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {sendingOtp ? "Sending code…" : isLoggingIn ? "Logging in…" : "Log In"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t p-4">
            <div className="text-sm text-muted-foreground">
              Don't have an account?{" "}
              <Link href="/register" className="text-primary font-medium hover:underline">
                Register here
              </Link>
            </div>
          </CardFooter>
        </Card>
      </motion.div>

      {pendingPhone && (
        <OtpDialog
          open={otpOpen}
          phone={pendingPhone}
          email={pendingValues?.email}
          reason="Login"
          channel={otpChannel}
          whatsappFailed={whatsappFailed}
          onVerified={handleVerified}
          onClose={() => setOtpOpen(false)}
          onResend={() => sendOtp(pendingPhone, pendingValues?.email)}
          onVerify={handleVerify}
        />
      )}
    </div>
  );
}
