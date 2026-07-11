import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import AddRecordDialog from "@/components/AddRecordDialog";
import CsvImportButton from "@/components/CsvImportButton";
import { useAuth } from "@/context/AuthContext";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const leadFields = [
  { name: "name", label: "Company", required: true, defaultValue: "" },
  { name: "contact", label: "Contact person", required: true, defaultValue: "" },
  { name: "score", label: "Lead score (0-100)", type: "number", defaultValue: 60 },
  { name: "stage", label: "Stage", options: ["qualification", "discovery", "proposal", "negotiation"], defaultValue: "qualification" },
  { name: "value", label: "Deal value (USD)", type: "number", defaultValue: 0 },
];

const stagePill = (s) => {
  const map = {
    proposal: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    discovery: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    qualification: "bg-white/5 text-zinc-400 border-white/10",
    negotiation: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  };
  return `px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border ${map[s]}`;
};

export default function Sales() {
  const [leads, setLeads] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "manager";
  const load = () => api.get("/sales/leads").then((r) => { setLeads(r.data); setError(null); }).catch((e) => setError(e?.response?.status === 403 ? "Your role can't view Sales." : "Failed to load."));
  useEffect(() => { load(); }, []);
  const del = async (id) => { try { await api.delete(`/sales/leads/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  const stages = ["qualification", "discovery", "proposal", "negotiation"];
  if (error) return <div data-testid="sales-page"><PageHeader eyebrow="Pipeline" title="Sales & CRM" /><div className="p-6 rounded-2xl border border-pink-500/30 bg-pink-500/5 text-pink-300 text-sm">{error}</div></div>;
  return (
    <div data-testid="sales-page">
      <PageHeader eyebrow="Pipeline" title="Sales & CRM">
        {canWrite && (
          <div className="flex gap-2">
            <CsvImportButton collection="leads" onImported={load} label="Import CSV" />
            <AddRecordDialog
              testid="add-lead-btn"
              endpoint="/sales/leads"
              title="Add Lead"
              buttonLabel="Add lead"
              fields={leadFields}
              onSaved={load}
            />
          </div>
        )}
      </PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {stages.map((st) => (
          <div key={st} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-4 min-h-[280px]">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i mb-3">{st}</div>
            <div className="space-y-3">
              {leads.filter((l) => l.stage === st).map((l) => (
                <div key={l.id} className="p-3 rounded-xl border border-white/10 bg-black/30">
                  <div className="flex items-start justify-between">
                    <div className="font-display font-bold text-sm">{l.name}</div>
                    <div className="flex items-center gap-1">
                      <span className={stagePill(st)}>{l.score}</span>
                      {canWrite && (
                        <>
                          <AddRecordDialog endpoint="/sales/leads" title="Lead" fields={leadFields} initialValues={l} onSaved={load} testid={`edit-lead-${l.id}`} />
                          <button onClick={() => del(l.id)} data-testid={`del-lead-${l.id}`} className="p-1 rounded text-zinc-500 hover:text-pink-400"><Trash2 className="w-3 h-3" /></button>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{l.contact}</div>
                  <div className="text-xs text-zinc-300 font-mono-i mt-2">${(l.value ?? 0).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
