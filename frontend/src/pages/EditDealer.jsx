import React, { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, Save, Plus, Trash2, Upload, FileText } from "lucide-react";
import { toast } from "sonner";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function EditDealer() {
  const { id } = useParams();
  const nav = useNavigate();
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [salesYear, setSalesYear] = useState(new Date().getFullYear());
  const [kpiYear, setKpiYear] = useState(new Date().getFullYear());

  useEffect(() => { (async () => setD((await api.get(`/dealers/${id}`)).data))(); }, [id]);
  if (!d) return <div className="text-sm text-muted-foreground">Loading...</div>;

  const set = (k, v) => setD(s => ({ ...s, [k]: v }));

  const saveAll = async () => {
    setBusy(true);
    try {
      const payload = { ...d };
      delete payload.metrics;
      await api.put(`/dealers/${id}`, payload);
      toast.success("Dealer updated");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
    finally { setBusy(false); }
  };

  const upsertSales = async (month, target, actual) => {
    await api.post(`/dealers/${id}/sales`, { year: salesYear, month, target: +target, actual: +actual });
    const fresh = (await api.get(`/dealers/${id}`)).data;
    setD(fresh);
    toast.success(`${MONTHS[month-1]} ${salesYear} saved`);
  };

  const upsertKpi = async (k) => {
    await api.post(`/dealers/${id}/kpis`, { year: kpiYear, ...k });
    const fresh = (await api.get(`/dealers/${id}`)).data;
    setD(fresh);
    toast.success(`KPIs ${kpiYear} saved`);
  };

  const uploadPhoto = async (category, file) => {
    const reader = new FileReader();
    reader.onload = async () => {
      await api.post(`/dealers/${id}/photos`, { category, base64_image: reader.result });
      const fresh = (await api.get(`/dealers/${id}`)).data;
      setD(fresh);
      toast.success("Photo uploaded");
    };
    reader.readAsDataURL(file);
  };

  const removePhoto = async (category, idx) => {
    await api.delete(`/dealers/${id}/photos/${category}/${idx}`);
    const fresh = (await api.get(`/dealers/${id}`)).data;
    setD(fresh);
  };

  const downloadPdf = async () => {
    const res = await api.get(`/dealers/${id}/report.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement("a"); a.href = url; a.download = `${d.dealer_code}_report.pdf`; a.click();
  };

  const yearMonths = MONTHS.map((m, i) => {
    const ms = (d.monthly_sales || []).find(s => s.year === salesYear && s.month === i + 1) || { target: 0, actual: 0 };
    return { month: i + 1, name: m, ...ms };
  });

  const currentKpi = (d.yearly_kpis || []).find(k => k.year === kpiYear) || { gross_profit: 0, ros: 0, oar: 0, ssi: 0, dcsi: 0, kdep: 0, national_rank: 0 };

  return (
    <div className="space-y-5" data-testid="edit-dealer">
      <button onClick={() => nav(-1)} className="text-xs text-[#0F4C81] inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="w-3 h-3" /> Back
      </button>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit: {d.dealer_name}</h1>
          <p className="text-sm text-muted-foreground">{d.dealer_code}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={downloadPdf}><FileText className="w-4 h-4 mr-2" /> PDF Report</Button>
          <Button onClick={saveAll} disabled={busy} className="bg-[#0F4C81] hover:bg-[#0C3D67]"><Save className="w-4 h-4 mr-2" /> Save Master</Button>
        </div>
      </div>

      <Tabs defaultValue="master">
        <TabsList>
          <TabsTrigger value="master">Master & Infrastructure</TabsTrigger>
          <TabsTrigger value="sales" data-testid="tab-sales-entry">Monthly Sales</TabsTrigger>
          <TabsTrigger value="kpis" data-testid="tab-kpi-entry">KPIs</TabsTrigger>
          <TabsTrigger value="photos" data-testid="tab-photos">Photos</TabsTrigger>
        </TabsList>

        <TabsContent value="master">
          <Card className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                ["dealer_name","Dealer Name"],["dealer_code","Code"],["dealer_principal","Principal"],
                ["mobile","Mobile"],["email","Email"],["region","Region"],["state","State"],["city","City"],
                ["tier","Tier"],["dealer_type","Dealer Type"],["activation_date","Activation Date"],["brand","Brand"],
              ].map(([k, l]) => (
                <div key={k}><Label className="text-xs">{l}</Label><Input value={d[k] || ""} onChange={(e)=>set(k, e.target.value)} /></div>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4 pt-3">
              <div><Label className="text-xs">Showroom Ownership</Label>
                <Select value={d.showroom_ownership} onValueChange={(v)=>set("showroom_ownership", v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="Owned">Owned</SelectItem><SelectItem value="Leased">Leased</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Frontage (ft)</Label><Input type="number" value={d.showroom_frontage} onChange={(e)=>set("showroom_frontage", +e.target.value)} /></div>
              <div><Label className="text-xs">Showroom Area</Label><Input type="number" value={d.showroom_area} onChange={(e)=>set("showroom_area", +e.target.value)} /></div>
              <div><Label className="text-xs">Workshop Ownership</Label>
                <Select value={d.workshop_ownership} onValueChange={(v)=>set("workshop_ownership", v)}>
                  <SelectTrigger><SelectValue/></SelectTrigger>
                  <SelectContent><SelectItem value="Owned">Owned</SelectItem><SelectItem value="Leased">Leased</SelectItem></SelectContent>
                </Select>
              </div>
              <div><Label className="text-xs">Workshop Area</Label><Input type="number" value={d.workshop_area} onChange={(e)=>set("workshop_area", +e.target.value)} /></div>
              <div><Label className="text-xs">Workshop Bays</Label><Input type="number" value={d.workshop_bays} onChange={(e)=>set("workshop_bays", +e.target.value)} /></div>
              <div><Label className="text-xs">BP Bays</Label><Input type="number" value={d.bp_bays} onChange={(e)=>set("bp_bays", +e.target.value)} /></div>
            </div>
            <div><Label className="text-xs">General Info</Label><Textarea value={d.general_info || ""} onChange={(e)=>set("general_info", e.target.value)} rows={3} /></div>
          </Card>
        </TabsContent>

        <TabsContent value="sales">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs">Year</Label>
              <Input type="number" value={salesYear} onChange={(e)=>setSalesYear(+e.target.value)} className="w-32" />
            </div>
            <table className="data-table w-full text-sm">
              <thead><tr><th className="px-3 py-2 text-left">Month</th><th className="px-3 py-2 text-right">Target</th><th className="px-3 py-2 text-right">Actual</th><th className="px-3 py-2"></th></tr></thead>
              <tbody>
                {yearMonths.map((row) => (
                  <SalesRow key={row.month} row={row} onSave={upsertSales} />
                ))}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="kpis">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-3">
              <Label className="text-xs">Year</Label>
              <Input type="number" value={kpiYear} onChange={(e)=>setKpiYear(+e.target.value)} className="w-32" />
            </div>
            <KpiForm initial={currentKpi} onSave={upsertKpi} />
          </Card>
        </TabsContent>

        <TabsContent value="photos">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {["showroom","workshop","interior"].map(cat => (
              <Card key={cat} className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold capitalize">{cat} Photos</div>
                  <label className="cursor-pointer">
                    <input type="file" accept="image/*" className="hidden" onChange={(e)=>e.target.files?.[0] && uploadPhoto(cat, e.target.files[0])} />
                    <span className="text-xs px-2 py-1 rounded-md bg-[#0F4C81] text-white inline-flex items-center gap-1"><Upload className="w-3 h-3"/>Upload</span>
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {(d[`${cat}_photos`] || []).map((src, i) => (
                    <div key={i} className="relative group">
                      <img src={src} alt="" className="w-full h-24 object-cover rounded-md border" />
                      <button onClick={()=>removePhoto(cat, i)} className="absolute top-1 right-1 bg-white/90 rounded p-1 opacity-0 group-hover:opacity-100">
                        <Trash2 className="w-3 h-3 text-red-600" />
                      </button>
                    </div>
                  ))}
                  {(d[`${cat}_photos`] || []).length === 0 && <div className="col-span-2 text-xs text-muted-foreground py-4 text-center">No photos</div>}
                </div>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SalesRow({ row, onSave }) {
  const [t, setT] = useState(row.target);
  const [a, setA] = useState(row.actual);
  useEffect(() => { setT(row.target); setA(row.actual); }, [row.target, row.actual]);
  return (
    <tr>
      <td className="px-3 py-2">{row.name}</td>
      <td className="px-3 py-2 text-right"><Input type="number" value={t} onChange={(e)=>setT(e.target.value)} className="text-right h-8" /></td>
      <td className="px-3 py-2 text-right"><Input type="number" value={a} onChange={(e)=>setA(e.target.value)} className="text-right h-8" /></td>
      <td className="px-3 py-2 text-right"><Button size="sm" variant="outline" onClick={()=>onSave(row.month, t, a)}>Save</Button></td>
    </tr>
  );
}

function KpiForm({ initial, onSave }) {
  const [k, setK] = useState(initial);
  useEffect(() => setK(initial), [initial]);
  const fields = [["gross_profit","Gross Profit (₹L)"],["ros","ROS %"],["oar","OAR %"],["ssi","SSI"],["dcsi","DCSI"],["kdep","KDEP"],["national_rank","National Rank"]];
  return (
    <div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {fields.map(([f, l]) => (
          <div key={f}><Label className="text-xs">{l}</Label><Input type="number" value={k[f] ?? 0} onChange={(e)=>setK({...k, [f]: +e.target.value})} /></div>
        ))}
      </div>
      <div className="flex justify-end mt-4">
        <Button onClick={()=>onSave(k)} className="bg-[#0F4C81] hover:bg-[#0C3D67]"><Save className="w-4 h-4 mr-2" /> Save KPIs</Button>
      </div>
    </div>
  );
}
