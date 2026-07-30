# 🚀 Step-by-Step Deployment Guide: Vercel + Supabase (100% Free, 100% Uptime)

Follow these simple steps to deploy your **AdGen Pharmacy ERP** for production with **0$ monthly cost** and **100% uptime** (zero server spin-down lag).

---

> ⚠️ **Never paste real database URLs, passwords, or API keys into this file.** It is tracked in git.
> Keep secrets in `backend/.env` (git-ignored) and in your host's environment-variable settings.

## 📋 Prerequisites
1. **GitHub Account**: Push this workspace repository to your GitHub account (`git push`).
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com) (Free Hobby Plan).
3. **Supabase PostgreSQL**: Database is already running on Supabase!

---

## ⚡ Step 1: Deploy Backend API on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repository.
2. Select the **`backend`** directory as the **Root Directory**.
3. Under **Environment Variables**, add the following variables. Copy the real values from your
   local `backend/.env` — **never commit them to git**:
   - `DATABASE_URL`: transaction-mode pooler URL (port `6543`, `?pgbouncer=true`)
   - `DIRECT_URL`: session-mode URL (port `5432`), used for migrations
   - `JWT_SECRET`: a random string of at least 32 characters. Generate with
     `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
     Use a value that is **not** your local development secret.
     > On serverless there is no boot phase, so a missing secret does not fail the
     > deploy — it fails the first **sign-in** with a 500. A deployment can look
     > healthy and still be unusable, so verify by actually logging in.
   - `CORS_ORIGINS`: your frontend's exact production origin — `https://adgenerp.vercel.app`.
     Without this the API rejects every browser request in production.
4. Click **Deploy**.
5. Once deployed, copy your backend URL (e.g. `https://adgen-erp-backend.vercel.app`).

---

## 🌐 Step 2: Deploy Frontend Client on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) again and import the same GitHub repository.
2. Select the **`client`** directory as the **Root Directory**.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL`: your backend URL from Step 1 with `/api` appended,
     e.g. `https://adgen-erp-backend.vercel.app/api`.
   > ⚠️ This value is **inlined at build time**. Adding or changing it requires a **redeploy** —
   > saving the variable alone will not update an already-built frontend. If it is missing, the
   > app logs a warning and falls back to a hardcoded backend host, which may not be yours.
4. Click **Deploy**.
5. Your Pharmacy ERP is now live at **https://adgenerp.vercel.app**.

---

## 🛠️ Step 3: Run Database Migrations (One-time setup)

To sync your Supabase PostgreSQL database tables with the updated schema:

```bash
cd backend
npx prisma db push
```

---

## 🎉 Verification & Testing
- Open your frontend Vercel URL.
- Test login, medicine search, counter billing, and purchase ingestion.
- Enjoy 0ms instant UI billing and 100% cloud uptime!

---

## 🌏 Database region — the single biggest performance factor

The database currently lives in **`ap-northeast-1` (Tokyo)**. Measured from a machine in India, one
round trip to it is **~700–850ms** (`SELECT 1`). Every API request pays that at least once, and a
sale writes several times, which is why saving a bill takes ~3 seconds however tight the code is.

Moving the project to **`ap-south-1` (Mumbai)** cuts that to roughly 20–40ms — the same code then
answers in a fraction of the time. Supabase cannot change a project's region in place, so it means
creating a new project and copying the data across:

```bash
# 1. Create a new Supabase project in ap-south-1. Note its connection strings.

# 2. Dump the current database (use the DIRECT_URL, port 5432 — not the pooler).
pg_dump "$OLD_DIRECT_URL" --no-owner --no-acl -Fc -f pharmacy-erp.dump

# 3. Restore into the new project.
pg_restore -d "$NEW_DIRECT_URL" --no-owner --no-acl pharmacy-erp.dump

# 4. Point the app at it: update DATABASE_URL and DIRECT_URL in backend/.env
#    (and in the Vercel project's environment variables), then redeploy.

# 5. Confirm the data arrived before decommissioning the old project.
cd backend && npx ts-node src/scripts/verify-db-counts.ts
```

Do the copy when the counter is closed: bills written to the old database after the dump will not
be in the new one.

**Until that move happens**, the code-side levers that matter are the ones already applied — fewer
round trips per request (batched queries, cached auth lookups), gzip on every response, and
serving the browser's cached copy first while the refresh runs behind it.
