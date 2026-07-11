# ACOS — Autonomous Company Operating System

## Original Problem Statement
Integrate two provided React components (`gradient-menu`, `motion-footer`) into a full-stack build of ACOS: an AI-agent-driven business ops platform (HR, Finance, Inventory, Sales, Compliance) with human-in-the-loop approvals, JWT auth with 4 roles, and audit logging.

## Architecture
- **Backend:** FastAPI + MongoDB (motor) — `/app/backend/server.py`
- **LLM:** Claude Sonnet 4.6 via `emergentintegrations` (Emergent Universal Key)
- **Auth:** JWT + bcrypt, 4 roles: admin / manager / employee / auditor
- **Frontend:** React 19 (JSX), TailwindCSS, react-router-dom v7
- **Motion:** GSAP + ScrollTrigger for cinematic footer; react-fast-marquee for status ticker
- **Charts:** recharts (Analytics tab)

## User Personas
- **Admin (Ava Reyes)** — full access, approves everything
- **Manager (Marcus Nolan)** — approves up to threshold, sees team data
- **Employee (Elena Park)** — self data, KPI viewer
- **Auditor (Kenji Ito)** — read-only across all modules + full audit log

## What's Been Implemented (Feb 2026)
### Iteration 1 (MVP)
- JWT login with 4 seeded users + role-based approval endpoint
- Auto-seed on backend startup (employees, invoices, inventory, leads, contracts, approvals, agents)
- Multi-agent runner: 6 agents (orchestrator/hr/finance/inventory/sales/compliance) — each calls Claude Sonnet 4.6 with its own system prompt, returns reasoning + confidence + escalate flag
- Escalated agent decisions auto-create approval queue entries
- 11 pages wired: Dashboard, Agents, HR, Finance, Inventory, Sales, Compliance, Analytics, Approvals, Audit Logs, Settings
- Two required components integrated:
  - `gradient-menu.jsx` — floating nav in header, adapted for React Router with hover-expand pills
  - `motion-footer.jsx` — cinematic aurora footer with ACOS giant text, GSAP scroll animations, marquee, magnetic CTAs
- Immutable audit log for every login / agent run / approval decision

### Iteration 2 (P1 + P2)
- **RBAC on read paths**: employees blocked from Finance/Sales/Compliance/Approvals (403); HR data filtered to self; graceful 403 UX
- **Forgot-password + reset flow**: `/forgot` → `/reset?token=…`, tokens expire in 30 minutes, emails queued via Resend or console fallback
- **Email OTP-based 2FA**: admin approval decisions require step-up token; OTP dialog auto-fills demo hint when RESEND_API_KEY empty
- **Configurable per-agent scheduled runs**: `/api/schedules` endpoints, in-process asyncio poller runs every 30s and dispatches due agents; UI in Settings with enable/cadence/goal per agent
- **File uploads (Emergent object storage)**: `/api/files/upload` with attach_to='invoice:<id>' or 'contract:<id>'; per-row uploader chip on Finance and Compliance pages
- **Notification engine**: `send_email()` helper — real Resend if key set, console fallback + DB record otherwise; sends on forgot/OTP/approval decisions
- **Prompt-injection sanitizer**: `sanitize_input()` scrubs common jailbreak patterns and wraps user goals in explicit `<user_supplied_goal>` tags before sending to Claude
- Emails log viewer in Settings (admin/auditor only)

## Prioritized Backlog
### P1
- Reset password / forgot password flow
- Employee-scoped filtering (currently all users see all data — RBAC on read paths)
- Real background workers for scheduled agent runs (currently on-demand)
- Attachment upload for invoices/contracts (object storage integration)

### P2
- 2FA / OTP for admin & finance actions (mentioned in original spec)
- Prompt-injection sanitization pipeline for external document ingestion
- SSO (Google Workspace / Microsoft 365)
- Notification engine (email/SMS/WhatsApp) for approvals

### P3
- Vector RAG over uploaded contracts (FAISS)
- Genetic-algorithm shift scheduler (DEAP) for HR agent
- Anomaly detection ML models replacing static list

## Test Credentials
See `/app/memory/test_credentials.md`.
