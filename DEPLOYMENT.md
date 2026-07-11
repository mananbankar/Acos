# ACOS — Vercel Deployment Guide (Single-Folder / Free-Tier compatible)

Everything Vercel needs is inside **`frontend/`** — that's the only folder you point Vercel at.
Free-tier Vercel deploys **one Root Directory**, and this repo is now structured so that root
contains both the React app **and** the FastAPI backend (as a Python serverless function).

```
Repo/
├── frontend/                    ← Vercel Root Directory (single folder)
│   ├── package.json             ← Create React App
│   ├── src/
│   ├── public/
│   ├── api/
│   │   ├── index.py             ← Python serverless entrypoint (Vercel auto-detects)
│   │   └── requirements.txt
│   ├── server/
│   │   ├── app.py               ← FastAPI application (canonical source)
│   │   └── .env                 ← local dev only — gitignored
│   ├── vercel.json              ← rewrites /api/* → serverless function
│   └── .vercelignore
├── backend/
│   └── server.py                ← 3-line shim so the local preview keeps running via supervisor
└── ...
```

---

## 1. Push to GitHub

```bash
cd /app
git add .
git commit -m "ACOS: single-folder Vercel deploy"
git push origin main
```

`.env` files (`frontend/server/.env`, `frontend/.env`) are gitignored — no secrets leak.

---

## 2. Import into Vercel — single-folder setup

1. **New Project → Import** your GitHub repo.
2. **Root Directory** → click **Edit** → select **`frontend`**.
3. Framework Preset → **Create React App** (auto-detected).
4. Build Command → auto (`yarn install && yarn build`).
5. Output Directory → `build` (auto).
6. Add the env vars below (see step 3).
7. Click **Deploy**.

Vercel will:
- Build the React app from `frontend/`.
- Automatically detect `frontend/api/index.py` and deploy it as a Python 3.11 serverless function.
- Route `/api/*` to that function, everything else to the static build (via `frontend/vercel.json`).

---

## 3. Environment variables (Vercel dashboard → Settings → Environment Variables)

| Key | Value |
|---|---|
| `MONGO_URL` | MongoDB Atlas connection string (see step 4) |
| `DB_NAME` | `acos_prod` |
| `JWT_SECRET` | any 32+ char random string |
| `JWT_ALG` | `HS256` |
| `EMERGENT_LLM_KEY` | `sk-emergent-056FaDaEd90A672C5F` |
| `EMERGENT_APP_NAME` | `acos` |
| `RESEND_API_KEY` | `re_e3mnaWLv_Nc8Aq6gTM3hHfCFJ79tH4DZS` |
| `SENDER_EMAIL` | `onboarding@resend.dev` (or your verified domain) |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` |
| `DEBUG_OTP` | `false` in prod |
| `BOOTSTRAP_ADMIN_EMAIL` | `bankarmanan8@gmail.com` |
| `BOOTSTRAP_ADMIN_NAME` | `Manan Bankar` |
| `BOOTSTRAP_ADMIN_PASSWORD` | pick a strong initial password |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` |
| `REACT_APP_BACKEND_URL` | **leave blank** — frontend auto-falls back to same-origin `/api` |

---

## 4. MongoDB Atlas (required — 5 min)

Vercel functions can't reach the local mongo used in this preview.

1. https://cloud.mongodb.com → **Build a Cluster** → free M0.
2. Database Access → create user + password.
3. Network Access → allow `0.0.0.0/0` (Vercel IPs are dynamic).
4. Copy the SRV string: `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority`.
5. Paste as `MONGO_URL` in Vercel env vars.

On first deploy, `seed()` populates demo data and `bootstrap_admin()` creates/promotes
`bankarmanan8@gmail.com` to admin with the password from `BOOTSTRAP_ADMIN_PASSWORD`.

---

## 5. Verify

```bash
# Front page
open https://<your-app>.vercel.app

# Backend reachable
curl https://<your-app>.vercel.app/api/dashboard/kpis
# → 401 Missing token (expected — endpoint is up and secured)

# Log in as admin
curl -X POST https://<your-app>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bankarmanan8@gmail.com","password":"<BOOTSTRAP_ADMIN_PASSWORD>"}'
```

---

## 6. Notes

- **Same-origin API**: frontend fetches `/api/…` from its own domain, so no CORS setup on the browser side.
- **Scheduler loop**: automatically disabled when `VERCEL=1` env var is present (Vercel injects it). For scheduled agent runs on Vercel, add a `crons` section to `vercel.json` and expose a small endpoint that does one tick per invocation. Not required to deploy.
- **Cold starts**: first request after inactivity may take 2-5 s (Python + motor init).
- **File uploads**: Vercel serverless body-size limit (~4.5 MB). Fine for typical invoices/contracts.

---

## 7. Local dev unchanged

Nothing changes for the preview environment — the supervisor still runs
`uvicorn server:app` from `/app/backend`, and the 3-line shim in `backend/server.py`
re-exports the app from `frontend/server/app.py` (the canonical location).
