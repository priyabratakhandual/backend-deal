import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { toast } from "sonner";
import { LayoutDashboard } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("admin@globtier.com");
  const [password, setPassword] = useState("admin123");
  const [busy, setBusy] = useState(false);

  if (user && user !== false) return <Navigate to="/" replace />;

  const onSubmit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Welcome back");
      nav("/");
    } catch (err) {
      const d = err?.response?.data?.detail;
      toast.error(typeof d === "string" ? d : "Login failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      <div className="hidden lg:flex globtier-sidebar text-white p-12 flex-col justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-md bg-white/10 grid place-items-center border border-white/20">
            <LayoutDashboard className="w-5 h-5" />
          </div>
          <div>
            <div className="text-lg font-semibold tracking-tight">Globtier</div>
            <div className="text-xs text-white/60">Dealer Intelligence Platform</div>
          </div>
        </div>
        <div className="space-y-4 max-w-md">
          <h1 className="text-4xl font-bold leading-tight tracking-tight">Replace Excel. Run on insights.</h1>
          <p className="text-white/70 text-sm leading-relaxed">
            Unified Dealer Profile Cards, Group Dashboards, and KPI tracking against National Benchmarks — all in one operations cockpit.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-4">
            {["Dealers", "KPIs", "Group view"].map((t) => (
              <div key={t} className="rounded-md border border-white/10 bg-white/5 px-3 py-2 text-xs">{t}</div>
            ))}
          </div>
        </div>
        <div className="text-xs text-white/40">© Globtier 2026</div>
      </div>

      <div className="flex items-center justify-center p-6">
        <Card className="w-full max-w-md p-8">
          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
            <p className="text-sm text-muted-foreground">Use your Globtier credentials</p>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" data-testid="login-email-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input id="password" data-testid="login-password-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </div>
            <Button data-testid="login-submit-btn" disabled={busy} className="w-full bg-[#0F4C81] hover:bg-[#0C3D67]">
              {busy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          <div className="mt-6 text-xs text-muted-foreground border-t pt-4 space-y-1">
            <div className="font-medium text-foreground">Demo accounts</div>
            <div>admin@globtier.com / admin123</div>
            <div>business@globtier.com / business123</div>
            <div>viewer@globtier.com / viewer123</div>
          </div>
        </Card>
      </div>
    </div>
  );
}
