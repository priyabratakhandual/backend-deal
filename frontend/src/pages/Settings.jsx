import React, { useEffect, useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { Save, Plus, Trash2, Plug, FlaskConical, Activity, Calculator } from "lucide-react";

const blankIntegration = {
  name: "", description: "", base_url: "", method: "GET", endpoint_path: "",
  auth_type: "none", auth_value: "", auth_header: "Authorization",
  headers: {}, target_module: "custom", enabled: true,
};

export default function Settings() {
  const [cfg, setCfg] = useState(null);
  const [integs, setIntegs] = useState([]);
  const [logs, setLogs] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const refreshAll = async () => {
    const [c, i, l] = await Promise.all([api.get("/calc-config"), api.get("/integrations"), api.get("/audit-logs")]);
    setCfg(c.data); setIntegs(i.data); setLogs(l.data);
  };
  useEffect(() => { refreshAll(); }, []);

  const saveCfg = async () => { await api.put("/calc-config", cfg); toast.success("Calculation config saved"); refreshAll(); };

  const saveIntg = async () => {
    if (!editing.name || !editing.base_url) return toast.error("Name and Base URL required");
    if (editing.id) await api.put(`/integrations/${editing.id}`, editing);
    else await api.post("/integrations", editing);
    toast.success("Integration saved");
    setShowForm(false); setEditing(null);
    refreshAll();
  };

  const delIntg = async (iid) => {
    if (!confirm("Delete this integration?")) return;
    await api.delete(`/integrations/${iid}`);
    toast.success("Deleted");
    refreshAll();
  };

  const testIntg = async (iid) => {
    const t = toast.loading("Testing connection...");
    try {
      const { data } = await api.post(`/integrations/${iid}/test`);
      toast.dismiss(t);
      if (data.status.startsWith("2") || data.status.includes("OK")) toast.success(`OK — ${data.status} • ${data.detail}`);
      else toast.error(`${data.status} — ${data.detail}`);
      refreshAll();
    } catch (e) { toast.dismiss(t); toast.error("Test failed"); }
  };

  if (!cfg) return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-5" data-testid="settings-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Calculation logic, external API integrations, and audit log</p>
      </div>

      <Tabs defaultValue="calc">
        <TabsList>
          <TabsTrigger value="calc" data-testid="tab-calc"><Calculator className="w-4 h-4 mr-2"/> Calculation Logic</TabsTrigger>
          <TabsTrigger value="integ" data-testid="tab-integ"><Plug className="w-4 h-4 mr-2"/> External APIs</TabsTrigger>
          <TabsTrigger value="audit" data-testid="tab-audit"><Activity className="w-4 h-4 mr-2"/> Audit Log</TabsTrigger>
        </TabsList>

        <TabsContent value="calc">
          <Card className="p-6 space-y-4">
            <div>
              <div className="text-sm font-semibold mb-1">Performance Flag Thresholds</div>
              <p className="text-xs text-muted-foreground">Achievement % cutoffs for Green / Amber / Red flags</p>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div><Label className="text-xs">Green ≥</Label><Input type="number" value={cfg.green_threshold} onChange={(e)=>setCfg({...cfg, green_threshold: +e.target.value})} /></div>
              <div><Label className="text-xs">Amber ≥</Label><Input type="number" value={cfg.amber_threshold} onChange={(e)=>setCfg({...cfg, amber_threshold: +e.target.value})} /></div>
            </div>
            <div className="pt-3">
              <div className="text-sm font-semibold mb-1">Formulas (reference)</div>
              <p className="text-xs text-muted-foreground mb-2">Document the formulas in use. The platform applies the listed logic; edit text for organizational reference.</p>
              <div className="space-y-2">
                <div><Label className="text-xs">Achievement %</Label><Input value={cfg.achievement_formula} onChange={(e)=>setCfg({...cfg, achievement_formula: e.target.value})} className="font-mono text-xs"/></div>
                <div><Label className="text-xs">Growth %</Label><Input value={cfg.growth_formula} onChange={(e)=>setCfg({...cfg, growth_formula: e.target.value})} className="font-mono text-xs"/></div>
                <div><Label className="text-xs">YTD Growth %</Label><Input value={cfg.ytd_growth_formula} onChange={(e)=>setCfg({...cfg, ytd_growth_formula: e.target.value})} className="font-mono text-xs"/></div>
              </div>
            </div>
            <div className="pt-3">
              <div className="text-sm font-semibold mb-2">KPI Composite Weights (must sum to 1.0)</div>
              <div className="grid grid-cols-5 gap-3">
                {Object.entries(cfg.kpi_weights || {}).map(([k, v]) => (
                  <div key={k}><Label className="text-xs uppercase">{k}</Label><Input type="number" step="0.05" value={v} onChange={(e)=>setCfg({...cfg, kpi_weights: {...cfg.kpi_weights, [k]: +e.target.value}})} /></div>
                ))}
              </div>
            </div>
            <div><Label className="text-xs">Notes</Label><Textarea rows={2} value={cfg.notes} onChange={(e)=>setCfg({...cfg, notes: e.target.value})} /></div>
            <div className="flex justify-end"><Button onClick={saveCfg} className="bg-[#0F4C81] hover:bg-[#0C3D67]" data-testid="save-calc-config-btn"><Save className="w-4 h-4 mr-2"/>Save Config</Button></div>
          </Card>
        </TabsContent>

        <TabsContent value="integ">
          <div className="flex justify-between mb-3">
            <p className="text-sm text-muted-foreground">Configure APIs to pull data from external systems (DMS, ERP, CRM, finance tools, etc.)</p>
            <Button onClick={() => { setEditing({...blankIntegration}); setShowForm(true); }} className="bg-[#0F4C81] hover:bg-[#0C3D67]" data-testid="add-integration-btn">
              <Plus className="w-4 h-4 mr-2"/>New Integration
            </Button>
          </div>

          {showForm && editing && (
            <Card className="p-6 space-y-4 mb-4">
              <div className="text-sm font-semibold">{editing.id ? "Edit" : "New"} Integration</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div><Label className="text-xs">Name *</Label><Input value={editing.name} onChange={(e)=>setEditing({...editing, name: e.target.value})} placeholder="e.g. DMS Sales Sync" /></div>
                <div><Label className="text-xs">Target Module</Label>
                  <Select value={editing.target_module} onValueChange={(v)=>setEditing({...editing, target_module: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>{["dealers","sales","kpis","benchmarks","custom"].map(x=><SelectItem key={x} value={x}>{x}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2"><Label className="text-xs">Description</Label><Textarea rows={2} value={editing.description} onChange={(e)=>setEditing({...editing, description: e.target.value})} /></div>
                <div className="md:col-span-2"><Label className="text-xs">Base URL *</Label><Input value={editing.base_url} onChange={(e)=>setEditing({...editing, base_url: e.target.value})} placeholder="https://api.example.com" /></div>
                <div><Label className="text-xs">Method</Label>
                  <Select value={editing.method} onValueChange={(v)=>setEditing({...editing, method: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent><SelectItem value="GET">GET</SelectItem><SelectItem value="POST">POST</SelectItem></SelectContent>
                  </Select>
                </div>
                <div><Label className="text-xs">Endpoint Path</Label><Input value={editing.endpoint_path} onChange={(e)=>setEditing({...editing, endpoint_path: e.target.value})} placeholder="/v1/dealers" /></div>
                <div><Label className="text-xs">Auth Type</Label>
                  <Select value={editing.auth_type} onValueChange={(v)=>setEditing({...editing, auth_type: v})}>
                    <SelectTrigger><SelectValue/></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None</SelectItem>
                      <SelectItem value="bearer">Bearer Token</SelectItem>
                      <SelectItem value="api_key">API Key (Header)</SelectItem>
                      <SelectItem value="basic">Basic (user:pass)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {editing.auth_type === "api_key" && (
                  <div><Label className="text-xs">Header Name</Label><Input value={editing.auth_header} onChange={(e)=>setEditing({...editing, auth_header: e.target.value})} placeholder="X-API-Key" /></div>
                )}
                {editing.auth_type !== "none" && (
                  <div className="md:col-span-2"><Label className="text-xs">Auth Value</Label><Input type="password" value={editing.auth_value} onChange={(e)=>setEditing({...editing, auth_value: e.target.value})} /></div>
                )}
                <div className="flex items-center gap-3 md:col-span-2">
                  <Switch checked={editing.enabled} onCheckedChange={(v)=>setEditing({...editing, enabled: v})} id="en" />
                  <Label htmlFor="en" className="text-xs">Enabled</Label>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={()=>{setShowForm(false); setEditing(null);}}>Cancel</Button>
                <Button onClick={saveIntg} className="bg-[#0F4C81] hover:bg-[#0C3D67]" data-testid="save-integration-btn"><Save className="w-4 h-4 mr-2"/>Save</Button>
              </div>
            </Card>
          )}

          <Card className="p-0 overflow-hidden">
            <table className="data-table w-full text-sm">
              <thead><tr>
                <th className="text-left px-4 py-3">Name</th>
                <th className="text-left px-4 py-3">Module</th>
                <th className="text-left px-4 py-3">Endpoint</th>
                <th className="text-left px-4 py-3">Auth</th>
                <th className="text-left px-4 py-3">Status</th>
                <th className="text-left px-4 py-3">Last Run</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr></thead>
              <tbody>
                {integs.map(it => (
                  <tr key={it.id}>
                    <td className="px-4 py-3 font-medium">{it.name} {!it.enabled && <span className="text-xs text-muted-foreground">(disabled)</span>}</td>
                    <td className="px-4 py-3"><Badge variant="outline" className="capitalize">{it.target_module}</Badge></td>
                    <td className="px-4 py-3 text-xs font-mono text-muted-foreground">{it.method} {it.base_url}{it.endpoint_path}</td>
                    <td className="px-4 py-3 capitalize">{it.auth_type.replace("_", " ")}</td>
                    <td className="px-4 py-3 text-xs">{it.last_status || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{it.last_run_at ? new Date(it.last_run_at).toLocaleString() : "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={()=>testIntg(it.id)} className="mr-1" data-testid={`test-integration-${it.id}`}><FlaskConical className="w-3 h-3 mr-1"/>Test</Button>
                      <Button size="sm" variant="outline" onClick={()=>{setEditing({...it}); setShowForm(true);}} className="mr-1">Edit</Button>
                      <Button size="sm" variant="outline" onClick={()=>delIntg(it.id)}><Trash2 className="w-3 h-3"/></Button>
                    </td>
                  </tr>
                ))}
                {integs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-muted-foreground">No integrations configured. Add one to start pulling data from external systems.</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>

        <TabsContent value="audit">
          <Card className="p-0 overflow-hidden">
            <table className="data-table w-full text-sm">
              <thead><tr>
                <th className="text-left px-4 py-3">Time</th>
                <th className="text-left px-4 py-3">User</th>
                <th className="text-left px-4 py-3">Role</th>
                <th className="text-left px-4 py-3">Action</th>
                <th className="text-left px-4 py-3">Resource</th>
                <th className="text-left px-4 py-3">Details</th>
              </tr></thead>
              <tbody>
                {logs.map(l => (
                  <tr key={l.id}>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(l.timestamp).toLocaleString()}</td>
                    <td className="px-4 py-3">{l.user_email}</td>
                    <td className="px-4 py-3 capitalize">{l.user_role.replace("_", " ")}</td>
                    <td className="px-4 py-3"><Badge variant="outline">{l.action}</Badge></td>
                    <td className="px-4 py-3 text-xs">{l.resource}{l.resource_id ? ` / ${l.resource_id.slice(0, 8)}` : ""}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{l.details}</td>
                  </tr>
                ))}
                {logs.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">No activity yet</td></tr>}
              </tbody>
            </table>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
