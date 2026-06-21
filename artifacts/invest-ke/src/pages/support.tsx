import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useSubmitSupportRequest, useGetSettings } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { Mail, Phone, MapPin, CheckCircle2, AlertTriangle } from "lucide-react";

const CATEGORIES = [
  { value: "account_issue", label: "Account Issue" },
  { value: "investment_query", label: "Investment Query" },
  { value: "withdrawal_issue", label: "Withdrawal Issue" },
  { value: "deposit_issue", label: "Deposit Issue" },
  { value: "technical", label: "Technical Problem" },
  { value: "feature_request", label: "Feature Request" },
  { value: "general", label: "General Enquiry" },
  { value: "other", label: "Other" },
];

const PRIORITIES = [
  { value: "normal", label: "Normal — general questions or feedback" },
  { value: "high", label: "High — account or money issue affecting me now" },
  { value: "urgent", label: "Urgent — funds at risk or account locked" },
];

export default function Support() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { data: settings } = useGetSettings();
  const [submitted, setSubmitted] = useState(false);
  const [form, setForm] = useState({
    name: user?.fullName ?? "",
    email: user?.email ?? "",
    phone: (user as any)?.phone ?? "",
    subject: "",
    category: "general",
    priority: "normal",
    message: "",
  });

  const submitMutation = useSubmitSupportRequest({
    mutation: {
      onSuccess: () => {
        setSubmitted(true);
        toast({ title: "Request submitted!", description: "We will get back to you shortly." });
      },
      onError: () => {
        toast({ title: "Error", description: "Could not submit your request. Please try again.", variant: "destructive" });
      }
    }
  });

  const isValid = form.name && form.email && form.subject && form.message && form.category;

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Contact & Support</h1>
          <p className="text-muted-foreground mt-1">Get help from our team. We are here to assist you.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* Contact Info */}
          <div className="space-y-4">
            <Card>
              <CardContent className="p-5 space-y-4">
                <h3 className="font-semibold">Contact Information</h3>
                {[
                  { icon: Mail, label: "Email", value: settings?.supportEmail ?? "support@investke.co.ke", href: `mailto:${settings?.supportEmail ?? "support@investke.co.ke"}` },
                  { icon: Phone, label: "Phone", value: settings?.contactPhone ?? "+254 700 000 000", href: `tel:${settings?.contactPhone}` },
                  { icon: MapPin, label: "Address", value: settings?.companyAddress ?? "Nairobi, Kenya", href: undefined },
                ].map(({ icon: Icon, label, value, href }) => (
                  <div key={label} className="flex items-start gap-3">
                    <div className="bg-primary/10 p-2 rounded-lg"><Icon className="h-4 w-4 text-primary" /></div>
                    <div>
                      <p className="text-xs text-muted-foreground">{label}</p>
                      {href ? <a href={href} className="text-sm font-medium hover:text-primary">{value}</a> : <p className="text-sm font-medium">{value}</p>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-5">
                <h3 className="font-semibold mb-2 text-sm">Response Times</h3>
                <div className="space-y-2 text-xs text-muted-foreground">
                  <p>Normal — within 24–48 hours</p>
                  <p>High priority — same business day</p>
                  <p>Urgent — within 2–4 hours</p>
                  <p>Business hours: Mon–Fri, 8am–6pm EAT</p>
                </div>
              </CardContent>
            </Card>

            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/10">
              <CardContent className="p-4">
                <div className="flex gap-2 items-start">
                  <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-semibold text-amber-700 dark:text-amber-400">For faster help</p>
                    <p className="text-xs text-muted-foreground mt-1">Select the correct category and priority so we can route your request to the right team immediately.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Form */}
          <div className="md:col-span-2">
            <Card>
              <CardHeader><CardTitle className="text-base">Submit a Support Request</CardTitle></CardHeader>
              <CardContent>
                {submitted ? (
                  <div className="text-center py-12">
                    <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h3 className="font-semibold text-lg">Request Submitted</h3>
                    <p className="text-muted-foreground mt-2 text-sm">We have received your request and will respond to <strong>{form.email}</strong> shortly.</p>
                    {form.priority === "urgent" && (
                      <p className="text-amber-600 text-xs mt-3">Your urgent request has been flagged for priority handling.</p>
                    )}
                    <Button variant="outline" className="mt-6" onClick={() => { setSubmitted(false); setForm(f => ({ ...f, subject: "", message: "" })); }}>Submit Another Request</Button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Full Name</Label>
                        <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div className="space-y-1">
                        <Label>Email Address</Label>
                        <Input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Phone Number <span className="text-muted-foreground text-xs">(optional)</span></Label>
                      <Input placeholder="07XXXXXXXX" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Category</Label>
                        <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map(c => <SelectItem key={c.value} value={c.value}>{c.label}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1">
                        <Label>Priority</Label>
                        <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v }))}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {PRIORITIES.map(p => (
                              <SelectItem key={p.value} value={p.value}>
                                <span className="font-medium capitalize">{p.value}</span>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          {PRIORITIES.find(p => p.value === form.priority)?.label.split(" — ")[1]}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-1">
                      <Label>Subject</Label>
                      <Input placeholder="Brief summary of your issue" value={form.subject} onChange={e => setForm(f => ({ ...f, subject: e.target.value }))} />
                    </div>

                    <div className="space-y-1">
                      <Label>Message</Label>
                      <Textarea
                        placeholder="Describe your issue in detail. Include transaction IDs, amounts, or dates where relevant..."
                        rows={5}
                        value={form.message}
                        onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground text-right">{form.message.length}/5000</p>
                    </div>

                    <Button
                      className="w-full"
                      disabled={submitMutation.isPending || !isValid}
                      onClick={() => submitMutation.mutate({ data: form as any })}>
                      {submitMutation.isPending ? "Submitting..." : "Submit Request"}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </Layout>
  );
}
