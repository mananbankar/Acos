import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Bot, Play, ChevronRight, Loader2, Trash2, CornerDownRight, Send } from "lucide-react";

function FollowUpBox({ taskId, agentKey, onReplied }) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (!q.trim()) return;
    setBusy(true);
    try {
      const { data } = await api.post(`/agents/tasks/${taskId}/follow-up`, { question: q });
      toast.success(`Reply · ${data.confidence}%`);
      onReplied?.(data);
      setQ("");
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); } finally { setBusy(false); }
  };
  return (
    <div className="mt-3 flex items-center gap-2">
      <CornerDownRight className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && send()}
        data-testid={`follow-input-${taskId}`}
        placeholder={`Ask ${agentKey} a follow-up…`}
        className="flex-1 px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 focus:border-cyan-400 outline-none text-xs"
      />
      <button
        onClick={send}
        disabled={busy || !q.trim()}
        data-testid={`follow-send-${taskId}`}
        className="p-1.5 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-400 hover:bg-cyan-500/20 disabled:opacity-50"
      >
        {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
}

export default function Agents() {
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [goal, setGoal] = useState("Review today's operations and produce a digest.");
  const [running, setRunning] = useState(false);
  const [context, setContext] = useState(null);

  const loadAgents = () => api.get("/agents").then((r) => setAgents(r.data));
  useEffect(() => { loadAgents(); }, []);

  const loadTasks = () => {
    if (!selected) return;
    api.get(`/agents/${selected.key}/tasks`).then((r) => setTasks(r.data));
  };

  useEffect(() => {
    if (!selected) { setContext(null); return; }
    loadTasks();
    api.get(`/agents/${selected.key}/context`).then((r) => setContext(r.data)).catch(() => setContext({}));
  }, [selected]);

  const runAgent = async () => {
    if (!selected) return;
    setRunning(true);
    try {
      const { data } = await api.post(`/agents/${selected.key}/run`, { goal });
      toast.success(`${selected.name} ran — confidence ${data.confidence}%${data.escalate ? " (escalated)" : ""}`);
      setTasks((t) => [data, ...t]);
      loadAgents();
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Agent run failed");
    } finally { setRunning(false); }
  };

  const deleteTask = async (taskId) => {
    try {
      await api.delete(`/agents/tasks/${taskId}`);
      toast.success("Task deleted");
      loadTasks();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to delete"); }
  };

  // Group tasks with their follow-ups (parent first, replies threaded under it)
  const rootTasks = tasks.filter((t) => !t.parent_id);
  const replies = tasks.filter((t) => t.parent_id);
  const repliesOf = (id) => replies.filter((r) => r.parent_id === id).sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return (
    <div className="space-y-6" data-testid="agents-page">
      <header className="flex items-end justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-mono-i">Multi-agent System</div>
          <h1 className="font-display text-4xl font-black tracking-tighter mt-1">Agents</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Agent list */}
        <div className="lg:col-span-4 space-y-3">
          {agents.map((a) => (
            <button
              key={a.id}
              data-testid={`agent-card-${a.key}`}
              onClick={() => setSelected(a)}
              className={`w-full text-left p-5 rounded-2xl border transition-colors ${
                selected?.key === a.key ? "border-cyan-400/60 bg-cyan-500/5" : "border-white/10 bg-zinc-900/60 hover:border-white/20"
              }`}
            >
              <div className="flex items-center gap-3">
                <div className="relative">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-400 to-pink-500 flex items-center justify-center">
                    <Bot className="w-5 h-5 text-black" />
                  </div>
                  {a.status === "active" && <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-emerald-400 border-2 border-zinc-900" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-display font-bold text-lg leading-tight">{a.name}</div>
                  <div className="text-xs text-zinc-500 truncate">{a.specialty}</div>
                </div>
                <ChevronRight className="w-4 h-4 text-zinc-600" />
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="flex-1 h-1 bg-white/5 rounded-full overflow-hidden">
                  <div className="h-full bg-gradient-to-r from-cyan-400 to-pink-500" style={{ width: `${a.last_confidence ?? a.confidence}%` }} />
                </div>
                <div className="text-xs font-mono-i text-zinc-400">{a.last_confidence ?? a.confidence}%</div>
              </div>
            </button>
          ))}
        </div>

        {/* Detail */}
        <div className="lg:col-span-8">
          {!selected && (
            <div className="rounded-2xl border border-dashed border-white/10 p-16 text-center text-zinc-500">
              Select an agent to run tasks and inspect its reasoning log.
            </div>
          )}
          {selected && (
            <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 space-y-6">
              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i">Selected agent</div>
                <h2 className="font-display text-3xl font-black tracking-tight mt-1">{selected.name}</h2>
                <p className="text-sm text-zinc-400 mt-1">{selected.specialty}</p>
              </div>

              <div>
                <label className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i">Goal</label>
                <textarea
                  data-testid="agent-goal-input"
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  rows={3}
                  className="w-full mt-2 px-4 py-3 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm"
                />
                <button
                  onClick={runAgent}
                  disabled={running}
                  data-testid="run-agent-btn"
                  className="mt-3 inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-bold text-xs uppercase tracking-widest disabled:opacity-50"
                >
                  {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                  {running ? "Reasoning…" : "Run agent"}
                </button>
              </div>

              {context && Object.keys(context).length > 0 && (
                <div data-testid="agent-context" className="rounded-xl border border-cyan-500/20 bg-cyan-500/[0.03] p-4">
                  <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400 font-mono-i mb-2">Data feed · agent will reason over these records</div>
                  <div className="flex flex-wrap gap-2">
                    {Object.entries(context).map(([k, v]) => (
                      <span key={k} className="px-3 py-1 rounded-full border border-white/10 bg-black/30 text-xs text-zinc-300 font-mono-i">
                        {k}: <span className="text-white font-bold">{Array.isArray(v) ? v.length : (typeof v === "object" ? Object.keys(v).length : String(v))}</span>
                      </span>
                    ))}
                  </div>
                  <details className="mt-3">
                    <summary className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i cursor-pointer hover:text-zinc-300">Show raw JSON</summary>
                    <pre className="mt-2 max-h-[200px] overflow-auto text-[11px] text-zinc-400 bg-black/40 p-3 rounded-lg font-mono-i">{JSON.stringify(context, null, 2)}</pre>
                  </details>
                </div>
              )}

              <div>
                <div className="text-[10px] uppercase tracking-[0.25em] text-zinc-500 font-mono-i mb-3">Reasoning stream</div>
                <div className="space-y-3 max-h-[600px] overflow-y-auto pr-2">
                  {rootTasks.length === 0 && <div className="text-sm text-zinc-500">No runs yet.</div>}
                  {rootTasks.map((t) => (
                    <div key={t.id} data-testid={`task-${t.id}`} className="p-4 rounded-xl border border-white/10 bg-black/30 group">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono-i">{new Date(t.created_at).toLocaleString()}</span>
                        <div className="flex items-center gap-2">
                          <span className={`text-[10px] uppercase tracking-widest font-mono-i ${t.escalate ? "text-pink-400" : "text-emerald-400"}`}>
                            {t.escalate ? "Escalated" : "Completed"} · {t.confidence}%
                          </span>
                          <button
                            onClick={() => deleteTask(t.id)}
                            data-testid={`del-task-${t.id}`}
                            className="p-1.5 rounded border border-white/10 text-zinc-400 hover:text-pink-400 hover:border-pink-500/40 hover:bg-pink-500/10 transition-colors"
                            title="Delete task"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                      <div className="text-sm text-zinc-300 whitespace-pre-wrap font-mono-i">{t.reasoning}</div>

                      {/* Follow-up thread */}
                      {repliesOf(t.id).map((r) => (
                        <div key={r.id} className="mt-3 ml-4 pl-4 border-l-2 border-cyan-500/30 group/reply relative">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono-i">
                              Follow-up · {new Date(r.created_at).toLocaleTimeString()}
                            </span>
                            <div className="flex items-center gap-2">
                              <span className={`text-[10px] uppercase tracking-widest font-mono-i ${r.escalate ? "text-pink-400" : "text-emerald-400"}`}>{r.confidence}%</span>
                              <button
                                onClick={() => deleteTask(r.id)}
                                className="opacity-0 group-hover/reply:opacity-100 transition-opacity p-1 rounded text-zinc-500 hover:text-pink-400 hover:bg-pink-500/10"
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                          <div className="text-[11px] text-zinc-500 font-mono-i mb-1.5">Q: {r.goal}</div>
                          <div className="text-xs text-zinc-300 whitespace-pre-wrap font-mono-i">{r.reasoning}</div>
                        </div>
                      ))}

                      <FollowUpBox taskId={t.id} agentKey={selected.key} onReplied={loadTasks} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

