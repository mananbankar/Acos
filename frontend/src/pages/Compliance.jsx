import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import FileUploader from "@/components/FileUploader";
import AddRecordDialog from "@/components/AddRecordDialog";
import CsvImportButton from "@/components/CsvImportButton";
import CsvExportButton from "@/components/CsvExportButton";
import { useAuth } from "@/context/AuthContext";
import { Paperclip, Trash2 } from "lucide-react";
import { toast } from "sonner";

const contractFields = [
  { name: "title", label: "Contract title", required: true, defaultValue: "" },
  { name: "party", label: "Counterparty", required: true, defaultValue: "" },
  { name: "expires", label: "Expiry date", type: "date", required: true, defaultValue: "" },
  { name: "risk", label: "Risk level", options: ["low", "medium", "high"], defaultValue: "low" },
];

const riskPill = (r) => {
  const map = { low: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", medium: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", high: "bg-pink-500/10 text-pink-400 border-pink-500/30" };
  return `px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border ${map[r]}`;
};

export default function Compliance() {
  const [contracts, setContracts] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "manager";
  const load = () => api.get("/compliance/contracts").then((r) => { setContracts(r.data); setError(null); }).catch((e) => setError(e?.response?.status === 403 ? "Your role can't view Compliance." : "Failed to load."));
  useEffect(() => { load(); }, []);
  const del = async (id) => { try { await api.delete(`/compliance/contracts/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  if (error) return <div data-testid="compliance-page"><PageHeader eyebrow="Legal & Risk" title="Compliance" /><div className="p-6 rounded-2xl border border-pink-500/30 bg-pink-500/5 text-pink-300 text-sm">{error}</div></div>;
  return (
    <div data-testid="compliance-page">
      <PageHeader eyebrow="Legal & Risk" title="Compliance">
        {canWrite && (
          <div className="flex gap-2">
            <CsvImportButton collection="contracts" onImported={load} label="Import CSV" />
            <CsvExportButton collection="contracts" />
            <AddRecordDialog
              testid="add-contract-btn"
              endpoint="/compliance/contracts"
              title="Add Contract"
              buttonLabel="Add contract"
              fields={contractFields}
              onSaved={load}
            />
          </div>
        )}
      </PageHeader>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">
            <tr className="border-b border-white/10"><th className="text-left py-2">Title</th><th className="text-left">Party</th><th className="text-left">Expires</th><th className="text-left">Risk</th><th className="text-right">Docs</th></tr>
          </thead>
          <tbody>
            {contracts.map((c) => (
              <tr key={c.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 font-medium">{c.title}</td>
                <td className="text-zinc-400">{c.party}</td>
                <td className="font-mono-i text-zinc-300">{c.expires}</td>
                <td><span className={riskPill(c.risk)}>{c.risk}</span></td>
                <td className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {(c.attachments?.length || 0) > 0 && (<span className="inline-flex items-center gap-1 text-xs text-cyan-400"><Paperclip className="w-3 h-3" /> {c.attachments.length}</span>)}
                    <FileUploader attachTo={`contract:${c.id}`} onUploaded={load} />
                    {canWrite && <button onClick={() => del(c.id)} data-testid={`del-contract-${c.id}`} className="p-1.5 rounded text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"><Trash2 className="w-3.5 h-3.5" /></button>}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
