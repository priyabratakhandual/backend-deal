import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useParams, Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend } from "recharts";
import { ArrowLeft, Network, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

export default function GroupDashboard() {
  const { id } = useParams();
  const [data, setData] = useState(null);

  useEffect(() => {
    (async () => {
      const { data } = await api.get(`/groups/${id}/dashboard`);
      setData(data);
    })();
  }, [id]);

  if (!data) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const g = data.group;
  const m = data.metrics;
  const t = data.totals;

  const yearTrend = Object.entries(m.by_year || {}).map(([year, v]) => ({ year, target: v.target, actual: v.actual })).sort((a,b)=>a.year-b.year);
  const outletsM = data.outlets || [];
  const outletCompare = outletsM.map(o => ({ name: o.city, target: o.metrics?.current_year_target || 0, actual: o.metrics?.current_year_actual || 0 }));

  const downloadPdf = async () => {
    const res = await api.get(`/dealers/${id}/report.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `${g.dealer_code}_group_report.pdf`; a.click();
  };
  return (
    <div className="space-y-5" data-testid="group-dashboard">
      <Link to="/groups" className="text-xs text-[#0F4C81] inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="w-3 h-3" /> Back to Groups
      </Link>
      <div className="flex justify-end -mt-6">
        <Button variant="outline" size="sm" onClick={downloadPdf} data-testid="group-pdf-btn"><FileText className="w-4 h-4 mr-2"/>PDF Report</Button>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 rounded-md bg-[#0F4C81] text-white grid place-items-center">
            <Network className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <div className="text-xs uppercase text-muted-foreground">Group Dealer Dashboard</div>
            <h1 className="text-2xl font-bold tracking-tight">{g.dealer_name}</h1>
            <div className="text-sm text-muted-foreground">{g.dealer_principal} • {g.region}</div>
            <div className="flex flex-wrap gap-2 mt-2 text-xs">
              <Badge variant="outline">{t.total_dealerships} dealerships</Badge>
              <Badge variant="outline">{t.num_3s} × 3S</Badge>
              <Badge variant="outline">{t.num_1s} × 1S</Badge>
              <Badge variant="outline">{t.num_outlets} outlets</Badge>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <Tile label="Total CY Target" value={`₹${fmt(m.current_year_target)}`} />
          <Tile label="Total CY Actual" value={`₹${fmt(m.current_year_actual)}`} />
          <Tile label="Achievement" value={`${m.achievement_pct}%`} accent={m.performance_flag} />
          <Tile label="Growth vs LY" value={`${m.growth_pct}%`} />
          <Tile label="Total YTD" value={`₹${fmt(m.ytd_actual)}`} />
        </div>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Group Sales Trend</div>
        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={yearTrend}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="year" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Line type="monotone" dataKey="target" stroke="#F59E0B" strokeWidth={2} />
            <Line type="monotone" dataKey="actual" stroke="#0F4C81" strokeWidth={2} />
          </LineChart>
        </ResponsiveContainer>
      </Card>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Outlet Comparison ({new Date().getFullYear()})</div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={outletCompare}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" fontSize={12} />
            <YAxis fontSize={12} />
            <Tooltip /><Legend />
            <Bar dataKey="target" fill="#F59E0B" radius={[3,3,0,0]} />
            <Bar dataKey="actual" fill="#0F4C81" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Tile label="Showroom Owned" value={t.showroom_owned} />
        <Tile label="Showroom Leased" value={t.showroom_leased} />
        <Tile label="Workshop Owned" value={t.workshop_owned} />
        <Tile label="Workshop Leased" value={t.workshop_leased} />
      </div>

      <Card className="p-0 overflow-hidden">
        <div className="px-4 py-3 border-b text-sm font-semibold">Outlet Level Detail</div>
        <div className="overflow-x-auto">
          <table className="data-table w-full text-sm">
            <thead><tr>
              <th className="text-left px-3 py-3">State</th>
              <th className="text-left px-3 py-3">City</th>
              <th className="text-left px-3 py-3">Code</th>
              <th className="text-left px-3 py-3">Tier</th>
              <th className="text-left px-3 py-3">Start</th>
              <th className="text-right px-3 py-3">Showroom (sqft)</th>
              <th className="text-right px-3 py-3">Workshop (sqft)</th>
              <th className="text-right px-3 py-3">PY Sales</th>
              <th className="text-right px-3 py-3">CY Target</th>
              <th className="text-right px-3 py-3">CY Actual</th>
              <th className="text-right px-3 py-3">Var</th>
              <th className="text-right px-3 py-3">Growth %</th>
              <th className="text-right px-3 py-3">YTD</th>
              <th className="text-right px-3 py-3">YTD Gr%</th>
              <th className="text-center px-3 py-3">Flag</th>
            </tr></thead>
            <tbody>
              {outletsM.map((o) => {
                const om = o.metrics || {};
                return (
                  <tr key={o.dealer_code} data-testid={`outlet-row-${o.dealer_code}`}>
                    <td className="px-3 py-2">{o.state}</td>
                    <td className="px-3 py-2">{o.city}</td>
                    <td className="px-3 py-2 font-medium">{o.dealer_code}</td>
                    <td className="px-3 py-2">{o.tier}</td>
                    <td className="px-3 py-2 text-xs">{o.start_of_business}</td>
                    <td className="px-3 py-2 text-right num">{fmt(o.showroom_area)}</td>
                    <td className="px-3 py-2 text-right num">{fmt(o.workshop_area)}</td>
                    <td className="px-3 py-2 text-right num">₹{fmt(om.previous_year_actual)}</td>
                    <td className="px-3 py-2 text-right num">₹{fmt(om.current_year_target)}</td>
                    <td className="px-3 py-2 text-right num">₹{fmt(om.current_year_actual)}</td>
                    <td className="px-3 py-2 text-right num">₹{fmt((om.current_year_actual||0)-(om.current_year_target||0))}</td>
                    <td className="px-3 py-2 text-right num">{om.growth_pct}%</td>
                    <td className="px-3 py-2 text-right num">₹{fmt(om.ytd_actual)}</td>
                    <td className="px-3 py-2 text-right num">{om.ytd_growth_pct}%</td>
                    <td className="px-3 py-2 text-center">
                      <span className={`flag-${om.performance_flag} text-[11px] px-2 py-0.5 rounded-full uppercase`}>{om.performance_flag}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function Tile({ label, value, accent }) {
  const color = accent === "green" ? "#10B981" : accent === "amber" ? "#F59E0B" : accent === "red" ? "#EF4444" : "#111827";
  return (
    <div className="p-3 rounded-md border bg-white">
      <div className="text-[11px] text-muted-foreground uppercase tracking-wider">{label}</div>
      <div className="mt-1 num text-lg font-bold" style={{ color }}>{value}</div>
    </div>
  );
}
