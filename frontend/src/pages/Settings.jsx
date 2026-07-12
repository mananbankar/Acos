import React, { useEffect, useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { api } from "@/lib/api";
import PageHeader from "@/components/PageHeader";
import { toast } from "sonner";
import { Play, Pause, ShieldCheck, Mail, Save, KeyRound, Users, Trash2, Database, Sparkles } from "lucide-react";

const rolePerms = {
  admin: ["Full access", "Configure agent schedules", "Manage users", "Approve all (OTP required)", "View audit + emails log"],
  manager: ["Team access", "Approve up to threshold", "View reports", "Manage HR/Sales"],
  employee: ["View self data (leaves, KPIs)", "Restricted from Finance/Sales/Compliance"],
  auditor: ["Read-only across all modules", "Full audit log access", "Emails log access"],
};

export default function Settings() {
  const { user, refresh } = useAuth();
  const [schedules, setSchedules] = useState([]);
  const [emails, setEmails] = useState([]);
  const [team, setTeam] = useState([]);
  const [profile, setProfile] = useState({ name: user?.name || "", email: user?.email || "", avatar: user?.avatar || "" });
  const [pwd, setPwd] = useState({ current_password: "", new_password: "" });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [wiping, setWiping] = useState(false);
  const isAdmin = user?.role === "admin";
  const canSeeEmails = user?.role === "admin" || user?.role === "auditor";
  const canSeeTeam = user?.role === "admin" || user?.role === "auditor";

  useEffect(() => {
    setProfile({ name: user?.name || "", email: user?.email || "", avatar: user?.avatar || "" });
  }, [user]);

  const loadTeam = () => api.get("/users").then((r) => setTeam(r.data)).catch(() => {});
  const load = () => api.get("/schedules").then((r) => setSchedules(r.data)).catch(() => {});
  useEffect(() => {
    load();
    if (canSeeEmails) api.get("/emails").then((r) => setEmails(r.data)).catch(() => {});
    if (canSeeTeam) loadTeam();
  }, [canSeeEmails, canSeeTeam]);

  const setRole = async (id, role) => {
    if (!role) return;
    try {
      await api.put(`/users/${id}/role`, { role });
      toast.success(`Role updated`);
      loadTeam();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const removeMember = async (id, email) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success(`Removed ${email}`);
      loadTeam();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed to remove"); }
  };

  const saveProfile = async (e) => {
    e.preventDefault();
    setSavingProfile(true);
    try {
      await api.put("/auth/me", profile);
      toast.success("Profile updated");
      refresh?.();
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); } finally { setSavingProfile(false); }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (pwd.new_password.length < 6) { toast.error("New password too short"); return; }
    setSavingPwd(true);
    try {
      await api.post("/auth/change-password", pwd);
      toast.success("Password changed");
      setPwd({ current_password: "", new_password: "" });
    } catch (err) { toast.error(err?.response?.data?.detail || "Failed"); } finally { setSavingPwd(false); }
  };

  const update = async (key, patch) => {
    const cur = schedules.find((s) => s.agent_key === key) || { enabled: false, cadence_minutes: 60, goal: "" };
    const next = { enabled: cur.enabled, cadence_minutes: cur.cadence_minutes, goal: cur.goal, ...patch };
    try {
      await api.put(`/schedules/${key}`, next);
      toast.success(`Schedule updated for ${key}`);
      load();
    } catch (e) { toast.error(e?.response?.data?.detail || "Failed"); }
  };

  const runSeedDemo = async () => {
    if (!window.confirm("Seed ~193 demo records across HR, Finance, Inventory, Sales & Compliance?")) return;
    setSeeding(true);
    try {
      const { data } = await api.post("/admin/seed-demo");
      const total = Object.values(data.counts || {}).reduce((a, b) => a + b, 0);
      toast.success(`Seeded ${total} records`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Seed failed"); }
    finally { setSeeding(false); }
  };

  const runWipeDemo = async () => {
    if (!window.confirm("Delete ALL seeded demo records? (Your real data stays untouched.)")) return;
    setWiping(true);
    try {
      const { data } = await api.post("/admin/wipe-demo");
      const total = Object.values(data.counts || {}).reduce((a, b) => a + b, 0);
      toast.success(`Removed ${total} demo records`);
    } catch (e) { toast.error(e?.response?.data?.detail || "Wipe failed"); }
    finally { setWiping(false); }
  };

  return (
    <div data-testid="settings-page">
      <PageHeader eyebrow="Admin" title="Settings" />

      {isAdmin && (
        <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-fuchsia-500/10 to-cyan-500/10 p-6 mb-6" data-testid="demo-data-card">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-fuchsia-400" />
            <h3 className="font-display text-xl font-bold">Demo data</h3>
          </div>
          <p className="text-sm text-zinc-400 mb-4">
            Instantly load ~193 realistic records (30 employees, 50 invoices, 80 inventory items, 25 leads, 8 contracts) so
            you can watch the agents actually run over data. Wipe removes only <code className="text-fuchsia-300">seeded</code>
            &nbsp;rows — your real data stays untouched.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={runSeedDemo}
              disabled={seeding}
              data-testid="seed-demo-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-fuchsia-500 to-cyan-400 text-black font-bold text-xs uppercase tracking-widest disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {seeding ? "Seeding…" : "Seed demo data"}
            </button>
            <button
              onClick={runWipeDemo}
              disabled={wiping}
              data-testid="wipe-demo-btn"
              className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/10 text-xs font-semibold uppercase tracking-widest disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              {wiping ? "Wiping…" : "Wipe demo data"}
            </button>
          </div>
        </div>
      )}

      {/* Profile edit + Password change */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <form onSubmit={saveProfile} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 space-y-4" data-testid="profile-form">
          <div className="flex items-center gap-4 mb-2">
            {profile.avatar ? <img src={profile.avatar} alt="" className="w-16 h-16 rounded-full object-cover border border-white/10" /> :
              <div className="w-16 h-16 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 font-bold text-xl">{profile.name?.[0] || "?"}</div>}
            <div>
              <div className="font-display font-bold text-lg">{user?.name}</div>
              <div className="text-[10px] uppercase tracking-widest text-cyan-400 font-mono-i">{user?.role}</div>
              {user?.auth_provider === "google" && <div className="text-[10px] uppercase tracking-widest text-emerald-400 font-mono-i mt-1">via Google</div>}
            </div>
          </div>
          <h3 className="font-display text-xl font-bold">Edit profile</h3>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Full name</label>
            <input required data-testid="profile-name" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Email {user?.email_verified ? <span className="text-emerald-400">· verified</span> : <span className="text-yellow-400">· unverified</span>}</label>
            <input required type="email" data-testid="profile-email" value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Avatar URL</label>
            <input type="url" data-testid="profile-avatar" value={profile.avatar} onChange={(e) => setProfile({ ...profile, avatar: e.target.value })} placeholder="https://…"
              className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm" />
          </div>
          <button disabled={savingProfile} type="submit" data-testid="profile-save-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-bold text-xs uppercase tracking-widest disabled:opacity-50">
            <Save className="w-4 h-4" /> {savingProfile ? "Saving…" : "Save profile"}
          </button>
        </form>

        <form onSubmit={changePassword} className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 space-y-4" data-testid="password-form">
          <div className="flex items-center gap-2 mb-2">
            <KeyRound className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-xl font-bold">Change password</h3>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Current password</label>
            <input required type="password" data-testid="current-password" value={pwd.current_password} onChange={(e) => setPwd({ ...pwd, current_password: e.target.value })}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm" />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">New password (6+ chars)</label>
            <input required type="password" minLength={6} data-testid="new-password" value={pwd.new_password} onChange={(e) => setPwd({ ...pwd, new_password: e.target.value })}
              className="w-full mt-2 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-sm" />
          </div>
          <button disabled={savingPwd} type="submit" data-testid="password-save-btn"
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full border border-white/15 bg-white/5 text-white font-bold text-xs uppercase tracking-widest hover:bg-white/10 disabled:opacity-50">
            {savingPwd ? "Updating…" : "Update password"}
          </button>
          <div className="text-[10px] text-zinc-500 mt-2 font-mono-i">
            Security: Email OTP enforced for admin decisions · sanitizer active on agent goals · session tokens 7-day expiry
          </div>
        </form>
      </div>

      {/* Permissions */}
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 mb-6">
        <h3 className="font-display text-xl font-bold mb-4">Your Permissions</h3>
        <ul className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(rolePerms[user?.role] || []).map((p) => (
            <li key={p} className="flex items-center gap-2 text-sm text-zinc-300"><span className="w-1.5 h-1.5 rounded-full bg-cyan-400" /> {p}</li>
          ))}
        </ul>
      </div>

      {/* Team & Roles (admin/auditor) */}
      {canSeeTeam && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 mb-6" data-testid="team-panel">
          <div className="flex items-center gap-2 mb-4">
            <Users className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-xl font-bold">Team & Roles</h3>
            <span className="ml-2 text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{team.length} members</span>
            {!isAdmin && <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">read-only</span>}
          </div>
          <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
            {team.map((m) => {
              const isSelf = m.id === user.id;
              const isPending = m.role === "pending";
              return (
                <div key={m.id} data-testid={`team-${m.id}`} className={`flex items-center gap-3 p-3 rounded-lg border ${isPending ? "border-yellow-500/30 bg-yellow-500/[0.03]" : "border-white/10 bg-black/20"}`}>
                  {m.avatar ? <img src={m.avatar} alt="" className="w-8 h-8 rounded-full object-cover" /> :
                    <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 font-bold text-xs">{m.name?.[0] || "?"}</div>}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold truncate flex items-center gap-2">
                      {m.name}
                      {isPending && <span className="text-[9px] uppercase tracking-widest font-mono-i px-1.5 py-0.5 rounded-full border border-yellow-500/40 bg-yellow-500/10 text-yellow-400">pending</span>}
                    </div>
                    <div className="text-[10px] text-zinc-500 truncate font-mono-i">{m.email} {m.email_verified && "· verified"} {m.auth_provider === "google" && "· google"}</div>
                  </div>

                  {isSelf ? (
                    <span className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border border-cyan-500/30 bg-cyan-500/10 text-cyan-300">Admin · you</span>
                  ) : isAdmin ? (
                    <>
                      <select
                        value={isPending ? "" : m.role}
                        onChange={(e) => setRole(m.id, e.target.value)}
                        data-testid={`role-select-${m.id}`}
                        className={`px-3 py-1.5 rounded-lg bg-zinc-950 border focus:border-cyan-400 outline-none text-xs uppercase tracking-widest font-mono-i ${isPending ? "border-yellow-500/40 text-yellow-400" : "border-white/10"}`}
                      >
                        {isPending && <option value="" disabled>— set role —</option>}
                        <option value="admin">Admin</option>
                        <option value="manager">Manager</option>
                        <option value="employee">Employee</option>
                        <option value="auditor">Auditor</option>
                      </select>
                      <button
                        onClick={() => removeMember(m.id, m.email)}
                        data-testid={`remove-member-${m.id}`}
                        className="p-1.5 rounded-lg border border-pink-500/30 bg-pink-500/5 text-pink-400 hover:bg-pink-500/15 transition-colors"
                        title="Remove member"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </>
                  ) : (
                    <span className="px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono-i border border-white/10 bg-white/[0.03] text-zinc-300">{m.role}</span>
                  )}
                </div>
              );
            })}
          </div>
          {isAdmin && <div className="mt-4 text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">Your admin role is locked · new signups appear as pending until you assign a role · removals are permanent.</div>}
        </div>
      )}

      {/* Schedules */}
      <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6 mb-6">
        <h3 className="font-display text-xl font-bold mb-1">Agent Schedules</h3>
        <p className="text-xs text-zinc-500 mb-4">{isAdmin ? "Enable an agent to run automatically on a fixed cadence." : "Only admins can configure schedules."}</p>
        <div className="space-y-3">
          {schedules.map((s) => (
            <div key={s.agent_key} data-testid={`schedule-${s.agent_key}`} className="flex flex-col md:flex-row md:items-center gap-3 p-4 rounded-xl border border-white/10 bg-black/20">
              <div className="flex-1">
                <div className="font-display font-bold uppercase text-sm tracking-wider">{s.agent_key}</div>
                <div className="text-xs text-zinc-500 mt-1">Next run: {s.next_run_at ? new Date(s.next_run_at).toLocaleString() : "—"}</div>
              </div>
              <input
                type="text"
                defaultValue={s.goal}
                onBlur={(e) => isAdmin && e.target.value !== s.goal && update(s.agent_key, { goal: e.target.value })}
                disabled={!isAdmin}
                data-testid={`schedule-goal-${s.agent_key}`}
                className="flex-[2] px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-xs"
              />
              <div className="flex items-center gap-2">
                <input
                  type="number" min="1" max="1440"
                  defaultValue={s.cadence_minutes}
                  onBlur={(e) => isAdmin && Number(e.target.value) !== s.cadence_minutes && update(s.agent_key, { cadence_minutes: Number(e.target.value) })}
                  disabled={!isAdmin}
                  data-testid={`schedule-cadence-${s.agent_key}`}
                  className="w-20 px-3 py-2 rounded-lg bg-zinc-950 border border-white/10 focus:border-cyan-400 outline-none text-xs text-center"
                />
                <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">min</span>
              </div>
              <button
                onClick={() => isAdmin && update(s.agent_key, { enabled: !s.enabled })}
                disabled={!isAdmin}
                data-testid={`schedule-toggle-${s.agent_key}`}
                className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-2 border transition-colors ${
                  s.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20" : "bg-white/[0.02] text-zinc-400 border-white/10 hover:bg-white/10"
                } ${isAdmin ? "cursor-pointer" : "opacity-60 cursor-not-allowed"}`}
              >
                {s.enabled ? <><Pause className="w-3 h-3" /> Live</> : <><Play className="w-3 h-3" /> Off</>}
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* Email log */}
      {canSeeEmails && (
        <div className="rounded-2xl border border-white/10 bg-zinc-900/60 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Mail className="w-4 h-4 text-cyan-400" />
            <h3 className="font-display text-xl font-bold">Emails Log</h3>
            <span className="ml-auto text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{emails[0]?.provider === "resend" ? "Resend" : "Console (add RESEND_API_KEY for real emails)"}</span>
          </div>
          <div className="max-h-[300px] overflow-y-auto space-y-2">
            {emails.length === 0 && <div className="text-sm text-zinc-500">No emails yet.</div>}
            {emails.map((e) => (
              <div key={e.id} className="flex items-center gap-3 p-2 rounded-lg border border-white/5 bg-black/20">
                <span className={`text-[10px] uppercase tracking-widest font-mono-i px-2 py-0.5 rounded-full border ${e.status === "sent" ? "text-emerald-400 border-emerald-500/30" : e.status === "failed" ? "text-pink-400 border-pink-500/30" : "text-zinc-400 border-white/10"}`}>{e.status}</span>
                <div className="flex-1 min-w-0">
                  <div className="text-xs text-zinc-200 truncate">{e.subject}</div>
                  <div className="text-[10px] text-zinc-500 font-mono-i">{e.to} · {e.purpose}</div>
                </div>
                <div className="text-[10px] text-zinc-500 font-mono-i">{new Date(e.sent_at).toLocaleTimeString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
