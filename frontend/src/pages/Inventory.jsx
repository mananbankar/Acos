import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import AddRecordDialog from "@/components/AddRecordDialog";
import CsvImportButton from "@/components/CsvImportButton";
import { useAuth } from "@/context/AuthContext";
import { AlertTriangle, Trash2 } from "lucide-react";
import { toast } from "sonner";

const invFields = [
  { name: "sku", label: "SKU code", required: true, defaultValue: "" },
  { name: "name", label: "Item name", required: true, defaultValue: "" },
  { name: "stock", label: "Current stock", type: "number", required: true, defaultValue: 0 },
  { name: "reorder_at", label: "Reorder threshold", type: "number", required: true, defaultValue: 10 },
  { name: "supplier", label: "Supplier", required: true, defaultValue: "" },
];

export default function Inventory() {
  const [items, setItems] = useState([]);
  const { user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "manager";
  const load = () => api.get("/inventory").then((r) => setItems(r.data));
  useEffect(() => { load(); }, []);
  const del = async (id) => { try { await api.delete(`/inventory/${id}`); toast.success("Deleted"); load(); } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } };
  return (
    <div data-testid="inventory-page">
      <PageHeader eyebrow="Supply Chain" title="Inventory">
        {canWrite && (
          <div className="flex gap-2">
            <CsvImportButton collection="inventory" onImported={load} label="Import CSV" />
            <AddRecordDialog
              testid="add-inventory-btn"
              endpoint="/inventory"
              title="Add SKU"
              buttonLabel="Add SKU"
              fields={invFields}
              onSaved={load}
            />
          </div>
        )}
      </PageHeader>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {items.map((i) => {
          const critical = i.stock <= i.reorder_at;
          const pct = Math.min(100, Math.round((i.stock / Math.max(1, i.reorder_at * 2)) * 100));
          return (
            <div key={i.id} className={`p-5 rounded-2xl border ${critical ? "border-pink-500/40 bg-pink-500/[0.03]" : "border-white/10 bg-zinc-900/60"}`}>
              <div className="flex items-start justify-between">
                <div>
                  <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{i.sku}</div>
                  <div className="font-display font-bold text-lg mt-1">{i.name}</div>
                </div>
                <div className="flex items-center gap-2">
                  {critical && <AlertTriangle className="w-5 h-5 text-pink-400" />}
                  {canWrite && <AddRecordDialog endpoint="/inventory" title="SKU" fields={invFields} initialValues={i} onSaved={load} testid={`edit-sku-${i.id}`} />}
                  {canWrite && <button onClick={() => del(i.id)} data-testid={`del-sku-${i.id}`} className="p-1.5 rounded text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"><Trash2 className="w-3.5 h-3.5" /></button>}
                </div>
              </div>
              <div className="mt-4">
                <div className="flex items-baseline justify-between">
                  <div className="font-display font-black text-3xl">{i.stock}</div>
                  <div className="text-xs text-zinc-500">reorder ≤ {i.reorder_at}</div>
                </div>
                <div className="h-1.5 mt-2 bg-white/5 rounded overflow-hidden">
                  <div className={`h-full ${critical ? "bg-pink-500" : "bg-cyan-400"}`} style={{ width: `${pct}%` }} />
                </div>
                <div className="text-xs text-zinc-500 mt-3">Supplier: <span className="text-zinc-300">{i.supplier}</span></div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
