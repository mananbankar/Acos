import React, { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { X, ShieldCheck, Loader2 } from "lucide-react";

/**
 * Modal that requests + verifies an email OTP and returns a step-up token via `onVerified(token)`.
 * Used before admin/finance-sensitive actions (approvals decide).
 */
export default function OtpDialog({ open, purpose, onClose, onVerified }) {
  const [otp, setOtp] = useState("");
  const [demoHint, setDemoHint] = useState(null);
  const [busy, setBusy] = useState(false);
  const [requested, setRequested] = useState(false);

  useEffect(() => {
    if (!open) { setOtp(""); setDemoHint(null); setRequested(false); return; }
    (async () => {
      setBusy(true);
      try {
        const { data } = await api.post("/auth/otp/request", { purpose });
        setDemoHint(data.demo_hint); // present when Resend key is not set
        setRequested(true);
        if (data.demo_hint) toast.info(`Demo mode — code: ${data.demo_hint}`);
        else toast.success("Verification code sent to your email.");
      } catch (e) { toast.error("Failed to send code"); onClose?.(); } finally { setBusy(false); }
    })();
  }, [open, purpose]);

  if (!open) return null;

  const verify = async () => {
    if (otp.length !== 6) { toast.error("Enter the 6-digit code"); return; }
    setBusy(true);
    try {
      const { data } = await api.post("/auth/otp/verify", { otp, purpose });
      toast.success("Verified — action authorized for 15 min.");
      onVerified(data.step_up_token);
      onClose?.();
    } catch (e) { toast.error(e?.response?.data?.detail || "Invalid code"); } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" data-testid="otp-dialog">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-zinc-950 p-6 relative">
        <button onClick={onClose} className="absolute top-3 right-3 p-1 text-zinc-500 hover:text-white" data-testid="otp-close"><X className="w-4 h-4" /></button>
        <div className="w-12 h-12 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center mb-4"><ShieldCheck className="w-6 h-6" /></div>
        <div className="text-[10px] uppercase tracking-[0.25em] text-cyan-400 font-mono-i">Step-up auth</div>
        <h2 className="font-display text-xl font-bold mt-1">Verify with email OTP</h2>
        <p className="text-sm text-zinc-400 mt-1">Admin actions require a fresh 6-digit code sent to your registered email.</p>

        <div className="mt-5">
          <input
            data-testid="otp-input"
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, "").slice(0, 6))}
            placeholder="123456"
            className="w-full px-4 py-3 rounded-lg bg-zinc-900 border border-white/10 focus:border-cyan-400 outline-none text-center text-2xl tracking-[0.5em] font-mono-i"
          />
          {demoHint && (
            <div className="mt-2 text-[11px] text-yellow-400 font-mono-i">Demo hint: {demoHint} (Resend key not configured — real emails require RESEND_API_KEY)</div>
          )}
        </div>

        <button
          onClick={verify}
          disabled={busy || !requested}
          data-testid="otp-verify-btn"
          className="mt-5 w-full py-3 rounded-lg bg-gradient-to-r from-cyan-400 to-pink-500 text-black font-black uppercase tracking-widest text-sm disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Verify
        </button>
      </div>
    </div>
  );
}
