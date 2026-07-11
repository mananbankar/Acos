import React, { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Handles the return from Emergent Google OAuth.
 * URL fragment contains #session_id=xxx → exchange server-side → store our JWT.
 */
export default function AuthCallback() {
  const nav = useNavigate();
  const loc = useLocation();
  const processed = useRef(false);

  useEffect(() => {
    if (processed.current) return;
    processed.current = true;
    const hash = loc.hash || window.location.hash || "";
    const match = hash.match(/session_id=([^&]+)/);
    if (!match) {
      toast.error("Missing Google session — please try again.");
      nav("/login", { replace: true });
      return;
    }
    const sessionId = match[1];
    (async () => {
      try {
        const { data } = await api.post("/auth/emergent/callback", { session_id: sessionId });
        localStorage.setItem("acos_token", data.token);
        toast.success(`Welcome ${data.user.name}!`);
        // Full reload so AuthProvider re-hydrates
        window.location.href = "/";
      } catch (e) {
        toast.error(e?.response?.data?.detail || "Google sign-in failed");
        nav("/login", { replace: true });
      }
    })();
  }, [loc.hash, nav]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-zinc-950 text-white">
      <div className="text-center">
        <Loader2 className="w-8 h-8 animate-spin text-cyan-400 mx-auto" />
        <div className="mt-4 text-sm text-zinc-400 uppercase tracking-widest font-mono-i">Finalising Google sign-in…</div>
      </div>
    </div>
  );
}
