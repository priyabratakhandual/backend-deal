import React, { useState } from "react";
import api from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Upload, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";

export default function ImportPage() {
  const [file, setFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const onUpload = async () => {
    if (!file) return toast.error("Choose an Excel file");
    const fd = new FormData();
    fd.append("file", file);
    setBusy(true);
    try {
      const { data } = await api.post("/import/dealers", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setResult(data);
      toast.success(`Imported ${data.inserted} dealers`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Import failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-5" data-testid="import-page">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Excel Import</h1>
        <p className="text-sm text-muted-foreground">Bulk import dealers from an Excel file</p>
      </div>

      <Card className="p-6">
        <div className="flex items-start gap-4 mb-6">
          <div className="w-12 h-12 rounded-md bg-[#0F4C81]/10 grid place-items-center text-[#0F4C81]">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div>
            <div className="text-sm font-semibold">Required columns</div>
            <div className="text-xs text-muted-foreground mt-1 font-mono">
              dealer_name, dealer_code, dealer_principal, region, state, city, tier, dealer_type, mobile, email
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Input data-testid="import-file-input" type="file" accept=".xlsx,.xls" onChange={(e) => setFile(e.target.files?.[0])} />
          <Button data-testid="import-upload-btn" onClick={onUpload} disabled={busy} className="bg-[#0F4C81] hover:bg-[#0C3D67]">
            <Upload className="w-4 h-4 mr-2" /> {busy ? "Uploading..." : "Upload"}
          </Button>
        </div>
        {result && (
          <div className="mt-4 p-3 rounded-md flag-green text-sm">Imported {result.inserted} dealers successfully.</div>
        )}
      </Card>
    </div>
  );
}
