import React, { useEffect, useMemo, useState } from "react";
import api from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Download, Search } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

export default function Dealers() {
  const [rows, setRows] = useState([]);
  const [q, setQ] = useState("");
  const [region, setRegion] = useState("all");
  const [tier, setTier] = useState("all");
  const [type, setType] = useState("all");
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = ["admin", "business_user", "data_entry"].includes(user?.role);

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/dealers");
      setRows(data);
    })();
  }, []);

  const regions = useMemo(() => Array.from(new Set(rows.map(r => r.region).filter(Boolean))), [rows]);
  const tiers = useMemo(() => Array.from(new Set(rows.map(r => r.tier).filter(Boolean))), [rows]);

  const filtered = rows.filter(r =>
    (q === "" || (r.dealer_name + r.dealer_code + r.city).toLowerCase().includes(q.toLowerCase())) &&
    (region === "all" || r.region === region) &&
    (tier === "all" || r.tier === tier) &&
    (type === "all" || r.type === type)
  );

  const exportXlsx = async () => {
    const res = await api.get("/export/dealers", { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a");
    a.href = url; a.download = "dealers_export.xlsx"; a.click();
  };

  return (
    <div className="space-y-5" data-testid="dealers-page">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dealers</h1>
          <p className="text-sm text-muted-foreground">{filtered.length} dealers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportXlsx} data-testid="export-dealers-btn">
            <Download className="w-4 h-4 mr-2" /> Export Excel
          </Button>
          {canEdit && (
            <Button className="bg-[#0F4C81] hover:bg-[#0C3D67]" onClick={() => nav("/dealers/new")} data-testid="add-dealer-btn">
              <Plus className="w-4 h-4 mr-2" /> Add Dealer
            </Button>
          )}
        </div>
      </div>

      <Card className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
          <div className="md:col-span-2 relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input data-testid="dealer-search" placeholder="Search by name, code, city..." className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <Select value={region} onValueChange={setRegion}>
            <SelectTrigger data-testid="filter-region"><SelectValue placeholder="Region" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {regions.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={tier} onValueChange={setTier}>
            <SelectTrigger data-testid="filter-tier"><SelectValue placeholder="Tier" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Tiers</SelectItem>
              {tiers.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={type} onValueChange={setType}>
            <SelectTrigger data-testid="filter-type"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="group">Group</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </Card>

      <Card className="p-0 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead>
              <tr>
                <th className="text-left px-4 py-3">Dealer</th>
                <th className="text-left px-4 py-3">Code</th>
                <th className="text-left px-4 py-3">Region / State</th>
                <th className="text-left px-4 py-3">Tier</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-right px-4 py-3">CY Target</th>
                <th className="text-right px-4 py-3">CY Actual</th>
                <th className="text-right px-4 py-3">Ach %</th>
                <th className="text-right px-4 py-3">Growth %</th>
                <th className="text-center px-4 py-3">Flag</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(r => (
                <tr key={r.id} className="cursor-pointer" onClick={() => nav(r.type === "group" ? `/groups/${r.id}` : `/dealers/${r.id}`)} data-testid={`dealer-row-${r.dealer_code}`}>
                  <td className="px-4 py-3 font-medium">{r.dealer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.dealer_code}</td>
                  <td className="px-4 py-3">{r.region} / {r.state}</td>
                  <td className="px-4 py-3">{r.tier}</td>
                  <td className="px-4 py-3 capitalize">{r.type}</td>
                  <td className="px-4 py-3 text-right num">₹{fmt(r.metrics?.current_year_target)}</td>
                  <td className="px-4 py-3 text-right num">₹{fmt(r.metrics?.current_year_actual)}</td>
                  <td className="px-4 py-3 text-right num">{r.metrics?.achievement_pct}%</td>
                  <td className="px-4 py-3 text-right num">{r.metrics?.growth_pct}%</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`flag-${r.metrics?.performance_flag} text-[11px] px-2 py-0.5 rounded-full uppercase font-medium`}>
                      {r.metrics?.performance_flag}
                    </span>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={10} className="px-4 py-8 text-center text-muted-foreground">No dealers found</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
