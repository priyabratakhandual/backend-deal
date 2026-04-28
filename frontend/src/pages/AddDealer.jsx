import React, { useState } from "react";
import api from "@/lib/api";
import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { ArrowLeft, Save } from "lucide-react";

const initial = {
  type: "single", dealer_name: "", dealer_code: "", dealer_principal: "",
  region: "North", state: "", city: "", tier: "T1", dealer_type: "3S",
  activation_date: "", mobile: "", email: "", brand: "Globtier", other_brands: "",
  general_info: "",
  num_3s: 1, num_1s: 0, num_outlets: 1,
  showroom_ownership: "Owned", showroom_frontage: 0, showroom_area: 0,
  workshop_ownership: "Owned", workshop_area: 0, workshop_bays: 0, bp_bays: 0,
  outlets: [], showroom_photos: [], workshop_photos: [], interior_photos: [],
  monthly_sales: [], yearly_kpis: [],
};

export default function AddDealer() {
  const [d, setD] = useState(initial);
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();

  const set = (k, v) => setD(s => ({ ...s, [k]: v }));

  const submit = async () => {
    if (!d.dealer_name) return toast.error("Dealer name required");
    setBusy(true);
    try {
      const { data } = await api.post("/dealers", d);
      toast.success("Dealer created");
      nav(d.type === "group" ? `/groups/${data.id}` : `/dealers/${data.id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="add-dealer-page">
      <button onClick={() => nav(-1)} className="text-xs text-[#0F4C81] inline-flex items-center gap-1 hover:underline">
        <ArrowLeft className="w-3 h-3" /> Back
      </button>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Add Dealer</h1>
        <p className="text-sm text-muted-foreground">Create a new dealer profile</p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="text-sm font-semibold">Master Information</div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Field label="Type">
            <Select value={d.type} onValueChange={(v) => set("type", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>
                <SelectItem value="single">Single Dealer</SelectItem>
                <SelectItem value="group">Group Dealer</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Dealer Name *"><Input data-testid="dealer-name" value={d.dealer_name} onChange={(e)=>set("dealer_name", e.target.value)} /></Field>
          <Field label="Dealer Code"><Input value={d.dealer_code} onChange={(e)=>set("dealer_code", e.target.value)} /></Field>
          <Field label="Dealer Principal"><Input value={d.dealer_principal} onChange={(e)=>set("dealer_principal", e.target.value)} /></Field>
          <Field label="Mobile"><Input value={d.mobile} onChange={(e)=>set("mobile", e.target.value)} /></Field>
          <Field label="Email"><Input value={d.email} onChange={(e)=>set("email", e.target.value)} /></Field>
          <Field label="Region">
            <Select value={d.region} onValueChange={(v)=>set("region", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{["North","South","East","West","Central"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="State"><Input value={d.state} onChange={(e)=>set("state", e.target.value)} /></Field>
          <Field label="City"><Input value={d.city} onChange={(e)=>set("city", e.target.value)} /></Field>
          <Field label="Tier">
            <Select value={d.tier} onValueChange={(v)=>set("tier", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{["T1","T2","T3","UC"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Dealer Type">
            <Select value={d.dealer_type} onValueChange={(v)=>set("dealer_type", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent>{["3S","1S","2S"].map(r=><SelectItem key={r} value={r}>{r}</SelectItem>)}</SelectContent>
            </Select>
          </Field>
          <Field label="Activation Date"><Input type="date" value={d.activation_date} onChange={(e)=>set("activation_date", e.target.value)} /></Field>
        </div>

        <div className="text-sm font-semibold pt-4">Network</div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="3S Count"><Input type="number" value={d.num_3s} onChange={(e)=>set("num_3s", +e.target.value)} /></Field>
          <Field label="1S Count"><Input type="number" value={d.num_1s} onChange={(e)=>set("num_1s", +e.target.value)} /></Field>
          <Field label="Outlets"><Input type="number" value={d.num_outlets} onChange={(e)=>set("num_outlets", +e.target.value)} /></Field>
        </div>

        <div className="text-sm font-semibold pt-4">Showroom</div>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Ownership">
            <Select value={d.showroom_ownership} onValueChange={(v)=>set("showroom_ownership", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="Owned">Owned</SelectItem><SelectItem value="Leased">Leased</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Frontage (ft)"><Input type="number" value={d.showroom_frontage} onChange={(e)=>set("showroom_frontage", +e.target.value)} /></Field>
          <Field label="Area (sq ft)"><Input type="number" value={d.showroom_area} onChange={(e)=>set("showroom_area", +e.target.value)} /></Field>
        </div>

        <div className="text-sm font-semibold pt-4">Workshop</div>
        <div className="grid grid-cols-4 gap-4">
          <Field label="Ownership">
            <Select value={d.workshop_ownership} onValueChange={(v)=>set("workshop_ownership", v)}>
              <SelectTrigger><SelectValue/></SelectTrigger>
              <SelectContent><SelectItem value="Owned">Owned</SelectItem><SelectItem value="Leased">Leased</SelectItem></SelectContent>
            </Select>
          </Field>
          <Field label="Area (sq ft)"><Input type="number" value={d.workshop_area} onChange={(e)=>set("workshop_area", +e.target.value)} /></Field>
          <Field label="Workshop Bays"><Input type="number" value={d.workshop_bays} onChange={(e)=>set("workshop_bays", +e.target.value)} /></Field>
          <Field label="BP Bays"><Input type="number" value={d.bp_bays} onChange={(e)=>set("bp_bays", +e.target.value)} /></Field>
        </div>

        <div className="text-sm font-semibold pt-4">General Info</div>
        <Textarea value={d.general_info} onChange={(e)=>set("general_info", e.target.value)} rows={3} />

        <div className="flex justify-end pt-4">
          <Button onClick={submit} disabled={busy} data-testid="save-dealer-btn" className="bg-[#0F4C81] hover:bg-[#0C3D67]">
            <Save className="w-4 h-4 mr-2" /> {busy ? "Saving..." : "Save Dealer"}
          </Button>
        </div>
      </Card>
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div>
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}
