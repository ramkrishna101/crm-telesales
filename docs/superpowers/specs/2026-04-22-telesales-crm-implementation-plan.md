# Telesales CRM — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-04-22-telesales-crm-design.md`  
**Date:** 2026-04-22  
**Stack:** React (Vite) · Express.js · PostgreSQL · Redis · BullMQ · Socket.io · Prisma · Docker

---

## Project Structure

```
crm-test/
├── docker-compose.yml          # PostgreSQL + Redis
├── .env.example
├── backend/
│   ├── src/
│   │   ├── index.ts            # Express + Socket.io entry
│   │   ├── config/
│   │   ├── middleware/         # auth, role guards, error handler
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   ├── users/
│   │   │   ├── teams/
│   │   │   ├── campaigns/
│   │   │   ├── leads/
│   │   │   ├── calls/
│   │   │   ├── follow-ups/
│   │   │   ├── analytics/
│   │   │   ├── telephony/      # provider-agnostic adapter
│   │   │   └── notifications/
│   │   ├── jobs/               # BullMQ workers
│   │   ├── sockets/            # Socket.io event handlers
│   │   └── lib/                # prisma client, redis client
│   ├── prisma/
│   │   └── schema.prisma
│   └── package.json
└── frontend/
    ├── src/
    │   ├── main.tsx
    │   ├── App.tsx
    │   ├── router/
    │   ├── pages/
    │   │   ├── auth/
    │   │   ├── admin/
    │   │   ├── supervisor/
    │   │   └── agent/
    │   ├── components/
    │   ├── hooks/
    │   ├── services/            # API client
    │   └── store/               # Zustand state
    └── package.json
```

---

## Phase 1 — Core CRM

> Auth · Data Ingestion · Agent Workspace · Tagging · Follow-ups · Data Reclamation

---

### Task 1.1 — Project Scaffolding

**Goal:** Working monorepo with hot-reload for both frontend and backend.

- [ ] Create `backend/` — init Node.js + TypeScript project
  - Dependencies: `express`, `prisma`, `@prisma/client`, `socket.io`, `bullmq`, `ioredis`, `bcryptjs`, `jsonwebtoken`, `multer`, `csv-parser`, `xlsx`, `zod`, `cors`, `helmet`, `dotenv`, `nodemon`, `ts-node`
- [ ] Create `frontend/` — scaffold with `npm create vite@latest . -- --template react-ts`
  - Dependencies: `axios`, `react-router-dom`, `zustand`, `react-query`, `socket.io-client`, `react-hook-form`, `zod`, `date-fns`, `recharts`, `react-hot-toast`
