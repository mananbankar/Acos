import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Users, Wallet, Boxes, ScrollText, Bot, Sparkles, TrendingUp, AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";

const KPI = ({ icon: Icon, label, value, tint = "cyan", suffix = "", testid }) => (
  <div data-testid={testid} className="relative overflow-hidden rounded-2xl border border-white/10 bg-zinc-900/60 p-6 hover:border-white/20 transition-colors">
    <div className={`absolute -top-10 -right-10 w-32 h-32 rounded-full blur-3xl opacity-30 bg-${tint}-500`} />
    <div className="relative flex items-start justify-between">
      <div className={`p-2 rounded-lg bg-${tint}-500/10 text-${tint}-400`}>
        <Icon className="w-5 h-5" />
      </div>
      <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">Live</div>
    </div>
    <div className="relative mt-6">
      <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i">{label}</div>
      <div className="mt-2 font-display font-black text-4xl tracking-tighter text-white">
        {value}{suffix}
      </div>
    </div>
  </div>
);

export default function Dashboard() {
  const { user } = useAuth();
  const canSeeApprovals = user?.role !== "employee" && user?.role !== "pending";
  const [kpis, setKpis] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [approvals, setApprovals] = useState([]);

  useEffect(() => {
    api.get("/dashboard/kpis").then((r) => setKpis(r.data)).catch(() => {});
    api.get("/analytics/summary").then((r) => setAnalytics(r.data)).catch(() => {});
    api.get("/approvals")
      .then((r) => setApprovals((r.data || []).filter((x) => x.status === "pending").slice(0, 4)))
      .catch(() => setApprovals([])); // employees are 403 here — show nothing gracefully
  }, []);

  return (
    <div className="space-y-8" data-testid="dashboard-page">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-zinc-900 to-zinc-950 p-8 md:p-12">
        <div className="absolute inset-0 acos-grid-bg opacity-40" />
        <div className="absolute -top-20 -right-20 w-[400px] h-[400px] acos-aurora rounded-full opacity-60" />
        <div className="relative">
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-mono-i mb-3">Command Center</div>
          <h1 className="font-display text-4xl md:text-6xl font-black tracking-tighter">
            The agents ran <span className="bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">247 tasks</span> today.
          </h1>
          <p className="mt-4 text-zinc-400 max-w-2xl">Human approvals needed on {kpis?.pending_approvals ?? "—"} decisions. Average agent confidence {kpis?.confidence_avg ?? "—"}%.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            {canSeeApprovals && (
              <Link to="/approvals" data-testid="review-approvals-cta" className="px-6 py-3 rounded-full bg-white text-black font-bold text-xs uppercase tracking-widest hover:bg-cyan-300 transition-colors">
                Review approvals
              </Link>
            )}
            <Link to="/agents" className="px-6 py-3 rounded-full border border-white/15 bg-white/5 backdrop-blur text-white/90 font-bold text-xs uppercase tracking-widest hover:bg-white/10 transition-colors">
              View agents
            </Link>
          </div>
        </div>
      </section>

      {/* KPIs */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPI testid="kpi-employees" icon={Users} label="Employees" value={kpis?.employees ?? "—"} tint="cyan" />
        <KPI testid="kpi-revenue" icon={Wallet} label="Revenue MTD" value={kpis ? `$${(kpis.revenue ?? 0).toLocaleString()}` : "—"} tint="pink" />
        <KPI testid="kpi-stock" icon={Boxes} label="SKUs Tracked" value={kpis?.inventory_items ?? "—"} tint="cyan" />
        <KPI testid="kpi-pending" icon={ScrollText} label="Pending Approvals" value={kpis?.pending_approvals ?? "—"} tint="pink" />
      </section>

      {/* Approval queue + anomalies */}
      <section className={`grid grid-cols-1 gap-6 ${canSeeApprovals ? "lg:grid-cols-3" : ""}`}>
        {canSeeApprovals && (
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i">Pending human sign-off</div>
              <h3 className="font-display text-2xl font-bold mt-1">Approval Queue</h3>
            </div>
            <Link to="/approvals" className="text-xs uppercase tracking-widest text-cyan-400 hover:text-cyan-300 font-mono-i">Open →</Link>
          </div>
          <div className="space-y-3">
            {approvals.length === 0 && <div className="text-zinc-500 text-sm">No approvals pending. Nice.</div>}
            {approvals.map((a) => (
              <div key={a.id} className="flex items-start gap-4 p-4 rounded-xl border border-white/10 bg-black/20 hover:border-white/20 transition-colors">
                <div className="relative w-2.5 h-2.5 rounded-full mt-2 text-pink-500 acos-pulse-ring bg-pink-500" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-white truncate">{a.title}</div>
                  <div className="text-xs text-zinc-500 mt-1 line-clamp-2">{a.summary}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">Conf</div>
                  <div className="font-display font-black text-lg text-white">{a.confidence}%</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        )}

        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-2 mb-6">
            <AlertTriangle className="w-4 h-4 text-pink-400" />
            <div>
              <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i">Signals</div>
              <h3 className="font-display text-2xl font-bold">Anomalies</h3>
            </div>
          </div>
          <div className="space-y-3">
            {analytics?.anomalies?.map((an) => (
              <div key={an.id} className="p-3 rounded-lg border border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono-i">{an.module}</span>
                  <span className={`text-[10px] uppercase tracking-widest font-mono-i ${an.severity === "high" ? "text-pink-400" : an.severity === "medium" ? "text-yellow-400" : "text-zinc-500"}`}>{an.severity}</span>
                </div>
                <div className="text-sm text-zinc-200 mt-1.5">{an.message}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Agent overview strip */}
      <section className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
        <div className="flex items-center gap-2 mb-6">
          <Bot className="w-4 h-4 text-cyan-400" />
          <h3 className="font-display text-2xl font-bold">Agent Confidence</h3>
          <div className="ml-auto flex items-center gap-2 text-emerald-400 text-xs font-mono-i uppercase tracking-widest">
            <TrendingUp className="w-3.5 h-3.5" /> +6% w/w
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {["Orchestrator","HR","Finance","Inventory","Sales","Compliance"].map((n, i) => {
            const conf = [92, 88, 84, 91, 79, 86][i];
            return (
              <div key={n} className="p-4 rounded-xl border border-white/10 bg-black/20">
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{n}</div>
                <div className="font-display font-black text-3xl mt-1">{conf}<span className="text-lg text-zinc-500">%</span></div>
                <div className="h-1 mt-3 rounded-full bg-white/5 overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-pink-500" style={{ width: `${conf}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
