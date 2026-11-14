import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Home,
  CalendarDays,
  Megaphone,
  Wallet,
  ReceiptText,
  UserCheck,
  Car,
  ScanLine,
  Users,
  LogOut,
  Settings2,
  Menu,
  X,
} from "lucide-react";
import { useAuth } from "../lib/auth";

interface NavItem {
  to: string;
  label: string;
  icon: typeof Home;
}

const NAV_BY_ROLE: Record<string, NavItem[]> = {
  RESIDENT: [
    { to: "/", label: "Home", icon: Home },
    { to: "/events", label: "Events", icon: CalendarDays },
    { to: "/notices", label: "Notices", icon: Megaphone },
    { to: "/bills", label: "Bills", icon: Wallet },
    { to: "/receipts", label: "Receipts", icon: ReceiptText },
    { to: "/guests", label: "Guests", icon: UserCheck },
  ],
  SOCIETY_ADMIN: [
    { to: "/", label: "Overview", icon: Home },
    { to: "/events", label: "Events", icon: CalendarDays },
    { to: "/notices", label: "Notices", icon: Megaphone },
    { to: "/bills", label: "Billing", icon: Wallet },
    { to: "/receipts", label: "Receipts", icon: ReceiptText },
    { to: "/directory", label: "Directory", icon: Users },
    { to: "/parking", label: "Parking", icon: Car },
    { to: "/manage", label: "Manage", icon: Settings2 },
  ],
  SUPER_ADMIN: [
    { to: "/", label: "Overview", icon: Home },
    { to: "/events", label: "Events", icon: CalendarDays },
    { to: "/notices", label: "Notices", icon: Megaphone },
    { to: "/bills", label: "Billing", icon: Wallet },
    { to: "/receipts", label: "Receipts", icon: ReceiptText },
    { to: "/directory", label: "Directory", icon: Users },
    { to: "/parking", label: "Parking", icon: Car },
    { to: "/manage", label: "Manage", icon: Settings2 },
  ],
  SECURITY: [
    { to: "/", label: "Scanner", icon: ScanLine },
    { to: "/guest-logs", label: "Guest log", icon: UserCheck },
    { to: "/parking", label: "Parking", icon: Car },
  ],
};

const ROLE_LABEL: Record<string, string> = {
  RESIDENT: "Resident",
  SOCIETY_ADMIN: "Society admin",
  SUPER_ADMIN: "Super admin",
  SECURITY: "Security",
};

const LOGO_URL = `${import.meta.env.BASE_URL}logo-mark.png`;

export function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const items = NAV_BY_ROLE[user?.role ?? "RESIDENT"];
  const initial = user?.name?.trim()?.[0]?.toUpperCase() ?? "?";
  const [drawerOpen, setDrawerOpen] = useState(false);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      {/* Desktop layout: a light dashboard-style rail on the left, content on the
          right. Below lg it collapses to a top bar + a toggleable slide-over
          menu instead — this section only affects lg and up. */}
      <div className="lg:flex">
        <aside className="hidden w-60 shrink-0 flex-col border-r border-line bg-white px-4 py-6 lg:flex xl:w-64">
          <div className="mb-8 flex items-center gap-2 px-2">
            <img src={LOGO_URL} alt="" className="h-8 w-8" />
            <div>
              <p className="font-serif text-xl leading-none text-ink">Mera Nivas</p>
              {user?.flat ? (
                <p className="mt-1 text-xs text-slate">
                  {user.flat.block.name} · {user.flat.number}
                </p>
              ) : (
                user?.role && <p className="mt-1 text-xs text-slate">{ROLE_LABEL[user.role]}</p>
              )}
            </div>
          </div>
          <nav className="flex flex-1 flex-col gap-1">
            {items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.to === "/"}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive ? "bg-teal/10 text-teal" : "text-slate hover:bg-surface hover:text-ink"
                  }`
                }
              >
                <item.icon size={18} strokeWidth={1.75} />
                {item.label}
              </NavLink>
            ))}
          </nav>
          <button
            onClick={handleLogout}
            className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate hover:bg-surface hover:text-ink"
          >
            <LogOut size={18} strokeWidth={1.75} />
            Sign out
          </button>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          {/* Mobile top bar — a hamburger toggle opens the full nav drawer below,
              which lists every link for this role (Manage included), not a
              capped set of icons. */}
          <header className="flex items-center justify-between border-b border-line bg-white/80 px-4 py-3 backdrop-blur lg:hidden">
            <button
              onClick={() => setDrawerOpen(true)}
              aria-label="Open menu"
              className="flex h-9 w-9 items-center justify-center rounded-lg text-ink hover:bg-surface"
            >
              <Menu size={22} />
            </button>
            <div className="flex items-center gap-2">
              <img src={LOGO_URL} alt="" className="h-6 w-6" />
              <p className="font-serif text-lg">Mera Nivas</p>
            </div>
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal/10 text-xs font-medium text-teal">
              {initial}
            </div>
          </header>

          {/* Desktop dashboard header: who's signed in, always visible above the page content */}
          <header className="hidden items-center justify-end gap-3 border-b border-line bg-white px-8 py-3 lg:flex">
            <div className="text-right">
              <p className="text-sm font-medium leading-tight text-ink">{user?.name}</p>
              <p className="text-xs leading-tight text-slate">{user?.role && ROLE_LABEL[user.role]}</p>
            </div>
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-teal/10 text-xs font-medium text-teal">
              {initial}
            </div>
          </header>

          <main className="flex-1 px-4 pb-10 pt-6 sm:px-6 lg:bg-surface lg:px-10 lg:pt-8">
            <div className="mx-auto w-full max-w-6xl">
              <Outlet />
            </div>
          </main>
        </div>
      </div>

      {/* Mobile nav drawer */}
      {drawerOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <button
            aria-label="Close menu"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white px-4 py-6 shadow-xl">
            <div className="mb-6 flex items-center justify-between px-2">
              <div className="flex items-center gap-2">
                <img src={LOGO_URL} alt="" className="h-8 w-8" />
                <div>
                  <p className="font-serif text-lg leading-none text-ink">Mera Nivas</p>
                  <p className="mt-1 text-xs text-slate">{user?.name}</p>
                </div>
              </div>
              <button
                onClick={() => setDrawerOpen(false)}
                aria-label="Close menu"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-slate hover:bg-surface"
              >
                <X size={18} />
              </button>
            </div>
            <nav className="flex flex-1 flex-col gap-1">
              {items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === "/"}
                  onClick={() => setDrawerOpen(false)}
                  className={({ isActive }) =>
                    `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive ? "bg-teal/10 text-teal" : "text-ink hover:bg-surface"
                    }`
                  }
                >
                  <item.icon size={19} strokeWidth={1.75} />
                  {item.label}
                </NavLink>
              ))}
            </nav>
            <button
              onClick={handleLogout}
              className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate hover:bg-surface"
            >
              <LogOut size={19} strokeWidth={1.75} />
              Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