- [ ] Create `docker-compose.yml`:
  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      ports: ["5432:5432"]
      environment:
        POSTGRES_DB: crm_db
        POSTGRES_USER: crm_user
        POSTGRES_PASSWORD: crm_pass
      volumes: [postgres_data:/var/lib/postgresql/data]
    redis:
      image: redis:7-alpine
      ports: ["6379:6379"]
  ```
- [ ] Create `.env.example`:
  ```
  DATABASE_URL=postgresql://crm_user:crm_pass@localhost:5432/crm_db
  REDIS_URL=redis://localhost:6379
  JWT_ACCESS_SECRET=
  JWT_REFRESH_SECRET=
  JWT_ACCESS_EXPIRES_IN=15m
  JWT_REFRESH_EXPIRES_IN=7d
  TELEPHONY_PROVIDER=stub
  PORT=4000
  ```
- [ ] Add root `package.json` with `dev` script running both backend + frontend concurrently

---

### Task 1.2 — Database Schema (Prisma)

**Goal:** Full schema reflecting the spec. All migrations runnable from clean state.

- [ ] Write `backend/prisma/schema.prisma` with all models:
  - `User` (id, name, email, passwordHash, role, teamId, status, breakStartedAt, createdAt)
  - `Team` (id, name, supervisorId, createdAt)
  - `Campaign` (id, name, description, type, status, priority, createdBy, createdAt, closedAt)
  - `CampaignAgent` (campaignId, agentId) — VIP access control
  - `Lead` (id, campaignId, phone, email, name, customFields Json, assignedTo, status, priority, isDnd, createdAt, lastCalledAt)
  - `CallLog` (id, leadId, agentId, dispositionTag, durationSeconds, notes, telephonyRef, calledAt)
  - `FollowUp` (id, leadId, agentId, scheduledAt, status, createdAt, completedAt)
  - `DispositionTag` (id, name, colour, isSystem, createdBy)
  - `BreakLog` (id, agentId, startedAt, endedAt)
- [ ] Add all composite indexes (see spec §6)
- [ ] Run `prisma migrate dev --name init`
- [ ] Write `seed.ts`: 1 admin, 1 supervisor, 3 agents, system disposition tags
- [ ] Run `prisma db seed` — verify all tables created

---

### Task 1.3 — Auth System

**Goal:** Secure login with JWT access + refresh tokens. Role-based middleware.

**Backend:**
- [ ] `POST /api/auth/login` — validate credentials, return `{ accessToken, refreshToken, user }`
- [ ] `POST /api/auth/refresh` — verify refresh token, issue new access token
- [ ] `POST /api/auth/logout` — blacklist refresh token in Redis
- [ ] `authenticate` middleware — verify JWT, attach `req.user`
- [ ] `requireRole(...roles)` middleware — check `req.user.role`
- [ ] Passwords hashed with `bcryptjs` (12 rounds)
- [ ] Refresh tokens stored in Redis with TTL = 7 days

**Frontend:**
- [ ] Login page (`/login`) — email + password form
- [ ] Axios interceptor — auto-attach `Authorization: Bearer <token>` header, auto-refresh on 401
- [ ] Protected route wrapper — redirect to `/login` if unauthenticated
- [ ] Role-based route guard — redirect if wrong role
- [ ] After login → route to role dashboard: `/admin`, `/supervisor`, `/agent`

---

### Task 1.4 — User & Team Management

**Goal:** Admin creates/manages all users. Supervisor scoped to their team.

**Backend:**
- [ ] `GET /api/users` — Admin: all. Supervisor: own team only.
- [ ] `POST /api/users` — Admin only. Create agent or supervisor.
- [ ] `PUT /api/users/:id` — Admin only. Edit name, role, team, status.
- [ ] `DELETE /api/users/:id` — Admin only. Soft-delete (`status = inactive`).
- [ ] `GET /api/teams`, `POST /api/teams` — Admin only. CRUD teams + assign supervisor.

**Frontend (Admin):**
- [ ] Users list page — table with name, role, team, status, actions
- [ ] Create/Edit user modal, deactivate user confirmation dialog

---

### Task 1.5 — Campaign Management

**Goal:** Admin creates campaigns, configures VIP access, tracks status.

**Backend:**
- [ ] `GET /api/campaigns` — scoped by role (Admin: all; Agent/Supervisor: permitted only)
- [ ] `POST /api/campaigns` — Admin only.
- [ ] `PUT /api/campaigns/:id` — Admin only. Edit name, status, priority.
- [ ] `POST /api/campaigns/:id/agents` — Admin only. Set allowed agents (VIP).
- [ ] `GET /api/campaigns/:id` — details + lead count by status.
- [ ] VIP access middleware: verify `CampaignAgent` record for non-admin users.

**Frontend (Admin):**
- [ ] Campaigns list — cards with name, VIP badge, status, lead counts, progress bar
- [ ] Create campaign modal — name, description, type, priority, VIP agent selector
- [ ] Campaign detail page — status management (Pause / Close / Reactivate)

---

### Task 1.6 — CSV Upload & Lead Ingestion (BullMQ)

**Goal:** Handle 100K row files without blocking. Progress feedback to admin.

**Backend:**
- [ ] `POST /api/campaigns/:id/upload` — accept file via `multer`, queue BullMQ job, return `{ jobId }`
- [ ] BullMQ worker (`jobs/csv-import.worker.ts`):
  - Stream parse CSV row by row
  - Validate phone exists, check duplicate within campaign, insert `Lead`
  - Emit progress events every 1000 rows → Socket.io progress bar
  - Emit `csv:upload_complete` to admin socket room on finish
- [ ] `GET /api/jobs/:jobId` — job status + progress %
- [ ] Custom CSV columns beyond `phone, email, name` stored in `customFields JSONB`

**Frontend (Admin):**
- [ ] Upload button on campaign detail → file picker (CSV/XLSX)
- [ ] Real-time progress bar (Socket.io)
- [ ] Import summary: `X imported, Y duplicates skipped`

---

### Task 1.7 — Lead Assignment

**Goal:** Assign leads to agents — even split or manual selection.

**Backend:**
- [ ] `POST /api/campaigns/:id/assign` — body: `{ agentIds, splitMode: 'even'|'manual', leadIds? }`
  - Even split: divide unassigned leads equally
  - Manual: assign specific `leadIds` to specific agents
  - Bulk update `leads.assigned_to`
- [ ] `GET /api/campaigns/:id/leads` — paginated with filters: `?status=&assignedTo=&priority=`

**Frontend (Admin):**
- [ ] "Assign Leads" modal — agent multi-select, split mode toggle, lead count preview

---

### Task 1.8 — Agent Calling Workspace

**Goal:** Agent's primary daily interface. Fast, focused, minimal friction.

**Backend:**
- [ ] `GET /api/agent/leads` — paginated leads for logged-in agent; high-priority first; masked phone
- [ ] `POST /api/agent/leads/:id/call` — initiate via telephony adapter (stub); create pending `CallLog`
- [ ] `PUT /api/agent/calls/:callLogId` — save disposition, notes, duration; update `Lead.status`
- [ ] `GET /api/agent/leads/:id/history` — all call logs + follow-ups for this lead

**Frontend (Agent):**
- [ ] Lead list panel (left) — paginated, searchable, filterable
- [ ] Lead detail panel (right):
  - Customer info + masked phone
  - **Call button** → starts live call timer
  - **Disposition panel** (post-call) — tag buttons + notes + save
  - **Customer history** accordion — past call logs
  - **Follow-up scheduler** — auto-opens for Callback tag
- [ ] **Break button** in navbar — Start Break / End Break
- [ ] Due Today follow-up banner shown on login

---

### Task 1.9 — Disposition Tagging System

**Goal:** One tag per call. System + custom tags. Tags drive lead status.

**Backend:**
- [ ] Seed system tags: `RNR, Busy, Interested, Not Interested, Callback, DND, Invalid Number`
- [ ] `GET /api/tags`, `POST /api/tags` (Admin), `DELETE /api/tags/:id` (Admin, custom only)
- [ ] Server-side tag → lead status mapping enforced on `PUT /api/agent/calls/:id`

**Frontend (Admin):**
- [ ] Tag management page — list, colour swatches, create/delete custom tags

---

### Task 1.10 — Follow-up Engine

**Goal:** Agents schedule callbacks. Reminders via Socket.io. Escalation on misses.

**Backend:**
- [ ] `POST /api/follow-ups` — create: `{ leadId, scheduledAt }`
- [ ] `PUT /api/follow-ups/:id` — reschedule or mark done
- [ ] `GET /api/agent/follow-ups` — agent's pending follow-ups filtered by date
- [ ] Cron (every minute):
  - Due in 15 min, status=pending → emit `follow_up:due` to agent room
  - Overdue 24h, status=pending → set `missed`, emit `follow_up:missed_escalation` to supervisor room

**Frontend (Agent):**
- [ ] Due Today panel on dashboard
- [ ] Overdue follow-ups with red badge in lead list
- [ ] Calendar view — monthly grid with follow-up dots
- [ ] In-app notification bell — badge count + dropdown

---

### Task 1.11 — Data Reclamation Module

**Goal:** Unassign idle leads from agents, retain in DB, reassign freely.

**Backend:**
- [ ] `GET /api/admin/reclamation` — agents with assigned + uncalled counts per campaign
- [ ] `POST /api/admin/reclamation/reclaim` — unassign leads (`assigned_to = NULL`); never deletes
- [ ] `POST /api/admin/reclamation/reassign` — assign reclaimed leads to another agent

**Frontend (Admin/Supervisor):**
- [ ] Reclamation page — table: Agent · Campaign · Assigned · Uncalled · Reclaim action
- [ ] Unassigned Pool tab per campaign — bulk reassign UI

---

## Phase 2 — Admin Control + Analytics

---

### Task 2.1 — Tag-Based Lead Extraction

- [ ] `GET /api/admin/leads/extract` — filters: campaignId, tags[], agentId, dateFrom, dateTo
- [ ] `GET /api/admin/leads/extract/export` — same filters, stream CSV download
- [ ] Extraction page: filter panel → results table → "Export CSV" + "Re-run as Campaign" buttons

---

### Task 2.2 — Re-run Flow

- [ ] `POST /api/admin/campaigns/rerun` — duplicate filtered leads into new campaign (exclude DND)
- [ ] "Re-run as Campaign" modal: enter name → confirm → redirect to new campaign for assignment

---

### Task 2.3 — Campaign Analytics Dashboard

- [ ] `GET /api/analytics/campaigns/:id` — KPIs + tag distribution + calls per day
- [ ] Frontend: KPI cards · Pie chart (tag distribution) · Line chart (calls/day) · Status breakdown

---

### Task 2.4 — Agent Performance Dashboard

- [ ] `GET /api/analytics/agents` — callCount, avgDuration, conversionRate, breakTime, tagBreakdown, callsByHour per agent
- [ ] Frontend: Leaderboard table · Bar chart (calls/agent) · Calls-by-hour heatmap · Per-agent drilldown

---

### Task 2.5 — Report Export

- [ ] `GET /api/analytics/agents/export` — CSV agent performance report
- [ ] `GET /api/analytics/campaigns/:id/export` — CSV campaign report
- [ ] "Export CSV" button on every analytics page

---

### Task 2.6 — Supervisor Team Scope

- [ ] All admin API endpoints filter by `team_id` for supervisor role
- [ ] Supervisor dashboard mirrors admin analytics but pre-filtered to own team

---

### Task 2.7 — Break Tracker Analytics

- [ ] `POST /api/agent/breaks/start` / `end` — create/close `BreakLog` records
- [ ] Break duration aggregated in agent analytics: `SUM(ended_at - started_at)`
- [ ] Agent navbar: "On Break — 00:12:34" live timer
- [ ] Analytics: break time vs call time ratio per agent

---

## Phase 3 — Intelligence & Polish

---

### Task 3.1 — Priority Queue

- [ ] `PUT /api/leads/priority` — Admin bulk-set lead priority
- [ ] Agent lead list: high-priority leads sorted first, shown with 🔥 icon

---

### Task 3.2 — Call Script / Pitch Guide

- [ ] Add `script TEXT` to `Campaign` schema
- [ ] `PUT /api/campaigns/:id/script` — Admin saves rich-text content (tiptap/quill)
- [ ] Agent workspace: collapsible "Call Script" panel rendering campaign script

---

### Task 3.3 — DND / Blocklist Management

- [ ] New table: `dnd_blocklist (id, phone, added_by, added_at, reason)`
- [ ] Admin endpoints: add numbers manually or via CSV, remove, list
- [ ] CSV import worker checks each phone against blocklist before inserting

---

### Task 3.4 — Socket.io Real-time Events

- [ ] Socket.io server on Express HTTP server; authenticate via JWT query param
- [ ] Users join room `user:{userId}` on connect
- [ ] All events from spec §8 wired up: `follow_up:due`, `lead:assigned`, `csv:upload_progress`, `call:logged`, etc.
- [ ] Frontend `useSocket()` hook — connect on login, disconnect on logout
- [ ] Notification bell with badge + dropdown

---

### Task 3.5 — Telephony Provider Abstraction

- [ ] `ITelephonyProvider` interface: `initiateCall`, `getCallStatus`, `parseWebhook`
- [ ] `StubProvider` — dev mode, logs to console, returns mock callRef
- [ ] `TelephonyFactory` reads `TELEPHONY_PROVIDER` env var
- [ ] `POST /api/telephony/webhook` — public endpoint for provider callbacks

---

### Task 3.6 — Production Polish

- [ ] `helmet` + `cors` config, `express-rate-limit` on auth endpoints
- [ ] `zod` validation on all POST/PUT endpoints
- [ ] Structured error responses: `{ success: false, error: { code, message } }`
- [ ] `winston` logger — file + console + request middleware
- [ ] Frontend: loading skeletons, empty states, global error boundary
- [ ] `README.md` with setup guide, `CONTRIBUTING.md` with dev instructions

---

## Summary

| Phase | Tasks | Contains |
|---|---|---|
| Phase 1 — Core CRM | 11 | Scaffolding, schema, auth, campaigns, upload, agent workspace, tags, follow-ups, reclamation |
| Phase 2 — Admin + Analytics | 7 | Extraction, re-run, dashboards, reports, supervisor scope |
| Phase 3 — Polish | 6 | Priority queue, scripts, DND, real-time, telephony, production hardening |
| **Total** | **24** | |

## Recommended Build Order (Phase 1)

```
1.1 Scaffolding → 1.2 Schema → 1.3 Auth → 1.4 Users/Teams
→ 1.5 Campaigns → 1.6 CSV Upload → 1.7 Assignment
→ 1.8 Agent Workspace → 1.9 Tags → 1.10 Follow-ups → 1.11 Reclamation
```
