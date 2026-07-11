import React, { useState } from "react";
import { useNavigate, Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import { Bot, ShieldCheck, Zap } from "lucide-react";

export default function Login() {
  const { user, login } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (user) return <Navigate to="/" replace />;

  const submit = async (e) => {
    e?.preventDefault?.();
    setBusy(true);
    try {
      await login(email, password);
      toast.success("Signed in.");
      nav("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Login failed");
    } finally { setBusy(false); }
  };

  return (
    <div className="relative min-h-screen w-full flex bg-zinc-950 text-white overflow-hidden">
      {/* Left: brand */}
      <div className="hidden lg:flex relative w-1/2 border-r border-white/10 overflow-hidden">
        <div className="absolute inset-0 acos-grid-bg opacity-60" />
        <div className="absolute -top-20 -left-20 w-[600px] h-[600px] acos-aurora rounded-full" />
        <div className="relative z-10 flex flex-col justify-between p-14 w-full">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-500 shadow-[0_0_30px_-5px_rgba(6,182,212,0.6)]" />
            <div className="font-display font-black text-2xl tracking-tight">ACOS</div>
          </div>

          <div>
            <div className="text-xs font-mono-i uppercase tracking-[0.3em] text-cyan-400 mb-6">Autonomous Company OS</div>
            <h1 className="font-display text-5xl xl:text-6xl font-black tracking-tighter leading-[0.95]">
              Six specialist agents.<br />
              <span className="bg-gradient-to-r from-cyan-400 to-pink-500 bg-clip-text text-transparent">One command center.</span>
            </h1>
            <p className="mt-6 text-zinc-400 text-base max-w-md">
              HR, Finance, Inventory, Sales, Compliance — all supervised by an Orchestrator, all
              gated by a human-in-the-loop approval layer.
            </p>
            <div className="grid grid-cols-3 gap-3 mt-10 max-w-md">
              {[
                { Icon: Bot, label: "6 AI agents" },
                { Icon: ShieldCheck, label: "Human gates" },
                { Icon: Zap, label: "Real-time" },
              ].map(({ Icon, label }) => (
                <div key={label} className="border border-white/10 rounded-xl p-4 bg-white/[0.02]">
                  <Icon className="w-5 h-5 text-cyan-400 mb-2" />
                  <div className="text-xs font-semibold uppercase tracking-widest text-zinc-300 font-mono-i">{label}</div>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-600 font-mono-i">v0.1 • Feb 2026</div>
        </div>
      </div>

      {/* Right: form */}
      <div className="relative flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-[420px]">
          <div className="mb-8">
            <div className="text-xs font-mono-i uppercase tracking-[0.3em] text-cyan-400 mb-2">Sign in</div>
            <h2 className="font-display text-3xl font-black tracking-tight">Access the Command Center</h2>
            <p className="text-sm text-zinc-500 mt-2">Continue with Google or your registered email.</p>
          </div>

          <button
            onClick={() => {
              // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
              const redirectUrl = window.location.origin + "/auth-callback";
              window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
            }}
            data-testid="google-login-btn"
            className="w-full py-3 rounded-lg border border-white/15 bg-white/[0.03] hover:bg-white/10 flex items-center justify-center gap-3 text-sm font-semibold uppercase tracking-widest text-white transition-colors mb-4"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3 mb-4">
            <div className="flex-1 h-px bg-white/10" />
            <span className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">or</span>
            <div className="flex-1 h-px bg-white/10" />
          </div>

          <form onSubmit={submit} className="space-y-4">
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Email</label>
              <input
                type="email"
                data-testid="login-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full mt-2 px-4 py-3 rounded-lg bg-zinc-900 border border-white/10 focus:border-cyan-400 outline-none text-sm"
              />
            </div>
            <div>
              <label className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-mono-i">Password</label>
              <input
                type="password"
                data-testid="login-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full mt-2 px-4 py-3 rounded-lg bg-zinc-900 border border-white/10 focus:border-cyan-400 outline-none text-sm"
              />
            </div>
            <button
              type="submit"
              disabled={busy}
              data-testid="login-submit"
              className="w-full py-3.5 rounded-lg bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-black uppercase tracking-widest text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {busy ? "Signing in…" : "Enter"}
            </button>
          </form>

          <div className="text-[10px] text-zinc-600 uppercase tracking-widest mt-6 font-mono-i">
            JWT auth · bcrypt hashed · roles enforced server-side
          </div>
          <div className="text-xs text-zinc-500 mt-4 flex items-center justify-between">
            <a href="/forgot" data-testid="forgot-link" className="text-cyan-400 hover:text-cyan-300">Forgot your password?</a>
            <a href="/signup" data-testid="signup-link" className="text-cyan-400 hover:text-cyan-300">Create account</a>
          </div>
        </div>
      </div>
    </div>
  );
}
