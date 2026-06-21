import { useGetSettings } from "@workspace/api-client-react";
import { useAuth } from "@/hooks/use-auth";
import { useLocation } from "wouter";
import { useEffect } from "react";
import { Wrench, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function MaintenancePage() {
  const { data: settings } = useGetSettings();
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (settings && !settings.maintenanceMode) {
      setLocation("/");
    }
  }, [settings, setLocation]);

  const message = settings?.maintenanceBannerMessage ?? "We are performing scheduled maintenance. We'll be back shortly.";
  const eta = (settings as any)?.maintenanceEta as string | null | undefined;

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 via-blue-950 to-slate-900 p-6 text-center">
      <div className="max-w-lg w-full">
        <div className="mb-8 flex items-center justify-center">
          <div className="relative">
            <div className="bg-blue-500/20 rounded-full p-8 ring-4 ring-blue-500/10">
              <Wrench className="h-16 w-16 text-blue-400 animate-pulse" />
            </div>
            <div className="absolute -top-2 -right-2 bg-amber-400 rounded-full p-2">
              <Clock className="h-5 w-5 text-amber-900" />
            </div>
          </div>
        </div>

        <div className="mb-2 flex items-center justify-center gap-2">
          <div className="bg-primary text-primary-foreground px-3 py-1 rounded text-lg font-bold tracking-tight">
            Zenti
          </div>
        </div>
        <h1 className="text-3xl font-bold text-white mt-4 mb-3">Under Maintenance</h1>
        <p className="text-blue-200 text-base leading-relaxed mb-6">{message}</p>

        {eta && (
          <div className="bg-white/10 border border-white/20 rounded-xl px-6 py-4 mb-6 inline-block">
            <p className="text-xs text-blue-300 uppercase tracking-widest mb-1">Estimated Return</p>
            <p className="text-white font-semibold text-lg">{eta}</p>
          </div>
        )}

        <div className="bg-white/5 border border-white/10 rounded-xl p-5 mb-8 text-left space-y-2">
          <p className="text-blue-300 text-xs font-semibold uppercase tracking-widest mb-3">What this means</p>
          <div className="flex items-start gap-3 text-sm text-blue-100">
            <span className="text-green-400 mt-0.5">✓</span>
            <span>Your funds and investments are safe — maintenance does not affect balances</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-blue-100">
            <span className="text-green-400 mt-0.5">✓</span>
            <span>Daily earnings continue to accumulate during this period</span>
          </div>
          <div className="flex items-start gap-3 text-sm text-blue-100">
            <span className="text-amber-400 mt-0.5">⏳</span>
            <span>Deposits, withdrawals, and new investments are temporarily paused</span>
          </div>
        </div>

        {(user?.role === "admin" || user?.role === "superadmin") && (
          <Button
            variant="outline"
            className="mb-4 border-white/30 text-white hover:bg-white/10"
            onClick={() => setLocation("/admin")}
          >
            <ArrowLeft className="h-4 w-4 mr-2" /> Go to Admin Dashboard
          </Button>
        )}

        <p className="text-blue-400 text-xs mt-4">
          Questions? Contact us at{" "}
          <a href={`mailto:${settings?.supportEmail ?? "support@investke.co.ke"}`} className="underline hover:text-white">
            {settings?.supportEmail ?? "support@investke.co.ke"}
          </a>
        </p>
      </div>
    </div>
  );
}
