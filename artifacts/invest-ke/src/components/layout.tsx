import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { useAuth } from "@/hooks/use-auth";
import { useGetSettings } from "@workspace/api-client-react";
import { Loader2, ShieldCheck } from "lucide-react";
import { OtpDialog } from "@/components/otp-dialog";
import { SupportChat } from "@/components/support-chat";
import { apiUrl } from "@/lib/api-url";
import { useQueryClient } from "@tanstack/react-query";

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

function VerificationWall({ phone, email }: { phone: string; email?: string }) {
  const queryClient = useQueryClient();
  const [otpOpen, setOtpOpen] = useState(false);
  const [otpChannel, setOtpChannel] = useState<"whatsapp" | "email">("whatsapp");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [wallError, setWallError] = useState<string | null>(null);

  const sendOtp = async () => {
    setSending(true);
    setWallError(null);
    try {
      const data = await callApi("/api/otp/send", { phone, email, reason: "Account Verification" });
      setOtpChannel(data.channel ?? "whatsapp");
      setSent(true);
      setOtpOpen(true);
    } catch (err: unknown) {
      setWallError(err instanceof Error ? err.message : "Failed to send code. Please try again.");
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    sendOtp();
  }, []);

  const handleVerify = async (code: string) => {
    await callApi("/api/auth/verify-account", { phone, code });
  };

  const handleVerified = () => {
    setOtpOpen(false);
    queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
  };

  return (
    <div className="flex h-[100dvh] w-full flex-col items-center justify-center bg-background p-6 text-center">
      <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
        <ShieldCheck className="h-8 w-8 text-primary" />
      </div>
      <h1 className="text-2xl font-bold tracking-tight">Verify Your Account</h1>
      <p className="mt-2 max-w-sm text-sm text-muted-foreground">
        To protect you from fraud, all accounts must be verified via WhatsApp or email before accessing the platform.
      </p>

      {sending && (
        <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          Sending verification code…
        </div>
      )}
      {wallError && <p className="mt-4 text-sm text-destructive">{wallError}</p>}
      {sent && !otpOpen && !sending && (
        <button onClick={sendOtp} className="mt-4 text-sm text-primary hover:underline">
          Resend verification code
        </button>
      )}

      <OtpDialog
        open={otpOpen}
        phone={phone}
        email={email}
        reason="Account Verification"
        channel={otpChannel}
        onVerified={handleVerified}
        onClose={() => setOtpOpen(false)}
        onResend={sendOtp}
        onVerify={handleVerify}
      />
    </div>
  );
}

interface LayoutProps {
  children: React.ReactNode;
  requireAuth?: boolean;
  requireAdmin?: boolean;
}

export function Layout({ children, requireAuth = false, requireAdmin = false }: LayoutProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const { data: settings } = useGetSettings();
  const [, setLocation] = useLocation();

  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const maintenanceMode = settings?.maintenanceMode === true;

  useEffect(() => {
    if (!isLoading) {
      if (requireAuth && !isAuthenticated) {
        setLocation("/login");
      } else if (requireAdmin && (!user || (user.role !== "admin" && user.role !== "superadmin"))) {
        setLocation("/dashboard");
      } else if (maintenanceMode && !isAdmin && !requireAdmin) {
        setLocation("/maintenance");
      }
    }
  }, [isLoading, isAuthenticated, requireAuth, requireAdmin, user, maintenanceMode, isAdmin, setLocation]);

  if (isLoading && (requireAuth || requireAdmin)) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show verification wall for authenticated but unverified users on protected pages
  if ((requireAuth || requireAdmin) && isAuthenticated && user && !(user as any).isVerified) {
    return <VerificationWall phone={(user as any).phone} email={(user as any).email} />;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col w-full bg-background">
      {maintenanceMode && isAdmin && (
        <div className="bg-amber-500 text-amber-950 text-xs text-center py-2 px-4 font-medium">
          🔧 Maintenance mode is ON — only admins can access the platform. Users see the maintenance page.
        </div>
      )}
      <Navbar />
      <main className="flex-1 flex flex-col w-full">
        {children}
      </main>
      <Footer />
      {isAuthenticated && <SupportChat />}
    </div>
  );
}
