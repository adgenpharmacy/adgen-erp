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
     The API refuses to boot in production without it.
   - `CORS_ORIGINS`: your frontend's production URL, e.g. `https://your-app.vercel.app`
4. Click **Deploy**.
5. Once deployed, copy your backend URL (e.g. `https://pharmacy-erp-backend.vercel.app`).

---

## 🌐 Step 2: Deploy Frontend Client on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) again and import the same GitHub repository.
2. Select the **`client`** directory as the **Root Directory**.
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_API_URL`: `https://pharmacy-erp-backend.vercel.app/api` (Replace with your backend URL from Step 1 + `/api`).
4. Click **Deploy**.
5. Your Pharmacy ERP is now live on your Vercel production domain!

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
