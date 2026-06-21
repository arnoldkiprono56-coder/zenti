import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useGetPlans, useCreatePlan, useUpdatePlan, useDeletePlan, getGetPlansQueryKey } from "@workspace/api-client-react";
import { formatKES } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Plus, Pencil, Trash2 } from "lucide-react";

const emptyForm = { name: "", description: "", minDeposit: "", dailyReturnPercent: "", durationDays: "" };

export default function AdminPlans() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: plans = [], isLoading } = useGetPlans();
  const [isOpen, setIsOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  function invalidatePlans() { queryClient.invalidateQueries({ queryKey: getGetPlansQueryKey() }); }

  const createMutation = useCreatePlan({
    mutation: {
      onSuccess: () => { toast({ title: "Plan created" }); setIsOpen(false); invalidatePlans(); },
      onError: () => toast({ title: "Error creating plan", variant: "destructive" }),
    }
  });

  const updateMutation = useUpdatePlan({
    mutation: {
      onSuccess: () => { toast({ title: "Plan updated" }); setIsOpen(false); invalidatePlans(); },
      onError: () => toast({ title: "Error updating plan", variant: "destructive" }),
    }
  });

  const deleteMutation = useDeletePlan({
    mutation: {
      onSuccess: () => { toast({ title: "Plan deleted" }); invalidatePlans(); },
      onError: () => toast({ title: "Error deleting plan", variant: "destructive" }),
    }
  });

  function openCreate() { setEditId(null); setForm(emptyForm); setIsOpen(true); }
  function openEdit(p: typeof plans[0]) {
    setEditId(p.id);
    setForm({ name: p.name, description: p.description ?? "", minDeposit: String(p.minDeposit), dailyReturnPercent: String(p.dailyReturnPercent), durationDays: String(p.durationDays) });
    setIsOpen(true);
  }

  function handleSave() {
    const payload = { name: form.name, description: form.description, minDeposit: parseFloat(form.minDeposit), dailyReturnPercent: parseFloat(form.dailyReturnPercent), durationDays: parseInt(form.durationDays) };
    if (editId) updateMutation.mutate({ id: editId, data: payload });
    else createMutation.mutate({ data: { ...payload, isActive: true } });
  }

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-5xl">
        <div className="flex items-center justify-between mb-6">
          <div><h1 className="text-2xl font-bold">Investment Plans</h1><p className="text-muted-foreground text-sm mt-1">{plans.length} plans configured</p></div>
          <Button onClick={openCreate}><Plus className="mr-2 h-4 w-4" />New Plan</Button>
        </div>

        {isLoading ? <p className="text-center text-muted-foreground py-8">Loading...</p> : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {plans.map(plan => (
              <Card key={plan.id} className={`${!plan.isActive ? "opacity-60" : ""}`}>
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{plan.name}</CardTitle>
                      {plan.isInternship && <Badge variant="secondary" className="text-xs mt-1">Internship Package</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(plan)}><Pencil className="h-3.5 w-3.5" /></Button>
                      {!plan.isInternship && <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => deleteMutation.mutate({ id: plan.id })}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="text-sm space-y-1.5">
                  {plan.description && <p className="text-muted-foreground text-xs">{plan.description}</p>}
                  <div className="flex justify-between"><span className="text-muted-foreground">Plan Cost</span><span className="font-semibold">{formatKES(plan.minDeposit)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Daily Return</span><span className="font-bold text-green-600">{plan.dailyReturnPercent}%</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Duration</span><span>{plan.durationDays} days</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Total Earnings</span><span className="font-semibold text-primary">{formatKES(plan.minDeposit * plan.dailyReturnPercent / 100 * plan.durationDays)}</span></div>
                  <div className="flex justify-between items-center pt-1"><span className="text-muted-foreground">Status</span><Badge variant={plan.isActive ? "default" : "secondary"}>{plan.isActive ? "Active" : "Inactive"}</Badge></div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>{editId ? "Edit Plan" : "Create New Plan"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1"><Label>Plan Name</Label><Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="space-y-1"><Label>Description</Label><Textarea rows={2} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1"><Label>Plan Cost (KES)</Label><Input type="number" value={form.minDeposit} onChange={e => setForm(f => ({ ...f, minDeposit: e.target.value }))} /></div>
              <div className="space-y-1 col-span-1" />
              <div className="space-y-1"><Label>Daily Return (%)</Label><Input type="number" step="0.1" value={form.dailyReturnPercent} onChange={e => setForm(f => ({ ...f, dailyReturnPercent: e.target.value }))} /></div>
              <div className="space-y-1"><Label>Duration (days)</Label><Input type="number" value={form.durationDays} onChange={e => setForm(f => ({ ...f, durationDays: e.target.value }))} /></div>
            </div>
            {form.minDeposit && form.dailyReturnPercent && form.durationDays && (
              <div className="bg-muted/50 rounded-lg p-3 text-sm space-y-1">
                <p className="font-medium text-xs text-muted-foreground mb-1">Preview</p>
                <div className="flex justify-between"><span>Plan Cost</span><span className="font-semibold">{formatKES(parseFloat(form.minDeposit))}</span></div>
                <div className="flex justify-between"><span>Daily Earning</span><span className="font-semibold text-green-600">{formatKES(parseFloat(form.minDeposit) * parseFloat(form.dailyReturnPercent) / 100)}</span></div>
                <div className="flex justify-between"><span>Total over {form.durationDays} days</span><span className="font-bold text-primary">{formatKES(parseFloat(form.minDeposit) * parseFloat(form.dailyReturnPercent) / 100 * parseInt(form.durationDays))}</span></div>
              </div>
            )}
            <Button className="w-full" onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              {editId ? (updateMutation.isPending ? "Saving..." : "Save Changes") : (createMutation.isPending ? "Creating..." : "Create Plan")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
