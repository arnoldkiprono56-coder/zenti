import { useState } from "react";
import { useLocation, Link, useSearch } from "wouter";
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
  FormDescription,
} from "@/components/ui/form";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ArrowUpFromLine, AlertCircle, Loader2, Gift } from "lucide-react";
import { OtpDialog } from "@/components/otp-dialog";
import { apiUrl } from "@/lib/api-url";

const registerSchema = z.object({
  fullName: z.string().min(2, { message: "Full name must be at least 2 characters." }),
  email: z.string().email({ message: "Please enter a valid email address." }),
  phone: z.string().regex(/^(07|01)\d{8}$/, { message: "Please enter a valid Kenyan phone number (e.g., 0712345678)." }),
  password: z.string().min(8, { message: "Password must be at least 8 characters." }),
  refCode: z.string().optional(),
});

type RegisterValues = z.infer<typeof registerSchema>;

async function callApi(path: string, body: object, token?: string | null) {
  const res = await fetch(apiUrl(path), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error ?? "Request failed");
  return data;
}

export default function Register() {
  const [, setLocation] = useLocation();
  const search = useSearch();
  const params = new URLSearchParams(search);
  const refFromUrl = params.get("ref") || "";
  const { register, isRegistering } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [sendingOtp, setSendingOtp] = useState(false);

  const form = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      fullName: "",
      email: "",
      phone: "",
      password: "",
      refCode: refFromUrl,
    },
  });

  const sendOtp = async (phone: string, email?: string) => {
    const data = await callApi("/api/otp/send", { phone, email, reason: "Registration" });
    const ch: "whatsapp" | "email" = data.channel ?? "whatsapp";
    setOtpChannel(ch);
    setWhatsappFailed(ch === "email" ? false : !!data.whatsappFailed);
    return data as { channel?: "whatsapp" | "email" };
  };

  const onSubmit = async (values: RegisterValues) => {
    setError(null);

    // Collect enhanced fingerprint data
    const fingerprintData = {
      sw: window.screen.width,
      sh: window.screen.height,
      sd: window.screen.colorDepth,
      tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      nc: navigator.hardwareConcurrency || "unknown",
      mem: (navigator as any).deviceMemory || "unknown",
      plt: navigator.platform,
      lang: navigator.language,
      canv: (() => {
        try {
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");
          if (!ctx) return "none";
          canvas.width = 200;
          canvas.height = 50;
          ctx.textBaseline = "top";
          ctx.font = "14px 'Arial'";
          ctx.textBaseline = "alphabetic";
          ctx.fillStyle = "#f60";
          ctx.fillRect(125, 1, 62, 20);
          ctx.fillStyle = "#069";
          ctx.fillText("Zenti-Fraud-Check", 2, 15);
          ctx.fillStyle = "rgba(102, 204, 0, 0.7)";
          ctx.fillText("Zenti-Fraud-Check", 4, 17);
          return canvas.toDataURL().slice(-100); // Send just the suffix to keep it light
        } catch { return "error"; }
      })()
    };

    register({ 
      data: { 
        ...values, 
        fingerprint: JSON.stringify(fingerprintData) 
      } as any 
    }, {
      onSuccess: () => setLocation("/dashboard"),
      onError: (err: any) => setError(err.message || "Registration failed. Please try again."),
    });
  };

  return (
    <div className="min-h-[100dvh] flex flex-col justify-center items-center bg-muted/30 p-4 py-12">
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
        initial={{ opacity: 0, y: 28 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: "easeOut", delay: 0.08 }}
        className="w-full max-w-md"
      >
        <Card className="shadow-lg border-border">
          <CardHeader className="space-y-1">
            <CardTitle className="text-2xl font-bold">Create an account</CardTitle>
            <CardDescription>
              Join Zenti to start building your wealth
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
                  name="fullName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Full Name</FormLabel>
                      <FormControl>
                        <Input placeholder="John Doe" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

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
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>M-Pesa Phone Number</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <img src="https://upload.wikimedia.org/wikipedia/commons/1/15/M-PESA_LOGO-01.svg" alt="M-Pesa" className="h-4 opacity-70 grayscale" />
                          </div>
                          <Input placeholder="07XX or 01XX" className="pl-12" {...field} />
                        </div>
                      </FormControl>
                      <FormDescription>
                        Please enter your primary M-Pesa number.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Password</FormLabel>
                      <FormControl>
                        <Input placeholder="••••••••" type="password" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {refFromUrl && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-secondary/10 border border-secondary/30 text-sm">
                    <Gift className="h-4 w-4 text-secondary shrink-0" />
                    <span className="text-muted-foreground">You were invited by a friend — you'll both benefit when you deposit!</span>
                  </div>
                )}

                <div className="text-xs text-muted-foreground mt-4 leading-relaxed">
                  By registering, you agree to our <Link href="/legal/terms" className="text-primary hover:underline">Terms of Service</Link> and <Link href="/legal/privacy" className="text-primary hover:underline">Privacy Policy</Link>.
                </div>

                <Button type="submit" className="w-full h-12 text-lg font-medium mt-6" disabled={sendingOtp || isRegistering}>
                  {(sendingOtp || isRegistering) ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
                  {sendingOtp ? "Sending code…" : isRegistering ? "Creating account…" : "Create Account"}
                </Button>
              </form>
            </Form>
          </CardContent>
          <CardFooter className="flex justify-center border-t p-4">
            <div className="text-sm text-muted-foreground">
              Already have an account?{" "}
              <Link href="/login" className="text-primary font-medium hover:underline">
                Log in here
              </Link>
            </div>
          </CardFooter>
        </Card>
      </motion.div>


    </div>
  );
}
