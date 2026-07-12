import React from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import {
  LayoutDashboard,
  Bot,
  Users,
  Wallet,
  Boxes,
  LineChart,
  ScrollText,
  BarChart3,
  ShieldCheck,
  History,
  SlidersHorizontal,
} from "lucide-react";

const items = [
  { to: "/",            title: "Dashboard",  icon: LayoutDashboard, from: "#06b6d4", to2: "#0ea5e9" },
  { to: "/agents",      title: "Agents",     icon: Bot,             from: "#a955ff", to2: "#ea51ff" },
  { to: "/hr",          title: "HR",         icon: Users,           from: "#22c55e", to2: "#84cc16" },
  { to: "/finance",     title: "Finance",    icon: Wallet,          from: "#f59e0b", to2: "#ef4444", employeeHidden: true },
  { to: "/inventory",   title: "Inventory",  icon: Boxes,           from: "#38bdf8", to2: "#818cf8" },
  { to: "/sales",       title: "Sales",      icon: LineChart,       from: "#f472b6", to2: "#ec4899", employeeHidden: true },
  { to: "/compliance",  title: "Compliance", icon: ShieldCheck,     from: "#eab308", to2: "#f97316", employeeHidden: true },
  { to: "/analytics",   title: "Analytics",  icon: BarChart3,       from: "#14b8a6", to2: "#06b6d4" },
  { to: "/approvals",   title: "Approvals",  icon: ScrollText,      from: "#fb7185", to2: "#f43f5e", employeeHidden: true },
  { to: "/audit-logs",  title: "Audit",      icon: History,         from: "#64748b", to2: "#94a3b8", adminManagerOnly: true },
  { to: "/settings",    title: "Settings",   icon: SlidersHorizontal, from: "#a3a3a3", to2: "#e5e7eb" },
];

export default function GradientMenu() {
  const { user } = useAuth();
  const restricted = user?.role === "employee" || user?.role === "pending";
  const role = user?.role;
  const visibleItems = items.filter((it) => {
    if (restricted && it.employeeHidden) return false;
    if (it.adminManagerOnly && role !== "admin" && role !== "manager") return false;
    return true;
  });
  return (
    <ul
      data-testid="gradient-menu"
      className="flex flex-nowrap gap-2 items-center justify-center px-3 py-2.5 rounded-full border border-white/10 bg-zinc-950/60 backdrop-blur-xl shadow-[0_20px_60px_-20px_rgba(0,0,0,0.8)] w-fit mx-auto"
    >
      {visibleItems.map(({ to, title, icon: Icon, from, to2 }) => (
        <li key={to} style={{ "--from": from, "--to": to2 }} className="relative shrink-0">
          <NavLink
            to={to}
            end={to === "/"}
            data-testid={`nav-${title.toLowerCase()}`}
            className={({ isActive }) =>
              `relative flex items-center justify-center rounded-full overflow-hidden transition-[width,box-shadow] duration-500 ease-out group cursor-pointer h-10 ${
                isActive
                  ? "w-[128px] px-3 text-white shadow-[0_10px_30px_-8px_var(--from)]"
                  : "w-10 hover:w-[128px] hover:px-3 bg-zinc-900/80 border border-white/10 text-zinc-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <span
                  className={`absolute inset-0 rounded-full transition-opacity duration-500 ${
                    isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                  }`}
                  style={{
                    background:
                      "linear-gradient(45deg, var(--from), var(--to))",
                  }}
                />
                <span
                  className={`pointer-events-none absolute inset-x-0 top-2 h-full rounded-full blur-[18px] -z-10 transition-opacity duration-500 ${
                    isActive ? "opacity-60" : "opacity-0 group-hover:opacity-40"
                  }`}
                  style={{
                    background:
                      "linear-gradient(45deg, var(--from), var(--to))",
                  }}
                />
                <span className="relative z-10 flex items-center justify-center gap-1.5 w-full">
                  <Icon
                    className={`h-[18px] w-[18px] shrink-0 transition-all duration-500 ${
                      isActive ? "text-white" : "text-zinc-300"
                    }`}
                  />
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-widest whitespace-nowrap transition-[max-width,opacity] duration-500 overflow-hidden ${
                      isActive
                        ? "max-w-[90px] opacity-100"
                        : "max-w-0 opacity-0 group-hover:max-w-[90px] group-hover:opacity-100"
                    }`}
                  >
                    {title}
                  </span>
                </span>
              </>
            )}
          </NavLink>
        </li>
      ))}
    </ul>
  );
}
