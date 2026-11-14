import type { ReactNode } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { AppShell } from "./layouts/AppShell";
import { Login } from "./pages/Login";
import { Home } from "./pages/Home";
import { Events } from "./pages/Events";
import { Notices } from "./pages/Notices";
import { Bills } from "./pages/Bills";
import { Receipts } from "./pages/Receipts";
import { Receipt } from "./pages/Receipt";
import { Guests } from "./pages/Guests";
import { GuestLogs } from "./pages/GuestLogs";
import { Parking } from "./pages/Parking";
import { Directory } from "./pages/Directory";
import { ManageResidents } from "./pages/ManageResidents";
import { GuestPass } from "./pages/GuestPass";
import { ResetPassword } from "./pages/ResetPassword";

// "/mycommunity" in the production build, "/" during local development.
const basename = import.meta.env.BASE_URL.replace(/\/+$/, "") || "/";

function ProtectedLayout() {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper">
        <p className="text-sm text-slate">Loading Mera Nivas...</p>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <AppShell />;
}

function AdminOnly({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const isAdmin = user?.role === "SOCIETY_ADMIN" || user?.role === "SUPER_ADMIN";
  if (!isAdmin) return <Navigate to="/" replace />;
  return <>{children}</>;
}

// Receipts exist for the people who pay (residents) and the people who collect (admins).
function ReceiptsAccess({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  if (user?.role === "SECURITY") return <Navigate to="/" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <BrowserRouter basename={basename}>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          {/* Public — no login. This is the link a resident shares with a guest. */}
          <Route path="/guest-pass/:token" element={<GuestPass />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route element={<ProtectedLayout />}>
            <Route path="/" element={<Home />} />
            <Route path="/events" element={<Events />} />
            <Route path="/notices" element={<Notices />} />
            <Route path="/bills" element={<Bills />} />
            <Route path="/receipts" element={<ReceiptsAccess><Receipts /></ReceiptsAccess>} />
            <Route path="/receipts/:paymentId" element={<ReceiptsAccess><Receipt /></ReceiptsAccess>} />
            <Route path="/guests" element={<Guests />} />
            <Route path="/guest-logs" element={<GuestLogs />} />
            <Route path="/parking" element={<Parking />} />
            <Route path="/directory" element={<Directory />} />
            <Route
              path="/manage"
              element={
                <AdminOnly>
                  <ManageResidents />
                </AdminOnly>
              }
            />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
