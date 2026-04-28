import React from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, Building2, Users, Upload, BarChart3, LogOut, Network, Award,
} from "lucide-react";

const nav = [
  { to: "/", label: "Overview", icon: LayoutDashboard, end: true },
  { to: "/dealers", label: "Dealers", icon: Building2 },
  { to: "/groups", label: "Group Dealers", icon: Network },
  { to: "/benchmarks", label: "Benchmarks", icon: Award },
  { to: "/import", label: "Excel Import", icon: Upload, roles: ["admin", "data_entry"] },
  { to: "/users", label: "Users", icon: Users, roles: ["admin"] },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const role = user?.role;

  return (
    <div className="min-h-screen flex bg-[#F8F9FA]">
      <aside className="w-64 globtier-sidebar text-white flex flex-col fixed h-screen">
        <div className="p-5 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md bg-white/10 grid place-items-center border border-white/20">
              <BarChart3 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-sm font-semibold tracking-tight">Globtier</div>
              <div className="text-[11px] text-white/60">Dealer Intelligence</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {nav.filter(n => !n.roles || n.roles.includes(role) || role === "admin").map((n) => {
            const Icon = n.icon;
            return (
              <NavLink
                key={n.to} to={n.to} end={n.end}
                data-testid={`nav-${n.label.toLowerCase().replace(/\s+/g, "-")}`}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors ${
                    isActive ? "bg-white/10 text-white" : "text-white/70 hover:bg-white/5 hover:text-white"
                  }`
                }
              >
                <Icon className="w-4 h-4" />
                <span>{n.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="p-3 border-t border-white/10">
          <div className="px-2 py-2 text-xs text-white/60">
            <div className="text-white text-sm font-medium">{user?.name}</div>
            <div className="capitalize">{user?.role?.replace("_", " ")}</div>
          </div>
          <Button data-testid="logout-btn" variant="ghost" size="sm" className="w-full justify-start text-white/80 hover:bg-white/10 hover:text-white"
            onClick={async () => { await logout(); navigate("/login"); }}>
            <LogOut className="w-4 h-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="flex-1 ml-64">
        <header className="bg-white border-b border-[#E5E7EB] px-8 py-4 flex items-center justify-between">
          <div>
            <div className="text-xs text-[#9CA3AF]">Workspace</div>
            <div className="text-sm font-semibold">Globtier Dealer Intelligence</div>
          </div>
          <div className="text-xs text-[#4B5563]">Signed in as <span className="font-medium">{user?.email}</span></div>
        </header>
        <div className="p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
