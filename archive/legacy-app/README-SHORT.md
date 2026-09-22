# MITHAQ — AI Analysis Brief

## What it is
MITHAQ (ميثاق) is an Arabic Micro-SaaS platform for generating legal contracts and templates in minutes — no lawyer needed for simple cases. Users pick a contract type, enter party details, edit clauses, sign digitally by drawing, then export/share as a formatted PDF. Paid plans are activated via USDT or Sham Cash.

## Problem it solves
- Freelancers start work without written contracts → ready template in 2 minutes + instant digital signature.
- Lawyers are expensive for simple/repeated contracts → free reviewed templates with core legal clauses.
- Western tools don't support Arabic/local context → fully Arabic UI and contracts (RTL, Arabic dates).
- Global payment methods unavailable locally → USDT (TRC20) + Sham Cash.
- Contracts scattered in WhatsApp/paper → central encrypted archive + share links + signature status.

## Target users
Freelancers, small business owners, print/service shops.

## Key features
- **Contract generation:** 8 ready templates (rent, sale, services, freelance, pledge, supply, partnership, NDA); fully editable clauses; autosave draft in browser; search/filter/favorites; JSON backup export/import.
- **PDF:** dedicated print page (`/print/:id`), A4 design with logo, e-stamp, numbered clauses, party cards, disclaimer; also TXT/HTML export.
- **Digital signing:** mouse/touch signature pad per party, with proof log (name, time, device, IP); auto status `partially_signed` → `signed`; signatures appear in printed PDF.
- **Sharing/review:** public share link (`/share/:id`), paid legal-review requests stored server-side.
- **Auth:** optional Google OAuth (Google Identity Services), stored locally.
- **Payments:** USDT TRC20 (wallet address + TXID verification), Sham Cash webhook (`/api/payments/shamcash/webhook`), 5 plans (Freemium, $5/$9/$15/$49) + legal review ($25+); auto "Premium" badge on confirmation.
- **Security:** AES-256-GCM encryption at rest for contracts (auto-migration from plaintext), server-side input validation, HTML sanitization (XSS), 2MB request limit, configurable CORS, atomic file writes.
- **UX:** dark mode, data-saver mode, fully responsive (mobile slide sidebar), toasts, Escape shortcut.

## Tech stack
- **Frontend:** HTML5 + CSS3 (RTL, CSS variables) + vanilla JS (IIFE, zero build deps); Cairo + Noto Naskh Arabic fonts; Font Awesome 6.5.
- **Backend:** Node.js raw HTTP module (no Express), port 5000.
- **Database:** JSON files (`backend/data/`) encrypted with AES-256-GCM; planned upgrade to SQLite/Postgres.
- **Notifications:** Telegram Bot API (daily reports + webhook commands).
- **Deploy:** any Node host (Railway, Render, VPS).

## Structure
```
frontend/index.html        # main single-file UI (design + logic)
frontend/*.html            # marketing carousel, brand identity, agents council, design studio
backend/server.js          # full server: API + pages + print
backend/data/*.json        # contracts (encrypted), payments, review requests
```

## Setup
```bash
npm install
cp .env.example .env
npm run dev        # http://localhost:5000  (health: /api/health → {"ok":true})
```
Requires Node.js 18+.

## Key env vars
- `ENCRYPTION_KEY` (required in prod): AES-256 key, ≥24 chars.
- `USDT_TRC20_ADDRESS`: receiving wallet for payments.
- `GOOGLE_CLIENT_ID` (optional): Google OAuth.
- `CORS_ORIGIN`, `PORT`, `HOST`.
- `TELEGRAM_BOT_TOKEN` / `TELEGRAM_CHAT_ID` (optional).
- `ALLOW_DEMO_CONFIRM` (dev only, must be false in prod).
- `CRYPTOMUS_MERCHANT_ID` / `CRYPTOMUS_API_KEY` (planned gateway).

## Roadmap
- [x] Contract generation + 8 templates, PDF + share links, digital signing with proof log, USDT/Sham Cash payments, AES encryption, dark mode.
- [ ] Cryptomus auto gateway (HMAC-signed webhook), real DB (SQLite → Postgres) with user accounts, smart clause engine, admin dashboard, expanded template library, PWA, English UI.

## Status
v1.0.0, MIT license. Generated contracts are organizational drafts, not a substitute for a lawyer in complex/high-value cases.
