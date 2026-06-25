import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiUrl } from "@/lib/api-url";
import { useAuth } from "@/hooks/use-auth";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ShieldX, CheckCircle2, XCircle, Clock, Loader2, AlertCircle, FileText } from "lucide-react";
import { format } from "date-fns";

interface Appeal {
  id: number;
  userId: number;
  message: string;
  status: "pending" | "approved" | "rejected";
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
  userName: string;
  userEmail: string;
  bannedReason: string | null;
  bannedAt: string | null;
}

const STATUS_BADGE: Record<string, { label: string; variant: "default" | "destructive" | "secondary" | "outline" }> = {
  pending: { label: "Pending", variant: "secondary" },
  approved: { label: "Approved", variant: "default" },
  rejected: { label: "Rejected", variant: "destructive" },
};

function AppealsDashboard() {
  const { token } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selected, setSelected] = useState<Appeal | null>(null);
  const [adminNote, setAdminNote] = useState("");
  const [resolveError, setResolveError] = useState<string | null>(null);

  const { data: appeals = [], isLoading } = useQuery<Appeal[]>({
    queryKey: ["admin-appeals", statusFilter],
    queryFn: async () => {
      const params = statusFilter !== "all" ? `?status=${statusFilter}` : "";
      const res = await fetch(apiUrl(`/api/appeals${params}`), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Failed to load appeals");
      return res.json();
    },
  });

  const resolve = useMutation({
    mutationFn: async ({ id, action }: { id: number; action: "approve" | "reject" }) => {
      const res = await fetch(apiUrl(`/api/appeals/${id}/resolve`), {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ action, adminNote: adminNote.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to resolve appeal");
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-appeals"] });
      setSelected(null);
      setAdminNote("");
      setResolveError(null);
    },
    onError: (err: Error) => setResolveError(err.message),
  });

  const pending = appeals.filter(a => a.status === "pending").length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldX className="h-6 w-6 text-destructive" />
            Ban Appeals
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Review and resolve user ban appeals
            {pending > 0 && (
              <span className="ml-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                {pending} pending
              </span>
            )}
          </p>
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : appeals.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-12 text-center">
          <FileText className="mx-auto h-10 w-10 text-muted-foreground mb-3" />
          <p className="text-sm text-muted-foreground">No appeals found</p>
        </div>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">#</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">User</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground hidden md:table-cell">Ban Reason</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Submitted</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Status</th>
                <th className="text-left px-4 py-3 font-semibold text-muted-foreground">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {appeals.map((appeal) => {
                const badge = STATUS_BADGE[appeal.status] ?? STATUS_BADGE["pending"];
                return (
                  <tr key={appeal.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{appeal.id}</td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{appeal.userName}</div>
                      <div className="text-xs text-muted-foreground">{appeal.userEmail}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <p className="text-xs text-muted-foreground line-clamp-2 max-w-xs">
                        {appeal.bannedReason ?? "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">
                      {format(new Date(appeal.createdAt), "dd MMM yyyy HH:mm")}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={badge.variant}>
                        {appeal.status === "pending" && <Clock className="mr-1 h-3 w-3" />}
                        {appeal.status === "approved" && <CheckCircle2 className="mr-1 h-3 w-3" />}
                        {appeal.status === "rejected" && <XCircle className="mr-1 h-3 w-3" />}
                        {badge.label}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => { setSelected(appeal); setAdminNote(appeal.adminNote ?? ""); setResolveError(null); }}
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Detail/Resolve dialog */}
      <Dialog open={!!selected} onOpenChange={(o) => { if (!o) { setSelected(null); setAdminNote(""); setResolveError(null); } }}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle>Appeal #{selected.id}</DialogTitle>
                <DialogDescription>
                  Submitted by <strong>{selected.userName}</strong> ({selected.userEmail})
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 mt-2">
                {/* Ban info */}
                <div className="rounded-lg bg-destructive/5 border border-destructive/20 p-3">
                  <p className="text-xs font-semibold text-destructive uppercase tracking-wide mb-1">Ban Reason</p>
                  <p className="text-sm">{selected.bannedReason ?? "No reason recorded"}</p>
                  {selected.bannedAt && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Banned: {format(new Date(selected.bannedAt), "dd MMM yyyy HH:mm")}
                    </p>
                  )}
                </div>

                {/* Appeal message */}
                <div className="rounded-lg bg-muted/40 border border-border p-3">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">User's Appeal</p>
                  <p className="text-sm whitespace-pre-wrap">{selected.message}</p>
                </div>

                {selected.status !== "pending" && (
                  <div className="rounded-lg bg-muted/40 border border-border p-3">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Resolution</p>
                    <Badge variant={STATUS_BADGE[selected.status]?.variant ?? "secondary"}>
                      {selected.status}
                    </Badge>
                    {selected.adminNote && (
                      <p className="text-sm mt-2">{selected.adminNote}</p>
                    )}
                    {selected.resolvedAt && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Resolved: {format(new Date(selected.resolvedAt), "dd MMM yyyy HH:mm")}
                      </p>
                    )}
                  </div>
                )}

                {selected.status === "pending" && (
                  <>
                    <div className="space-y-1.5">
                      <Label htmlFor="admin-note">Admin Note (optional — sent to user)</Label>
                      <Textarea
                        id="admin-note"
                        placeholder="Add a note explaining your decision..."
                        rows={3}
                        value={adminNote}
                        onChange={(e) => setAdminNote(e.target.value)}
                      />
                    </div>

                    {resolveError && (
                      <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{resolveError}</AlertDescription>
                      </Alert>
                    )}

                    <div className="flex gap-2">
                      <Button
                        variant="destructive"
                        className="flex-1"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: selected.id, action: "reject" })}
                      >
                        {resolve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                        Reject
                      </Button>
                      <Button
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={resolve.isPending}
                        onClick={() => resolve.mutate({ id: selected.id, action: "approve" })}
                      >
                        {resolve.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                        Approve & Unban
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AppealsDashboard;
