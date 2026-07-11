import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [q, setQ] = useState("");
  useEffect(() => { api.get("/audit-logs").then((r) => setLogs(r.data)); }, []);
  const filtered = logs.filter((l) => {
    const s = `${l.actor} ${l.action} ${l.module} ${l.details}`.toLowerCase();
    return s.includes(q.toLowerCase());
  });
  return (
    <div data-testid="audit-page">
      <PageHeader eyebrow="Accountability" title="Audit Logs">
        <input data-testid="audit-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="px-4 py-2 rounded-lg bg-zinc-900 border border-white/10 text-sm focus:border-cyan-400 outline-none" />
      </PageHeader>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 overflow-hidden">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i bg-black/30">
            <tr><th className="text-left px-4 py-3">Timestamp</th><th className="text-left">Actor</th><th className="text-left">Module</th><th className="text-left">Action</th><th className="text-left px-4">Details</th></tr>
          </thead>
          <tbody>
            {filtered.map((l) => (
              <tr key={l.id} className="border-t border-white/5 hover:bg-white/[0.02]">
                <td className="px-4 py-3 font-mono-i text-xs text-zinc-500">{new Date(l.timestamp).toLocaleString()}</td>
                <td className="text-cyan-400 font-mono-i text-xs">{l.actor}</td>
                <td className="text-zinc-400 text-xs uppercase tracking-widest font-mono-i">{l.module}</td>
                <td className="text-zinc-300 text-xs">{l.action}</td>
                <td className="px-4 text-zinc-300">{l.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
