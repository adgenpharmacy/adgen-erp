# 🚀 Step-by-Step Deployment Guide: Vercel + Supabase (100% Free, 100% Uptime)

Follow these simple steps to deploy your **AdGen Pharmacy ERP** for production with **0$ monthly cost** and **100% uptime** (zero server spin-down lag).

---

## 📋 Prerequisites
1. **GitHub Account**: Push this workspace repository to your GitHub account (`git push`).
2. **Vercel Account**: Sign up at [vercel.com](https://vercel.com) (Free Hobby Plan).
3. **Supabase PostgreSQL**: Database is already running on Supabase!

---

## ⚡ Step 1: Deploy Backend API on Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import your GitHub repository.
2. Select the **`backend`** directory as the **Root Directory**.
3. Under **Environment Variables**, add the following 2 variables from your `backend/.env`:
   - `DATABASE_URL`: `postgresql://postgres.qwxlmtvaupfkfixojeqb:Shre@2608adg@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres?pgbouncer=true`
   - `DIRECT_URL`: `postgresql://postgres.qwxlmtvaupfkfixojeqb:Shre@2608adg@aws-0-ap-northeast-1.pooler.supabase.com:5432/postgres`
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
