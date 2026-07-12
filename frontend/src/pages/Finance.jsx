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

const statusPill = (s) => {
  const map = { paid: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30", unpaid: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30", overdue: "bg-pink-500/10 text-pink-400 border-pink-500/30" };
  return `px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border ${map[s] || "bg-white/5 text-zinc-400 border-white/10"}`;
};

const invoiceFields = [
  { name: "number", label: "Invoice number", required: true, defaultValue: "" },
  { name: "vendor", label: "Vendor", required: true, defaultValue: "" },
  { name: "amount", label: "Amount (USD)", type: "number", required: true, defaultValue: 0 },
  { name: "due", label: "Due date", type: "date", required: true, defaultValue: "" },
  { name: "status", label: "Status", options: ["unpaid", "paid", "overdue"], defaultValue: "unpaid" },
];

export default function Finance() {
  const [invoices, setInvoices] = useState([]);
  const [error, setError] = useState(null);
  const { user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "manager";
  const load = () => api.get("/finance/invoices").then((r) => { setInvoices(r.data); setError(null); }).catch((e) => setError(e?.response?.status === 403 ? "Your role can't view Finance." : "Failed to load."));
  useEffect(() => { load(); }, []);
  const del = async (id) => { try { await api.delete(`/finance/invoices/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  if (error) return <div data-testid="finance-page"><PageHeader eyebrow="Cashflow" title="Finance" /><div className="p-6 rounded-2xl border border-pink-500/30 bg-pink-500/5 text-pink-300 text-sm">{error}</div></div>;
  const paid = invoices.filter((i) => i.status === "paid").reduce((s, i) => s + i.amount, 0);
  const outstanding = invoices.filter((i) => i.status !== "paid").reduce((s, i) => s + i.amount, 0);
  return (
    <div data-testid="finance-page">
      <PageHeader eyebrow="Cashflow" title="Finance">
        {canWrite && (
          <div className="flex gap-2">
            <CsvImportButton collection="invoices" onImported={load} label="Import CSV" />
            <CsvExportButton collection="invoices" />
            <AddRecordDialog
              testid="add-invoice-btn"
              endpoint="/finance/invoices"
              title="Add Invoice"
              buttonLabel="Add invoice"
              fields={invoiceFields}
              onSaved={load}
            />
          </div>
        )}
      </PageHeader>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { label: "Paid", value: `$${paid.toLocaleString()}` },
          { label: "Outstanding", value: `$${outstanding.toLocaleString()}` },
          { label: "Invoices", value: invoices.length },
          { label: "Overdue", value: invoices.filter((i) => i.status === "overdue").length },
        ].map((k) => (
          <div key={k.label} className="p-5 rounded-xl border border-white/10 bg-zinc-900/60">
            <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{k.label}</div>
            <div className="font-display font-black text-3xl mt-1">{k.value}</div>
          </div>
        ))}
      </div>
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 overflow-x-auto">
        <h3 className="font-display text-xl font-bold mb-4">Invoices</h3>
        <table className="w-full text-sm">
          <thead className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">
            <tr className="border-b border-white/10"><th className="text-left py-2">Number</th><th className="text-left">Vendor</th><th className="text-right">Amount</th><th className="text-left">Due</th><th className="text-left">Status</th><th className="text-right">Files</th></tr>
          </thead>
          <tbody>
            {invoices.map((i) => (
              <tr key={i.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                <td className="py-3 font-mono-i text-zinc-300">{i.number}</td>
                <td>{i.vendor}</td>
                <td className="text-right font-display font-bold">${(i.amount ?? 0).toLocaleString()}</td>
                <td className="text-zinc-400">{i.due}</td>
                <td><span className={statusPill(i.status)}>{i.status}</span></td>
                <td className="text-right">
                  <div className="flex items-center gap-2 justify-end">
                    {(i.attachments?.length || 0) > 0 && (<span className="inline-flex items-center gap-1 text-xs text-cyan-400"><Paperclip className="w-3 h-3" /> {i.attachments.length}</span>)}
                    <FileUploader attachTo={`invoice:${i.id}`} onUploaded={load} />
                    {canWrite && <AddRecordDialog endpoint="/finance/invoices" title="Invoice" fields={invoiceFields} initialValues={i} onSaved={load} testid={`edit-invoice-${i.id}`} />}
                    {canWrite && <button onClick={() => del(i.id)} data-testid={`del-invoice-${i.id}`} className="p-1.5 rounded text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"><Trash2 className="w-3.5 h-3.5" /></button>}
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
