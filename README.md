# AdGen Pharmacy ERP (v2.0 Enterprise Stack)

A modern, full-stack pharmacy management system built with **Next.js 16 (React 19)**, **Node.js (Express TypeScript)**, and **PostgreSQL (Prisma ORM)**.

---

## 🚀 System Architecture Overview

- **Client Layer (`/client`)**: Next.js 16 (App Router), Tailwind CSS v4, Axios, Framer Motion, Recharts, Lucide React.
- **Backend Layer (`/backend`)**: Express REST API in TypeScript, Prisma ORM 5.10, PostgreSQL 3NF database schema.
- **Authentication**: 100% PostgreSQL — email + bcrypt password hashes, signed JWTs (`JWT_SECRET`, 7-day expiry) verified by Express middleware. Firebase is no longer used; the `users.firebaseUid` column is a legacy artefact of the original import.
- **Legacy Flutter App (`/flutter_legacy`)**: Kept for historical reference. Its "Clinical White" design system (`lib/core/theme/`) is the source of the current web UI's palette and components.

---

## 🎨 UI Design System

Semantic tokens live in [`client/src/app/globals.css`](client/src/app/globals.css) and drive every surface — components use `bg-surface` / `text-fg` / `border-line` rather than raw palette steps, so a colour change happens in one place.

Shared primitives are in [`client/src/components/ui/`](client/src/components/ui/) (Button, Card, StatCard, Input/Select/Textarea, Table, StatusChip, Modal, EmptyState, PageHeader, Skeleton, Portal). The application frame — sidebar, mobile header, bottom nav and the Ctrl+K command palette — is mounted once in `AppShell`.

> **Note on printing:** invoice/report modals render through `Portal` into `document.body`. The print stylesheet hides `main`/`aside`/`nav` to strip app chrome, so a print modal nested inside `<main>` would be hidden too. Pages therefore own their own `<main>` via `PageMain` and never wrap print modals in it.

---

## 🛠️ Getting Started (Local Development)

### 1. Prerequisites
- Node.js 20+
- PostgreSQL 15+ installed and running locally
- npm / npx

### 2. Backend Setup
```bash
cd backend
npm install

# Copy environment template and configure DB credentials
cp .env.example .env

# Run Prisma database migrations & seed database
npm run prisma:generate
npm run prisma:migrate

# Start Backend Dev API Server (Runs on port 5000)
npm run dev
```

### 3. Client Setup
```bash
cd client
npm install

# Start Next.js Client Dev Server (Runs on port 3000)
npm run dev
```

### 4. Application Verification & Tooling
```bash
# Test production builds
cd backend && npm run build
cd client && npm run build

# Run frontend linting
cd client && npm run lint
```

---

## 📋 Features Overview

- 🧾 **Counter Billing / Sales Invoice**: FEFO batch stock auto-deduction, strip + loose tablet math, GST calculation, WhatsApp bill sharing, invoice print previews.
- 🛒 **Purchase Bill Ingestion**: Multi-item GRN ingestion, batch creation with expiry & MRP, party balance tracking.
- 📦 **Inventory & Expiry Management**: FEFO batch sorting, stock corrections, low stock & 90-day expiry alerts.
- 🏢 **Master Directories**: Products catalog, Parties/Suppliers, Customers, Employees.
- 📊 **Reports & Ledger**: Sales/Purchases analysis, P&L statement, GST tax filings, party ledgers.

---

Made with ❤️ for AdGen Pharma
