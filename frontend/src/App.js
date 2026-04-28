import React from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import "@/App.css";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { Toaster } from "@/components/ui/sonner";

import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import Dealers from "@/pages/Dealers";
import DealerProfile from "@/pages/DealerProfile";
import Groups from "@/pages/Groups";
import GroupDashboard from "@/pages/GroupDashboard";
import Benchmarks from "@/pages/Benchmarks";
import ImportPage from "@/pages/ImportPage";
import Users from "@/pages/Users";
import AddDealer from "@/pages/AddDealer";

function Protected({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="min-h-screen grid place-items-center text-sm text-muted-foreground">Loading...</div>;
  if (!user || user === false) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Protected><Layout /></Protected>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/dealers" element={<Dealers />} />
              <Route path="/dealers/new" element={<AddDealer />} />
              <Route path="/dealers/:id" element={<DealerProfile />} />
              <Route path="/groups" element={<Groups />} />
              <Route path="/groups/:id" element={<GroupDashboard />} />
              <Route path="/benchmarks" element={<Benchmarks />} />
              <Route path="/import" element={<ImportPage />} />
              <Route path="/users" element={<Users />} />
            </Route>
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </div>
  );
}

export default App;
