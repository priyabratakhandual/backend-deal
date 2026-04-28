import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export default function Users() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => { try { setRows((await api.get("/auth/users")).data); } catch {} })(); }, []);
  return (
    <div className="space-y-5" data-testid="users-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-sm text-muted-foreground">Role assignments across the workspace</p>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="data-table w-full text-sm">
          <thead><tr>
            <th className="text-left px-4 py-3">Name</th>
            <th className="text-left px-4 py-3">Email</th>
            <th className="text-left px-4 py-3">Role</th>
            <th className="text-left px-4 py-3">Created</th>
          </tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id}>
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3">{u.email}</td>
                <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{u.role.replace("_", " ")}</Badge></td>
                <td className="px-4 py-3 text-xs text-muted-foreground">{u.created_at?.slice(0,10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
