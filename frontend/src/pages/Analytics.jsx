import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, BarChart, Bar, CartesianGrid, Legend } from "recharts";

export default function Analytics() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get("/analytics/summary").then((r) => setData(r.data)); }, []);
  if (!data) return <div className="text-zinc-500">Loading…</div>;
  const chartData = data.months.map((m, i) => ({ month: m, Revenue: data.revenue[i], Approvals: data.approvals[i], AgentRuns: data.agent_runs[i] }));
  return (
    <div data-testid="analytics-page">
      <PageHeader eyebrow="Insights" title="Analytics & Reports" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h3 className="font-display text-xl font-bold mb-4">Revenue Trend</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Line type="monotone" dataKey="Revenue" stroke="#06b6d4" strokeWidth={2.5} dot={{ fill: "#06b6d4", r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <h3 className="font-display text-xl font-bold mb-4">Agent Runs vs Approvals</h3>
          <div className="h-[280px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="month" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8 }} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="AgentRuns" fill="#06b6d4" radius={[6, 6, 0, 0]} />
                <Bar dataKey="Approvals" fill="#ec4899" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
      <div className="mt-6 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
        <h3 className="font-display text-xl font-bold mb-4">Anomalies Detected</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {data.anomalies.map((a) => (
            <div key={a.id} className="p-4 rounded-xl border border-white/10 bg-black/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono-i">{a.module}</span>
                <span className={`text-[10px] uppercase tracking-widest font-mono-i ${a.severity === "high" ? "text-pink-400" : a.severity === "medium" ? "text-yellow-400" : "text-zinc-500"}`}>{a.severity}</span>
              </div>
              <div className="text-sm text-zinc-200 mt-2">{a.message}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
