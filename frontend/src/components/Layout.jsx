import React from "react";
import { Outlet, useNavigate } from "react-router-dom";
import GradientMenu from "@/components/ui/gradient-menu";
import MotionFooter from "@/components/ui/motion-footer";
import { useAuth } from "@/context/AuthContext";
import { LogOut } from "lucide-react";

export default function Layout() {
  const { user, logout } = useAuth();
  const nav = useNavigate();

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100">
      {/* Global ambient */}
      <div className="fixed inset-0 acos-grid-bg pointer-events-none opacity-70" />
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute -top-40 -left-40 w-[500px] h-[500px] rounded-full acos-aurora opacity-60" />
        <div className="absolute -bottom-40 -right-40 w-[500px] h-[500px] rounded-full acos-aurora opacity-40" />
      </div>

      {/* Floating top bar */}
      <header className="sticky top-0 z-50 w-full px-4 md:px-8 py-5 backdrop-blur-md bg-zinc-950/40 border-b border-white/5">
        <div className="max-w-[1400px] mx-auto flex items-center gap-6 justify-between">
          <div className="flex items-center gap-3 shrink-0">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-cyan-400 to-pink-500 shadow-[0_0_30px_-5px_rgba(6,182,212,0.6)]" />
            <div>
              <div className="font-display font-black text-lg leading-none tracking-tight">ACOS</div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-zinc-500 font-mono-i mt-1">Command Center</div>
            </div>
          </div>

          <div className="hidden lg:block flex-1">
            <div className="flex justify-center">
              <GradientMenu />
            </div>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <div className="hidden md:flex items-center gap-3 pl-4 pr-2 py-2 rounded-full border border-white/10 bg-zinc-900/60">
              {user?.avatar ? (
                <img src={user.avatar} alt="" className="w-8 h-8 rounded-full object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-cyan-500/20 flex items-center justify-center text-cyan-300 text-xs font-bold">
                  {user?.name?.[0] ?? "U"}
                </div>
              )}
              <div className="pr-1">
                <div className="text-xs font-semibold text-white leading-tight">{user?.name}</div>
                <div className="text-[10px] uppercase tracking-widest text-zinc-500 font-mono-i">{user?.role}</div>
              </div>
            </div>
            <button
              onClick={() => { logout(); nav("/login"); }}
              data-testid="logout-btn"
              className="p-2 rounded-full border border-white/10 bg-zinc-900/60 text-zinc-400 hover:text-white hover:bg-zinc-800 transition-colors"
              aria-label="Log out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        <div className="lg:hidden mt-4 overflow-x-auto pb-2 -mx-4 px-4 [&::-webkit-scrollbar]:hidden">
          <GradientMenu />
        </div>
      </header>

      <main className="relative z-10 max-w-[1400px] mx-auto px-4 md:px-8 py-8">
        {user?.role === "pending" && (
          <div data-testid="pending-banner" className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.04] text-sm text-yellow-200">
            Your account is <span className="font-bold">awaiting role assignment</span>. Your admin will grant access from Settings → Team & Roles. Once assigned, refresh the page.
          </div>
        )}
        {user && !user.email_verified && user.auth_provider !== "google" && (
          <div data-testid="verify-banner" className="mb-6 p-4 rounded-xl border border-yellow-500/30 bg-yellow-500/[0.04] flex items-center justify-between gap-4">
            <div className="text-sm text-yellow-200">
              Your email <span className="font-mono-i">{user.email}</span> hasn't been verified yet.
            </div>
            <a href="/verify" className="px-4 py-1.5 rounded-full bg-yellow-500 text-black text-xs font-bold uppercase tracking-widest hover:bg-yellow-400">
              Verify now
            </a>
          </div>
        )}
        <Outlet />
      </main>

      <MotionFooter />
    </div>
  );
}
