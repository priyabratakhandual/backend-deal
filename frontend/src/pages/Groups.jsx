import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Link, useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Network, ArrowRight } from "lucide-react";

const fmt = (n) => new Intl.NumberFormat("en-IN").format(Math.round(n || 0));

export default function Groups() {
  const [rows, setRows] = useState([]);
  const nav = useNavigate();

  useEffect(() => {
    (async () => {
      const { data } = await api.get("/dealers", { params: { type: "group" } });
      setRows(data);
    })();
  }, []);

  return (
    <div className="space-y-5" data-testid="groups-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Group Dealers</h1>
        <p className="text-sm text-muted-foreground">Multi-outlet networks under a parent dealer</p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rows.map(g => (
          <Card key={g.id} className="p-5 cursor-pointer hover:border-[#0F4C81] transition-colors" onClick={() => nav(`/groups/${g.id}`)} data-testid={`group-card-${g.dealer_code}`}>
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-md bg-[#0F4C81]/10 grid place-items-center text-[#0F4C81]">
                  <Network className="w-5 h-5" />
                </div>
                <div>
                  <div className="text-lg font-semibold">{g.dealer_name}</div>
                  <div className="text-xs text-muted-foreground">{g.dealer_code} • {g.dealer_principal}</div>
                  <div className="text-xs text-muted-foreground mt-1">{g.region} • {g.num_outlets} outlets</div>
                </div>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground" />
            </div>
            <div className="mt-4 grid grid-cols-3 gap-3 text-center">
              <Mini label="3S" v={g.num_3s} />
              <Mini label="1S" v={g.num_1s} />
              <Mini label="CY Actual" v={`₹${fmt(g.metrics?.current_year_actual)}`} />
            </div>
          </Card>
        ))}
        {rows.length === 0 && <div className="text-sm text-muted-foreground">No group dealers</div>}
      </div>
    </div>
  );
}

function Mini({ label, v }) {
  return (
    <div className="rounded-md border p-2">
      <div className="text-[10px] uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="num text-sm font-semibold">{v}</div>
    </div>
  );
}
