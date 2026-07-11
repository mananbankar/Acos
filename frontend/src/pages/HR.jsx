import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import AddRecordDialog from "@/components/AddRecordDialog";
import CsvImportButton from "@/components/CsvImportButton";
import { useAuth } from "@/context/AuthContext";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

const statusPill = (s) => {
  const map = {
    present: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    on_leave: "bg-yellow-500/10 text-yellow-400 border-yellow-500/30",
    remote: "bg-cyan-500/10 text-cyan-400 border-cyan-500/30",
    approved: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    pending: "bg-pink-500/10 text-pink-400 border-pink-500/30",
  };
  return `px-2 py-0.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border ${map[s] || "bg-white/5 text-zinc-400 border-white/10"}`;
};

const empFields = [
  { name: "name", label: "Name", required: true, defaultValue: "" },
  { name: "email", label: "Email", type: "email", required: true, defaultValue: "" },
  { name: "role", label: "Role", defaultValue: "Engineer" },
  { name: "team", label: "Team", defaultValue: "Engineering" },
  { name: "status", label: "Status", options: ["present", "on_leave", "remote"], defaultValue: "present" },
  { name: "attendance", label: "Attendance %", type: "number", defaultValue: 100 },
];
const leaveFields = [
  { name: "employee", label: "Employee name", required: true, defaultValue: "" },
  { name: "type", label: "Type", options: ["Vacation", "Sick leave", "Personal", "Unpaid"], defaultValue: "Vacation" },
  { name: "days", label: "Days", type: "number", defaultValue: 1 },
  { name: "start", label: "Start date", type: "date", defaultValue: "" },
  { name: "status", label: "Status", options: ["pending", "approved"], defaultValue: "pending" },
];

export default function HR() {
  const [emps, setEmps] = useState([]);
  const [leaves, setLeaves] = useState([]);
  const { user } = useAuth();
  const canWrite = user?.role === "admin" || user?.role === "manager";

  const loadEmps = () => api.get("/hr/employees").then((r) => setEmps(r.data));
  const loadLeaves = () => api.get("/hr/leaves").then((r) => setLeaves(r.data));
  useEffect(() => { loadEmps(); loadLeaves(); }, []);

  const del = async (path, id, reload) => {
    try { await api.delete(`${path}/${id}`); toast.success("Deleted"); reload(); }
    catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  return (
    <div data-testid="hr-page">
      <PageHeader eyebrow="Workforce" title="HR & People">
        {canWrite && <CsvImportButton collection="employees" onImported={loadEmps} label="Import employees CSV" />}
      </PageHeader>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold">Employees</h3>
            {canWrite && <AddRecordDialog endpoint="/hr/employees" title="Add Employee" buttonLabel="Add employee" testid="add-employee-btn" fields={empFields} onSaved={loadEmps} />}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">
                <tr className="border-b border-white/10">
                  <th className="text-left py-2">Name</th><th className="text-left">Role</th><th className="text-left">Team</th><th className="text-left">Attendance</th><th className="text-left">Status</th>{canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {emps.map((e) => (
                  <tr key={e.id} className="border-b border-white/5 hover:bg-white/[0.02]">
                    <td className="py-3 font-medium">{e.name}</td>
                    <td className="text-zinc-400">{e.role}</td>
                    <td className="text-zinc-400">{e.team}</td>
                    <td>
                      <div className="flex items-center gap-2 max-w-[140px]">
                        <div className="flex-1 h-1 bg-white/5 rounded"><div className="h-full bg-cyan-400 rounded" style={{ width: `${e.attendance}%` }} /></div>
                        <span className="text-xs font-mono-i text-zinc-400">{e.attendance}%</span>
                      </div>
                    </td>
                    <td><span className={statusPill(e.status)}>{e.status}</span></td>
                    {canWrite && (
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <AddRecordDialog endpoint="/hr/employees" title="Employee" fields={empFields} initialValues={e} onSaved={loadEmps} testid={`edit-emp-${e.id}`} />
                          <button onClick={() => del("/hr/employees", e.id, loadEmps)} data-testid={`del-emp-${e.id}`} className="p-1.5 rounded text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"><Trash2 className="w-3.5 h-3.5" /></button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-display text-xl font-bold">Leave Requests</h3>
            {canWrite && <AddRecordDialog endpoint="/hr/leaves" title="New leave request" buttonLabel="Add" testid="add-leave-btn" fields={leaveFields} onSaved={loadLeaves} />}
          </div>
          <div className="space-y-3">
            {leaves.map((l) => (
              <div key={l.id} className="p-3 rounded-lg border border-white/10 bg-black/20">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{l.employee}</span>
                  <div className="flex items-center gap-1">
                    <span className={statusPill(l.status)}>{l.status}</span>
                    {canWrite && (
                      <>
                        <AddRecordDialog endpoint="/hr/leaves" title="Leave" fields={leaveFields} initialValues={l} onSaved={loadLeaves} testid={`edit-leave-${l.id}`} />
                        <button onClick={() => del("/hr/leaves", l.id, loadLeaves)} data-testid={`del-leave-${l.id}`} className="p-1 rounded text-zinc-500 hover:text-pink-400"><Trash2 className="w-3 h-3" /></button>
                      </>
                    )}
                  </div>
                </div>
                <div className="text-xs text-zinc-500 mt-1">{l.type} · {l.days} days · from {l.start}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
