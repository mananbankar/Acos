# ACOS — Deployment Guide (Vercel Services preset)

This repo is already structured for **Vercel's Services application preset** — the deploy UI
will auto-detect two services and match the `vercel.json` at the root, so pushing to GitHub → clicking Deploy just works.

```
Acos/
├── frontend/          →  Web Service · Create React App    →  serves /(.*)
│   ├── package.json
│   └── src/
├── backend/           →  Web Service · FastAPI            →  serves /api(/.*)
│   ├── server.py      →  exports `app = FastAPI(...)`
│   └── requirements.txt
└── vercel.json        →  services + rewrites (Services schema)
```

### `vercel.json` (already at repo root)

```json
{
  "services": {
    "frontend": { "root": "frontend", "framework": "create-react-app" },
    "backend":  { "root": "backend" }
  },
  "rewrites": [
    { "source": "/api(/.*)?", "destination": { "type": "service", "service": "backend" } },
    { "source": "/(.*)",       "destination": { "type": "service", "service": "frontend" } }
  ]
}
```

---

## 1. Push to GitHub

```bash
cd /app
git add .
git commit -m "ACOS: Vercel Services deploy config"
git push origin main
```

`.env` files are gitignored — no secrets leak.

---

## 2. In Vercel dashboard

1. **New Project → Import** your GitHub repo.
2. Application Preset auto-picks **Services** (as shown in the screenshot you sent).
3. Root Directory: `./`
4. Click **Environment Variables** and add the values below **for both services** (Vercel shares env vars across services in a Services project).

### Required environment variables

| Key | Value / Where to get it |
|---|---|
| `MONGO_URL` | MongoDB Atlas connection string (see step 3) |
| `DB_NAME` | `acos_prod` (or anything you like) |
| `JWT_SECRET` | any 32+ char random string |
| `JWT_ALG` | `HS256` |
| `EMERGENT_LLM_KEY` | `sk-emergent-056FaDaEd90A672C5F` |
| `EMERGENT_APP_NAME` | `acos` |
| `RESEND_API_KEY` | `re_e3mnaWLv_Nc8Aq6gTM3hHfCFJ79tH4DZS` |
| `SENDER_EMAIL` | `onboarding@resend.dev` (or your verified domain) |
| `FRONTEND_URL` | `https://<your-app>.vercel.app` |
| `DEBUG_OTP` | `false` in prod (or `true` if you want OTP auto-fill for demos) |
| `BOOTSTRAP_ADMIN_EMAIL` | `bankarmanan8@gmail.com` |
| `BOOTSTRAP_ADMIN_NAME` | `Manan Bankar` |
| `BOOTSTRAP_ADMIN_PASSWORD` | pick a strong initial password |
| `CORS_ORIGINS` | `https://<your-app>.vercel.app` |
| `REACT_APP_BACKEND_URL` | **leave blank** — the frontend falls back to same-origin `/api` automatically |

5. Click **Deploy**.

---

## 3. Provision MongoDB Atlas (one-time, 5 min)

Vercel services can't reach the local mongo used in this preview — you need a hosted DB.

1. https://cloud.mongodb.com → **Build a Cluster** → free M0.
2. Database Access → add a user + password.
3. Network Access → allow `0.0.0.0/0` (Vercel IPs are dynamic).
4. Connect → copy the SRV string:
   `mongodb+srv://<user>:<pass>@<cluster>.mongodb.net/?retryWrites=true&w=majority`
5. Paste that as `MONGO_URL` in Vercel.

On first deploy, `seed()` populates demo data and `bootstrap_admin()` creates/promotes
`bankarmanan8@gmail.com` to admin (with the password from `BOOTSTRAP_ADMIN_PASSWORD`).

---

## 4. Verify

```bash
# Frontend
open https://<your-app>.vercel.app

# Backend health
curl https://<your-app>.vercel.app/api/dashboard/kpis
# → 401 Missing token (expected — endpoint is reachable and secured)

# Login as your admin
curl -X POST https://<your-app>.vercel.app/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"bankarmanan8@gmail.com","password":"<BOOTSTRAP_ADMIN_PASSWORD>"}'
```

---

## 5. Notes on services behavior

- **Same origin** — frontend fetches `/api/…` and the rewrite forwards to the backend service. No CORS gymnastics.
- **Scheduler loop** — the in-process asyncio poller is auto-disabled when `VERCEL=1`. If you want cron-style scheduled agent runs on Vercel, add:

  ```json
  "crons": [ { "path": "/api/cron/run-schedules", "schedule": "*/5 * * * *" } ]
  ```

  and expose a small endpoint that does one tick per invocation. (Not required to deploy — schedules can also be triggered manually from the Settings page.)

- **File uploads** — Vercel serverless has a body-size limit (~4.5 MB) on some plans; the current uploader is fine for typical invoices/contracts. Move to direct-to-S3 later if you need big PDFs.

- **Cold starts** — first request after inactivity may take 2-5 s (Python + motor init). Warm requests are fast.

That's it — the repo is deploy-ready. No manual restructuring on your side; push and click Deploy.
