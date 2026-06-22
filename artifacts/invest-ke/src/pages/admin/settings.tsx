import { useState, useEffect } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useGetSettings, useUpdateSettings, getGetSettingsQueryKey } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Settings, ShieldAlert, DollarSign, Clock, Key, Plus, Trash2, Info } from "lucide-react";
import { apiUrl } from "@/lib/api-url";

function getToken() { return localStorage.getItem("investke_token") ?? ""; }

interface ConfigEntry { key: string; value: string; envSet?: boolean }

export default function AdminSettings() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: settings, isLoading } = useGetSettings();
  const [form, setForm] = useState({
    companyName: "",
    supportEmail: "",
    contactPhone: "",
    companyAddress: "",
    maintenanceMode: false,
    maintenanceBannerMessage: "",
    maintenanceEta: "",
    withdrawalFeePercent: 10,
    dailyWithdrawalLimitKES: 50000,
    maxActiveInvestments: 5,
    withdrawalCooldownHours: 24,
    minDepositHoldingHours: 24,
  });

  const [configEntries, setConfigEntries] = useState<ConfigEntry[]>([]);
  const [configLoading, setConfigLoading] = useState(false);
  const [configSaving, setConfigSaving] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm({
        companyName: settings.companyName ?? "",
        supportEmail: settings.supportEmail ?? "",
        contactPhone: settings.contactPhone ?? "",
        companyAddress: settings.companyAddress ?? "",
        maintenanceMode: settings.maintenanceMode ?? false,
        maintenanceBannerMessage: (settings as any).maintenanceBannerMessage ?? "",
        maintenanceEta: (settings as any).maintenanceEta ?? "",
        withdrawalFeePercent: (settings as any).withdrawalFeePercent ?? 10,
        dailyWithdrawalLimitKES: (settings as any).dailyWithdrawalLimitKES ?? 50000,
        maxActiveInvestments: (settings as any).maxActiveInvestments ?? 5,
        withdrawalCooldownHours: (settings as any).withdrawalCooldownHours ?? 24,
        minDepositHoldingHours: (settings as any).minDepositHoldingHours ?? 24,
      });
    }
  }, [settings]);

  useEffect(() => {
    setConfigLoading(true);
    fetch(apiUrl("/api/admin/config-keys"), { headers: { Authorization: `Bearer ${getToken()}` } })
      .then(r => r.json())
      .then((data: { keys: Record<string, { dbValue: string; envSet: boolean }> }) => {
        const entries = Object.entries(data.keys ?? {}).map(([key, v]) => ({
          key,
          value: v.dbValue,
          envSet: v.envSet,
        }));
        setConfigEntries(entries.length ? entries : []);
      })
      .catch(() => {})
      .finally(() => setConfigLoading(false));
  }, []);

  const updateMutation = useUpdateSettings({
    mutation: {
      onSuccess: () => {
        toast({ title: "Settings saved successfully" });
        queryClient.invalidateQueries({ queryKey: getGetSettingsQueryKey() });
      },
      onError: () => toast({ title: "Error saving settings", variant: "destructive" }),
    }
  });

  const addConfigEntry = () => setConfigEntries(e => [...e, { key: "", value: "" }]);
  const removeConfigEntry = (i: number) => setConfigEntries(e => e.filter((_, idx) => idx !== i));
  const updateConfigEntry = (i: number, field: "key" | "value", val: string) =>
    setConfigEntries(e => e.map((entry, idx) => idx === i ? { ...entry, [field]: val } : entry));

  const saveConfigKeys = async () => {
    setConfigSaving(true);
    try {
      const keys: Record<string, string> = {};
      for (const { key, value } of configEntries) {
        if (key.trim()) keys[key.trim()] = value;
      }
      const res = await fetch(apiUrl("/api/admin/config-keys"), {
        method: "PUT",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ keys }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      toast({ title: `Saved ${data.count} config key(s)` });
    } catch (err: any) {
      toast({ title: err.message || "Failed to save config keys", variant: "destructive" });
    } finally {
      setConfigSaving(false);
    }
  };

  if (isLoading) return <Layout requireAdmin><div className="container py-12 text-center text-muted-foreground">Loading settings...</div></Layout>;

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold flex items-center gap-2"><Settings className="h-5 w-5" />Platform Settings</h1>
          <p className="text-muted-foreground text-sm mt-1">Configure platform-wide settings and limits</p>
        </div>

        <div className="space-y-6">
          {/* Company */}
          <Card>
            <CardHeader><CardTitle className="text-base">Company Information</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1"><Label>Company Name</Label><Input value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Support Email</Label><Input type="email" value={form.supportEmail} onChange={e => setForm(f => ({ ...f, supportEmail: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Contact Phone</Label><Input value={form.contactPhone} onChange={e => setForm(f => ({ ...f, contactPhone: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Company Address</Label><Input value={form.companyAddress} onChange={e => setForm(f => ({ ...f, companyAddress: e.target.value }))} /></div>
            </CardContent>
          </Card>

          {/* Maintenance */}
          <Card className={form.maintenanceMode ? "border-amber-500/50 bg-amber-50/30 dark:bg-amber-950/10" : ""}>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-amber-500" />
                Maintenance Mode
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">Enable Maintenance Mode</p>
                  <p className="text-xs text-muted-foreground">Users are shown a maintenance page; only admins can access the platform</p>
                </div>
                <Switch checked={form.maintenanceMode} onCheckedChange={v => setForm(f => ({ ...f, maintenanceMode: v }))} />
              </div>
              <div className="space-y-1">
                <Label>Maintenance Message</Label>
                <Textarea
                  rows={2}
                  placeholder="We are performing scheduled maintenance. We'll be back shortly."
                  value={form.maintenanceBannerMessage}
                  onChange={e => setForm(f => ({ ...f, maintenanceBannerMessage: e.target.value }))}
                />
              </div>
              <div className="space-y-1">
                <Label>Estimated Return Time <span className="text-muted-foreground text-xs">(optional)</span></Label>
                <Input
                  placeholder="e.g. Saturday 20 June 2026 at 6:00 PM EAT"
                  value={form.maintenanceEta}
                  onChange={e => setForm(f => ({ ...f, maintenanceEta: e.target.value }))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Withdrawal Limits */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-green-600" />
                Withdrawal Limits & Fees
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Withdrawal Fee (%)</Label>
                  <Input
                    type="number" min={0} max={50} step={0.1}
                    value={form.withdrawalFeePercent}
                    onChange={e => setForm(f => ({ ...f, withdrawalFeePercent: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Fee charged on every withdrawal</p>
                </div>
                <div className="space-y-1">
                  <Label>Daily Withdrawal Limit (KES)</Label>
                  <Input
                    type="number" min={0}
                    value={form.dailyWithdrawalLimitKES}
                    onChange={e => setForm(f => ({ ...f, dailyWithdrawalLimitKES: parseFloat(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Max per user per day (0 = unlimited)</p>
                </div>
              </div>
              <div className="bg-muted/50 rounded-lg p-3 text-xs text-muted-foreground">
                <strong>Fee example:</strong> User withdraws KES 1,000 → Fee: KES {(1000 * form.withdrawalFeePercent / 100).toFixed(2)} → Net received: KES {(1000 - 1000 * form.withdrawalFeePercent / 100).toFixed(2)}
              </div>
            </CardContent>
          </Card>

          {/* User Restrictions */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-blue-600" />
                User Activity Restrictions
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Withdrawal Cooldown (hours)</Label>
                  <Input
                    type="number" min={0}
                    value={form.withdrawalCooldownHours}
                    onChange={e => setForm(f => ({ ...f, withdrawalCooldownHours: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Min hours between withdrawals (0 = no cooldown)</p>
                </div>
                <div className="space-y-1">
                  <Label>Deposit Holding Period (hours)</Label>
                  <Input
                    type="number" min={0}
                    value={form.minDepositHoldingHours}
                    onChange={e => setForm(f => ({ ...f, minDepositHoldingHours: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-muted-foreground">Hours after deposit before withdrawal allowed</p>
                </div>
              </div>
              <div className="space-y-1">
                <Label>Max Active Investments per User</Label>
                <Input
                  type="number" min={1} max={50}
                  value={form.maxActiveInvestments}
                  onChange={e => setForm(f => ({ ...f, maxActiveInvestments: parseInt(e.target.value) || 1 }))}
                />
                <p className="text-xs text-muted-foreground">Maximum number of concurrent active investments per user</p>
              </div>
            </CardContent>
          </Card>

          <Button className="w-full" size="lg"
            disabled={updateMutation.isPending}
            onClick={() => updateMutation.mutate({ data: form as any })}>
            {updateMutation.isPending ? "Saving..." : "Save All Settings"}
          </Button>

          {/* Config Keys */}
          <Card className="border-dashed">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Key className="h-4 w-4 text-purple-600" />
                Environment Config Keys
              </CardTitle>
              <div className="flex items-start gap-2 mt-1 p-3 rounded-lg bg-blue-50 dark:bg-blue-950/20 border border-blue-200 dark:border-blue-800 text-xs text-blue-700 dark:text-blue-300">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                <span>
                  Store runtime config here (e.g. <code className="font-mono">BOT_BASE_URL</code>, <code className="font-mono">BOT_SHARED_SECRET</code>).
                  Keys set as server environment variables always take priority over DB values — no restart needed.
                </span>
              </div>
            </CardHeader>
            <CardContent className="space-y-3">
              {configLoading ? (
                <p className="text-sm text-muted-foreground text-center py-4">Loading…</p>
              ) : configEntries.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No config keys yet. Add your first key below.</p>
              ) : (
                <div className="space-y-2">
                  <div className="grid grid-cols-[1fr_1fr_auto] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>KEY</span><span>VALUE</span><span />
                  </div>
                  {configEntries.map((entry, i) => (
                    <div key={i} className="grid grid-cols-[1fr_1fr_auto] gap-2 items-center">
                      <div className="relative">
                        <Input
                          className="font-mono text-xs uppercase"
                          placeholder="BOT_BASE_URL"
                          value={entry.key}
                          onChange={e => updateConfigEntry(i, "key", e.target.value)}
                        />
                        {entry.envSet && (
                          <Badge variant="secondary" className="absolute -top-2 -right-2 text-[9px] px-1 py-0 h-4 bg-green-100 text-green-700">ENV</Badge>
                        )}
                      </div>
                      <Input
                        type="password"
                        className="font-mono text-xs"
                        placeholder="value"
                        value={entry.value}
                        onChange={e => updateConfigEntry(i, "value", e.target.value)}
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-destructive hover:text-destructive" onClick={() => removeConfigEntry(i)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              {configEntries.some(e => e.envSet) && (
                <p className="text-xs text-green-700 dark:text-green-400 flex items-center gap-1">
                  <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
                  <span><strong>ENV</strong> badge = this key is set as a server environment variable and will take priority over the DB value.</span>
                </p>
              )}

              <Button variant="outline" size="sm" className="w-full border-dashed" onClick={addConfigEntry}>
                <Plus className="h-4 w-4 mr-2" /> Add Key
              </Button>

              <Button className="w-full" disabled={configSaving} onClick={saveConfigKeys}>
                {configSaving ? "Saving…" : "Save Config Keys"}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
