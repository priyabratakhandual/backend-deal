import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { TrendingUp, TrendingDown, Target, Building2, Network, CheckCircle2 } from "lucide-react";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

export default function Dashboard() {
  const [data, setData] = useState(null);
  const [dealers, setDealers] = useState([]);

  useEffect(() => {
    (async () => {
      const [o, d] = await Promise.all([api.get("/overview"), api.get("/dealers")]);
      setData(o.data);
      setDealers(d.data);
    })();
  }, []);

  if (!data) return <div className="text-sm text-muted-foreground">Loading...</div>;

  // Aggregate sales by year across all dealers
  const yearMap = {};
  dealers.forEach((dl) => {
    (dl.monthly_sales || []).forEach((m) => {
      yearMap[m.year] = yearMap[m.year] || { year: m.year, target: 0, actual: 0 };
      yearMap[m.year].target += m.target;
      yearMap[m.year].actual += m.actual;
    });
  });
  const trend = Object.values(yearMap).sort((a, b) => a.year - b.year);

  const tiles = [
    { label: "Total Dealers", value: data.total_dealers, icon: Building2, accent: "#0F4C81" },
    { label: "Group Dealers", value: data.groups, icon: Network, accent: "#3B82F6" },
    { label: `${data.current_year} Target`, value: `₹${fmt(data.total_target)}`, icon: Target, accent: "#F59E0B" },
    { label: `${data.current_year} Actual`, value: `₹${fmt(data.total_actual)}`, icon: TrendingUp, accent: "#10B981" },
    { label: "Achievement %", value: `${data.achievement_pct}%`, icon: CheckCircle2, accent: "#0F4C81" },
  ];

  return (
    <div className="space-y-6" data-testid="overview-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Network-wide performance against targets, current year</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {tiles.map((t) => (
          <Card key={t.label} className="kpi-tile p-4" data-testid={`tile-${t.label}`}>
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground uppercase tracking-wider">{t.label}</div>
              <t.icon className="w-4 h-4" style={{ color: t.accent }} />
            </div>
            <div className="mt-2 num text-2xl font-bold tracking-tight">{t.value}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2 p-4">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="text-sm font-semibold">Sales Trend (Network)</div>
              <div className="text-xs text-muted-foreground">Target vs Actual by year</div>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trend}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
              <XAxis dataKey="year" stroke="#9CA3AF" fontSize={12} />
              <YAxis stroke="#9CA3AF" fontSize={12} />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="target" stroke="#F59E0B" strokeWidth={2} dot={{ r: 3 }} name="Target" />
              <Line type="monotone" dataKey="actual" stroke="#0F4C81" strokeWidth={2} dot={{ r: 3 }} name="Actual" />
            </LineChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-4">
          <div className="text-sm font-semibold mb-4">Performance Flags</div>
          <div className="space-y-3">
            {[
              { k: "green", label: "On / Above Target", val: data.flags.green },
              { k: "amber", label: "Near Target (≥85%)", val: data.flags.amber },
              { k: "red", label: "Below Threshold", val: data.flags.red },
            ].map((f) => (
              <div key={f.k} className="flex items-center justify-between p-3 rounded-md border">
                <div className="flex items-center gap-3">
                  <span className={`flag-${f.k} text-xs px-2 py-0.5 rounded-full`}>{f.k.toUpperCase()}</span>
                  <span className="text-sm">{f.label}</span>
                </div>
                <div className="num text-lg font-semibold">{f.val}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card className="p-4">
        <div className="text-sm font-semibold mb-3">Top Dealers — Current Year Achievement</div>
        <ResponsiveContainer width="100%" height={280}>
          <BarChart data={[...dealers].sort((a,b) => (b.metrics?.achievement_pct||0) - (a.metrics?.achievement_pct||0)).slice(0, 8).map(d => ({ name: d.dealer_name, achievement: d.metrics?.achievement_pct || 0 }))}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
            <XAxis dataKey="name" stroke="#9CA3AF" fontSize={11} angle={-15} textAnchor="end" height={60} />
            <YAxis stroke="#9CA3AF" fontSize={12} />
            <Tooltip />
            <Bar dataKey="achievement" fill="#0F4C81" radius={[4,4,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}
