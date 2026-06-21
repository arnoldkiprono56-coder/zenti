import { useState } from "react";
import { Layout } from "@/components/layout";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAdminGetUsers, useAdminUpdateUser, getAdminGetUsersQueryKey } from "@workspace/api-client-react";
import { formatKES, formatDate } from "@/lib/format";
import { useToast } from "@/hooks/use-toast";
import { useQueryClient } from "@tanstack/react-query";
import { Search, ChevronLeft, ChevronRight } from "lucide-react";

const statusBadge: Record<string, string> = {
  active: "bg-green-100 text-green-800",
  suspended: "bg-yellow-100 text-yellow-800",
  banned: "bg-red-100 text-red-800",
};

export default function AdminUsers() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selectedUser, setSelectedUser] = useState<{ id: number; fullName: string; role: string; status: string } | null>(null);
  const [editStatus, setEditStatus] = useState("");
  const [editRole, setEditRole] = useState("");

  const { data, isLoading } = useAdminGetUsers({
    page,
    search: search || undefined,
    status: statusFilter === "all" ? undefined : statusFilter as "active" | "suspended" | "banned",
  });

  const updateMutation = useAdminUpdateUser({
    mutation: {
      onSuccess: () => {
        toast({ title: "User updated successfully" });
        setSelectedUser(null);
        queryClient.invalidateQueries({ queryKey: getAdminGetUsersQueryKey() });
      },
      onError: () => toast({ title: "Error updating user", variant: "destructive" }),
    }
  });

  const usersData = data as unknown as { data: Array<{id:number;fullName:string;email:string;phone:string;balance:number|null;status:string;role:string;createdAt:unknown}>; total: number } | undefined;
  const users = usersData?.data ?? [];
  const total = usersData?.total ?? 0;
  const totalPages = Math.ceil(total / 20);

  return (
    <Layout requireAdmin>
      <div className="container mx-auto px-4 py-8 max-w-6xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">User Management</h1>
          <p className="text-muted-foreground text-sm mt-1">{total} total users</p>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input className="pl-9" placeholder="Search name, email, phone..." value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && (setSearch(searchInput), setPage(1))} />
              </div>
              <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={() => { setSearch(searchInput); setPage(1); }}>Search</Button>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead><tr className="border-b text-muted-foreground text-xs">
                    <th className="pb-2 text-left">User</th>
                    <th className="pb-2 text-left">Phone</th>
                    <th className="pb-2 text-left">Balance</th>
                    <th className="pb-2 text-left">Status</th>
                    <th className="pb-2 text-left">Role</th>
                    <th className="pb-2 text-left">Joined</th>
                    <th className="pb-2"></th>
                  </tr></thead>
                  <tbody className="divide-y">
                    {users.map(u => (
                      <tr key={u.id} className="hover:bg-muted/30">
                        <td className="py-3"><p className="font-medium">{u.fullName}</p><p className="text-xs text-muted-foreground">{u.email}</p></td>
                        <td className="py-3 text-muted-foreground">{u.phone}</td>
                        <td className="py-3 font-medium">{formatKES(u.balance ?? 0)}</td>
                        <td className="py-3"><span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge[u.status] ?? ""}`}>{u.status}</span></td>
                        <td className="py-3"><Badge variant="outline" className="text-xs">{u.role}</Badge></td>
                        <td className="py-3 text-xs text-muted-foreground">{formatDate(String(u.createdAt))}</td>
                        <td className="py-3">
                          <Button variant="ghost" size="sm" onClick={() => { setSelectedUser(u); setEditStatus(u.status); setEditRole(u.role); }}>Edit</Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <p className="text-sm text-muted-foreground">Page {page} of {totalPages}</p>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
                  <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={!!selectedUser} onOpenChange={open => !open && setSelectedUser(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Edit User — {selectedUser?.fullName}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Status</label>
              <Select value={editStatus} onValueChange={setEditStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="suspended">Suspended</SelectItem>
                  <SelectItem value="banned">Banned</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">User</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button className="w-full" disabled={updateMutation.isPending}
              onClick={() => selectedUser && updateMutation.mutate({ id: selectedUser.id, data: { status: editStatus as "active" | "suspended" | "banned", role: editRole as "user" | "admin" } })}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Layout>
  );
}
