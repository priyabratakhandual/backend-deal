import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";

export default function Benchmarks() {
  const [rows, setRows] = useState([]);
  useEffect(() => { (async () => setRows((await api.get("/benchmarks")).data))(); }, []);

  return (
    <div className="space-y-5" data-testid="benchmarks-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">National Benchmarks</h1>
        <p className="text-sm text-muted-foreground">Average performance benchmarks across the dealer network</p>
      </div>
      <Card className="p-0 overflow-hidden">
        <table className="data-table w-full text-sm">
          <thead><tr>
            <th className="text-left px-4 py-3">Year</th>
            <th className="text-right px-4 py-3">Gross Profit (₹L)</th>
            <th className="text-right px-4 py-3">ROS Avg %</th>
            <th className="text-right px-4 py-3">OAR Avg %</th>
            <th className="text-right px-4 py-3">SSI Avg</th>
            <th className="text-right px-4 py-3">DCSI Avg</th>
            <th className="text-right px-4 py-3">KDEP Avg</th>
          </tr></thead>
          <tbody>
            {rows.sort((a,b) => b.year - a.year).map(b => (
              <tr key={b.year}>
                <td className="px-4 py-3 font-medium">{b.year}</td>
                <td className="px-4 py-3 text-right num">{b.gross_profit_avg}</td>
                <td className="px-4 py-3 text-right num">{b.ros_avg}</td>
                <td className="px-4 py-3 text-right num">{b.oar_avg}</td>
                <td className="px-4 py-3 text-right num">{b.ssi_avg}</td>
                <td className="px-4 py-3 text-right num">{b.dcsi_avg}</td>
                <td className="px-4 py-3 text-right num">{b.kdep_avg}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
