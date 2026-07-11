import React, { useState } from "react";
import { api } from "@/lib/api";
import { Link } from "react-router-dom";
import { toast } from "sonner";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.post("/auth/forgot", { email });
      setSent(true);
      toast.success("Check your inbox for a reset link.");
    } catch { toast.error("Something went wrong."); } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white px-6">
      <div className="w-full max-w-md">
        <div className="text-[10px] uppercase tracking-[0.3em] text-cyan-400 font-mono-i mb-2">Account recovery</div>
        <h1 className="font-display text-3xl font-black tracking-tight">Forgot password</h1>
        <p className="text-sm text-zinc-500 mt-2">Enter your email — we'll send a reset link that expires in 30 minutes.</p>

        {sent ? (
          <div className="mt-8 p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/5 text-emerald-300 text-sm">
            If an account exists for {email}, a reset link is on its way. In demo mode (no Resend key), check the /api/emails endpoint or the audit log for the token.
          </div>
        ) : (
          <form onSubmit={submit} className="mt-8 space-y-4">
            <input
              type="email"
              data-testid="forgot-email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-white/10 focus:border-cyan-400 outline-none text-sm"
            />
            <button
              disabled={busy}
              data-testid="forgot-submit"
              className="w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-black uppercase tracking-widest text-sm disabled:opacity-50"
            >{busy ? "Sending…" : "Send reset link"}</button>
          </form>
        )}
        <div className="mt-8 text-xs text-zinc-500">
          <Link to="/login" className="text-cyan-400 hover:text-cyan-300">← Back to login</Link>
        </div>
      </div>
    </div>
  );
}
