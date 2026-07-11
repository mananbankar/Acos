# ACOS — Vercel Deployment Guide

This repo is set up so **backend (FastAPI) + frontend (React CRA) deploy as a single Vercel project**.

The `vercel.json` **rewrites `/api/*` → `api/index.py`** (Python serverless function) and serves the built React app for everything else — so the frontend can call `/api/...` on the same origin.

> **Why the `"services"` schema you posted didn't work:** Vercel's current config format (v2) has no `services` field. Multi-service monorepos on Vercel are done via a **single project with `functions` + `rewrites`**, exactly as configured here.

---

## 1. Project Structure (Vercel view)

```
/
├── api/
│   ├── index.py           # Vercel Python function — wraps backend/server.py as ASGI
│   └── requirements.txt   # Backend deps for the serverless function
├── backend/
│   └── server.py          # The FastAPI app (unchanged business logic)
├── frontend/
│   ├── package.json
│   └── src/               # React CRA app
└── vercel.json            # Rewrites + function config
```

`vercel.json` (already committed):

```json
{
  "buildCommand": "cd frontend && yarn install --frozen-lockfile && yarn build",
  "outputDirectory": "frontend/build",
  "functions": {
    "api/index.py": { "runtime": "python3.11", "maxDuration": 60, "memory": 1024 }
  },
  "rewrites": [
    { "source": "/api/(.*)", "destination": "/api/index.py" },
    { "source": "/api",       "destination": "/api/index.py" }
  ]
}
```

---

## 2. External services you MUST set up first

Vercel functions are **stateless & ephemeral**, so replace anything running locally:

| Component | Local (this preview) | Vercel production |
|---|---|---|
| MongoDB | localhost:27017 | **MongoDB Atlas free tier** — https://cloud.mongodb.com |
| Object storage | Emergent internal | Keep Emergent OR swap to S3/UploadThing |
| Scheduler loop | `asyncio.create_task` on startup | **Vercel Cron Jobs** (recommended) — add cron config |
| LLM key | Emergent Universal Key | Same key works |

### MongoDB Atlas quick setup
1. Create free M0 cluster.
2. Database Access → add user + password.
3. Network Access → allow `0.0.0.0/0` (Vercel IPs are dynamic).
4. Copy the connection string: `mongodb+srv://user:pass@cluster.xxxxx.mongodb.net/?retryWrites=true&w=majority`.

---

## 3. Vercel environment variables

In the Vercel dashboard (**Project → Settings → Environment Variables**) add these for **Production** and **Preview**:

| Key | Value |
|---|---|
| `MONGO_URL` | your Atlas connection string |
| `DB_NAME` | `acos_prod` |
| `JWT_SECRET` | any long random string (32+ chars) |
| `JWT_ALG` | `HS256` |
| `EMERGENT_LLM_KEY` | `sk-emergent-056FaDaEd90A672C5F` |
| `EMERGENT_APP_NAME` | `acos` |
| `RESEND_API_KEY` | `re_e3mnaWLv_Nc8Aq6gTM3hHfCFJ79tH4DZS` |
| `SENDER_EMAIL` | `onboarding@resend.dev` (or your verified domain) |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` |
| `DEBUG_OTP` | `false` (set true only for demo) |
| `BOOTSTRAP_ADMIN_EMAIL` | `bankarmanan8@gmail.com` |
| `BOOTSTRAP_ADMIN_NAME` | `Manan Bankar` |
| `BOOTSTRAP_ADMIN_PASSWORD` | a strong initial password |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` |

**Frontend build-time var** (Vercel sets this automatically at build):
- `REACT_APP_BACKEND_URL` — **leave blank / do not set**. The frontend already falls back to same-origin `/api`, which is what you want on Vercel.

---

## 4. Deploy

### Option A — Vercel CLI
```bash
npm i -g vercel
cd /app
vercel                     # first-time link
vercel --prod              # production deploy
```

### Option B — GitHub → Vercel
1. Push repo to GitHub.
2. In Vercel dashboard → **Add New Project** → import the repo.
3. Framework preset: **Other** (Vercel will read `vercel.json`).
4. Add env vars from step 3.
5. Click **Deploy**.

---

## 5. Post-deploy sanity checks

```bash
# Health / seeded data
curl https://<your-app>.vercel.app/api/dashboard/kpis
# → expect 401 "Missing token" — good, API is reachable

# Login as your admin
curl -X POST https://<your-app>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bankarmanan8@gmail.com","password":"<your BOOTSTRAP_ADMIN_PASSWORD>"}'

# Front page
open https://<your-app>.vercel.app
```

On first request, `bootstrap_admin()` in `backend/server.py` will:
- Create `bankarmanan8@gmail.com` as an admin if it doesn't exist, OR
- Promote it to admin if it already exists.

---

## 6. Serverless caveats you should know

1. **Cold starts**: First hit after inactivity takes ~2–5 s (Python + motor init).
2. **No in-process scheduler**: `_scheduler_loop()` is auto-disabled when `VERCEL=1`. Use **Vercel Cron** — add to `vercel.json`:

   ```json
   "crons": [
     { "path": "/api/cron/run-schedules", "schedule": "*/5 * * * *" }
   ]
   ```
   Then add a small endpoint in `backend/server.py` that does one scheduler tick per invocation.
3. **File uploads**: Vercel functions have a **4.5 MB request body limit** and **50 MB response limit**. Large PDFs need direct-to-S3 uploads (or keep using Emergent storage; the code already streams via HTTP).
4. **Cold DB connections**: Motor auto-pools — keep the client as a module-global (already done in `server.py`).

---

## 7. Local dev vs Vercel

| Aspect | Local (this preview) | Vercel |
|---|---|---|
| Start | `sudo supervisorctl restart backend frontend` | `vercel dev` |
| Backend port | `:8001` | serverless via `/api/*` |
| Frontend port | `:3000` (proxied) | static build |
| Env source | `backend/.env`, `frontend/.env` | Vercel dashboard |
| Scheduler | asyncio background task | Vercel Cron |

Everything else is identical — same MongoDB collections, same auth flow, same LLM calls.
