import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { useParams, Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer, LineChart, Line, BarChart, Bar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";
import { Building2, Phone, Mail, MapPin, Calendar, ArrowLeft, Edit, FileText } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));
const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function DealerProfile() {
  const { id } = useParams();
  const nav = useNavigate();
  const { user } = useAuth();
  const canEdit = ["admin", "business_user", "data_entry"].includes(user?.role);
  const [d, setD] = useState(null);
  const [bm, setBm] = useState([]);

  const downloadPdf = async () => {
    const res = await api.get(`/dealers/${id}/report.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `${d?.dealer_code || "dealer"}_report.pdf`; a.click();
  };

  useEffect(() => {
    (async () => {
      const [a, b] = await Promise.all([api.get(`/dealers/${id}`), api.get("/benchmarks")]);
      setD(a.data); setBm(b.data);
    })();
  }, [id]);

  if (!d) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const m = d.metrics || {};
  const yearTrend = Object.values((m.by_year) || {}).map((y, i) => ({
    year: Object.keys(m.by_year)[i], target: y.target, actual: y.actual,
  })).sort((a, b) => a.year - b.year);

  const cy = new Date().getFullYear();
  const monthly = (d.monthly_sales || []).filter(x => x.year === cy).sort((a, b) => a.month - b.month).map(x => ({
    month: MONTHS[x.month - 1], target: x.target, actual: x.actual,
  }));

  // KPI Radar — most recent year vs national average
  const latestKpi = (d.yearly_kpis || []).sort((a, b) => b.year - a.year)[0];
  const latestBm = bm.find(b => b.year === latestKpi?.year) || bm.sort((a,b)=>b.year-a.year)[0] || {};
  const radarData = latestKpi ? [
    { metric: "ROS", dealer: latestKpi.ros, national: latestBm.ros_avg || 0, fullMark: 10 },
    { metric: "OAR", dealer: latestKpi.oar, national: latestBm.oar_avg || 0, fullMark: 100 },
    { metric: "SSI", dealer: latestKpi.ssi / 10, national: (latestBm.ssi_avg || 0) / 10, fullMark: 100 },
    { metric: "DCSI", dealer: latestKpi.dcsi / 10, national: (latestBm.dcsi_avg || 0) / 10, fullMark: 100 },
    { metric: "KDEP", dealer: latestKpi.kdep, national: latestBm.kdep_avg || 0, fullMark: 100 },
  ] : [];

  return (
    <div className="space-y-5" data-testid="dealer-profile">
      <Link to="/dealers" className="text-xs text-[#0F4C81] inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="w-3 h-3" /> Back to Dealers
      </Link>
      <div className="flex justify-end gap-2 -mt-6">
        <Button variant="outline" size="sm" onClick={downloadPdf} data-testid="dealer-pdf-btn"><FileText className="w-4 h-4 mr-2"/>PDF Report</Button>
        {canEdit && <Button size="sm" className="bg-[#0F4C81] hover:bg-[#0C3D67]" onClick={()=>nav(`/dealers/${id}/edit`)} data-testid="dealer-edit-btn"><Edit className="w-4 h-4 mr-2"/>Edit / Enter Data</Button>}
      </div>

      {/* Profile Card Header */}
      <Card className="p-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-start gap-4">
            <div className="w-16 h-16 rounded-md bg-[#0F4C81] text-white grid place-items-center text-xl font-semibold">
              {d.dealer_name?.[0]}
            </div>
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Dealer Profile Card</div>
              <h1 className="text-2xl font-bold tracking-tight">{d.dealer_name}</h1>
              <div className="text-sm text-muted-foreground">{d.dealer_code} • {d.dealer_principal}</div>
              <div className="flex flex-wrap gap-2 mt-3 text-xs">
                <Badge variant="outline"><MapPin className="w-3 h-3 mr-1" />{d.city}, {d.state}</Badge>
                <Badge variant="outline">{d.region}</Badge>
                <Badge variant="outline">Tier {d.tier}</Badge>
                <Badge variant="outline">{d.dealer_type}</Badge>
                <Badge variant="outline"><Calendar className="w-3 h-3 mr-1" />{d.activation_date || "—"}</Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{d.mobile}</div>
            <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{d.email}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-6">
          <Tile label="CY Target" value={`₹${fmt(m.current_year_target)}`} />
          <Tile label="CY Actual" value={`₹${fmt(m.current_year_actual)}`} />
          <Tile label="Achievement" value={`${m.achievement_pct}%`} accent={m.performance_flag} />
          <Tile label="Growth vs LY" value={`${m.growth_pct}%`} />
          <Tile label="YTD" value={`₹${fmt(m.ytd_actual)}`} />
        </div>
      </Card>

      <Tabs defaultValue="performance" className="space-y-4">
        <TabsList>
          <TabsTrigger value="performance" data-testid="tab-performance">Performance</TabsTrigger>
          <TabsTrigger value="kpis" data-testid="tab-kpis">KPIs</TabsTrigger>
          <TabsTrigger value="infra" data-testid="tab-infra">Infrastructure</TabsTrigger>
          <TabsTrigger value="info" data-testid="tab-info">General Info</TabsTrigger>
        </TabsList>

        <TabsContent value="performance" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">Sales Trend (Yearly)</div>
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
              <div className="text-sm font-semibold mb-3">Monthly Performance ({cy})</div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={monthly}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="month" fontSize={12} />
                  <YAxis fontSize={12} />
                  <Tooltip /><Legend />
                  <Bar dataKey="target" fill="#F59E0B" radius={[3,3,0,0]} />
                  <Bar dataKey="actual" fill="#0F4C81" radius={[3,3,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-0 overflow-hidden">
            <div className="px-4 py-3 border-b text-sm font-semibold">Monthly Sales Detail — {cy}</div>
            <table className="data-table w-full text-sm">
              <thead><tr>
                <th className="text-left px-4 py-2">Month</th>
                <th className="text-right px-4 py-2">Target</th>
                <th className="text-right px-4 py-2">Actual</th>
                <th className="text-right px-4 py-2">Variance</th>
                <th className="text-right px-4 py-2">Ach %</th>
              </tr></thead>
              <tbody>
                {monthly.map((mo) => {
                  const ach = mo.target ? (mo.actual / mo.target * 100) : 0;
                  const flag = ach >= 100 ? "green" : ach >= 85 ? "amber" : "red";
                  return (
                    <tr key={mo.month}>
                      <td className="px-4 py-2">{mo.month}</td>
                      <td className="px-4 py-2 text-right num">₹{fmt(mo.target)}</td>
                      <td className="px-4 py-2 text-right num">₹{fmt(mo.actual)}</td>
                      <td className="px-4 py-2 text-right num">₹{fmt(mo.actual - mo.target)}</td>
                      <td className="px-4 py-2 text-right">
                        <span className={`flag-${flag} text-[11px] px-2 py-0.5 rounded-full`}>{ach.toFixed(1)}%</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="kpis" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-4">
              <div className="text-sm font-semibold mb-3">KPI Radar — Dealer vs National Average</div>
              <ResponsiveContainer width="100%" height={320}>
                <RadarChart data={radarData}>
                  <PolarGrid />
                  <PolarAngleAxis dataKey="metric" />
                  <PolarRadiusAxis fontSize={10} />
                  <Radar name="Dealer" dataKey="dealer" stroke="#0F4C81" fill="#0F4C81" fillOpacity={0.4} />
                  <Radar name="National Avg" dataKey="national" stroke="#F59E0B" fill="#F59E0B" fillOpacity={0.2} />
                  <Legend />
                </RadarChart>
              </ResponsiveContainer>
            </Card>
            <Card className="p-0 overflow-hidden">
              <div className="px-4 py-3 border-b text-sm font-semibold">Yearly KPIs</div>
              <table className="data-table w-full text-sm">
                <thead><tr>
                  <th className="text-left px-3 py-2">Year</th>
                  <th className="text-right px-3 py-2">GP (₹L)</th>
                  <th className="text-right px-3 py-2">ROS%</th>
                  <th className="text-right px-3 py-2">OAR%</th>
                  <th className="text-right px-3 py-2">SSI</th>
                  <th className="text-right px-3 py-2">DCSI</th>
                  <th className="text-right px-3 py-2">KDEP</th>
                  <th className="text-right px-3 py-2">Rank</th>
                </tr></thead>
                <tbody>
                  {(d.yearly_kpis || []).sort((a,b)=>b.year-a.year).map(k => (
                    <tr key={k.year}>
                      <td className="px-3 py-2 font-medium">{k.year}</td>
                      <td className="px-3 py-2 text-right num">{k.gross_profit}</td>
                      <td className="px-3 py-2 text-right num">{k.ros}</td>
                      <td className="px-3 py-2 text-right num">{k.oar}</td>
                      <td className="px-3 py-2 text-right num">{k.ssi}</td>
                      <td className="px-3 py-2 text-right num">{k.dcsi}</td>
                      <td className="px-3 py-2 text-right num">{k.kdep}</td>
                      <td className="px-3 py-2 text-right num">#{k.national_rank}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="infra" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="p-5">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> Showroom</div>
              <Row label="Ownership" value={d.showroom_ownership} />
              <Row label="Frontage" value={`${d.showroom_frontage} ft`} />
              <Row label="Area" value={`${d.showroom_area} sq ft`} />
            </Card>
            <Card className="p-5">
              <div className="text-sm font-semibold mb-3 flex items-center gap-2"><Building2 className="w-4 h-4" /> Workshop</div>
              <Row label="Ownership" value={d.workshop_ownership} />
              <Row label="Area" value={`${d.workshop_area} sq ft`} />
              <Row label="Workshop Bays" value={d.workshop_bays} />
              <Row label="BP Bays" value={d.bp_bays} />
            </Card>
          </div>
          <Card className="p-5">
            <div className="text-sm font-semibold mb-3">Network Structure</div>
            <div className="grid grid-cols-3 gap-4">
              <Row label="3S Dealerships" value={d.num_3s} />
              <Row label="1S Dealerships" value={d.num_1s} />
              <Row label="Outlets" value={d.num_outlets} />
            </div>
          </Card>
        </TabsContent>

        <TabsContent value="info">
          <Card className="p-5">
            <div className="text-sm font-semibold mb-2">General Information</div>
            <p className="text-sm text-muted-foreground whitespace-pre-line">{d.general_info || "—"}</p>
            <div className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-3">
              <Row label="Brand" value={d.brand} />
              <Row label="Other Brands" value={d.other_brands || "—"} />
              <Row label="Activation" value={d.activation_date || "—"} />
            </div>
          </Card>
        </TabsContent>
      </Tabs>
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

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between text-sm py-1.5 border-b last:border-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value ?? "—"}</span>
    </div>
  );
}
