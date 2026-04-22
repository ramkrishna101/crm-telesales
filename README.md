# 📞 TeleCRM — Telesales CRM Platform

A full-stack, production-ready CRM for telesales operations. Built with React, Express 5, PostgreSQL, Redis, BullMQ, and Socket.io.

---

## ✨ Features

### Admin
- **Dashboard** — KPIs, live agent status, disposition breakdown, campaign overview
- **Users** — Role-based CRUD (Admin / Supervisor / Agent), deactivate/reactivate
- **Teams** — Create teams, assign supervisors, add/remove members inline
- **Campaigns** — Card grid, pause/resume, type/priority management
- **Leads** — CSV/Excel bulk upload (async via BullMQ), bulk assign/reclaim, DND filtering
- **Disposition Tags** — System tags (read-only) + custom colour-coded tags
- **Analytics** — Daily call volume, duration trend, 24h heatmap, disposition doughnut, agent leaderboard

### Supervisor
- **Team Overview** — KPIs, agent performance chart, unassigned lead queue, real-time activity feed
- **Agent Management** — Connect rate stats, call vs connected comparison chart

### Agent Workspace
- **Priority Queue** — Overdue follow-ups → High priority → Normal
- **Live Call Flow** — Initiate call → running timer → End → Disposition panel
- **Disposition Panel** — Colour-coded tag selection, call script display, callback scheduler
- **Follow-up Tracker** — Today's follow-ups with overdue warnings
- **Break Management** — Start/End break with live running timer

### Real-Time (Socket.io)
- Follow-up created notifications
- Lead assignment notifications
- 5-minute follow-up overdue reminders

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, TypeScript, Vite, React Query, Chart.js, Socket.io-client |
| **Backend** | Express 5, TypeScript, Prisma ORM |
| **Database** | PostgreSQL 16 |
| **Queue** | BullMQ + Redis 7 |
| **Real-time** | Socket.io |
| **Auth** | JWT (access 15m + refresh 7d) |
| **Infra** | Docker Compose, nginx (production) |

---

## 🚀 Quick Start (Development)

### Prerequisites
- Node.js 20+
- Docker (for PostgreSQL and Redis)

### 1. Start infrastructure

```bash
# Start only the DB and Redis (no backend/frontend containers)
docker compose up db redis -d
```

### 2. Backend setup

```bash
cd backend
cp ../.env.example .env    # Edit DATABASE_URL, REDIS_URL, JWT secrets
npm install
npm run db:migrate          # Run Prisma migrations
npm run db:seed             # Seed demo data (admin + agents)
npm run dev                 # http://localhost:4000
```

### 3. Frontend setup

```bash
cd frontend
npm install
npm run dev                 # http://localhost:5173
```

---

## 🐳 Production (Docker)

```bash
# Copy and fill in production values
cp .env.example .env

# Build and start all services
docker compose up -d --build

# Check health
docker compose ps
curl http://localhost:4000/health
```

Optional BullMQ dashboard:
```bash
docker compose --profile dev-tools up bull-board
# http://localhost:3001
```

---

## 👥 Demo Accounts

After seeding (`npm run db:seed`):

| Role | Email | Password |
|---|---|---|
| Admin | admin@crm.com | admin@123 |
| Supervisor | supervisor@crm.com | supervisor@123 |
| Agent 1 | agent1@crm.com | agent@123 |
| Agent 2 | agent2@crm.com | agent@123 |

---

## 📡 API Reference

### Auth
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/auth/login` | Login, returns access + refresh tokens |
| POST | `/api/auth/refresh` | Refresh access token |
| POST | `/api/auth/logout` | Revoke refresh token |
| GET | `/api/auth/me` | Current user profile |

### Leads
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/leads` | List leads (filtered by role) |
| POST | `/api/leads/upload/:campaignId` | Bulk CSV/Excel upload |
| GET | `/api/leads/upload/status/:jobId` | Upload job progress |
| POST | `/api/leads/assign` | Assign leads to agent |
| POST | `/api/leads/reclaim` | Unassign leads |

### Agent Workspace
| Method | Endpoint | Description |
|---|---|---|
| GET | `/api/agent/dashboard` | Agent stats + follow-ups + tag breakdown |
| GET | `/api/agent/next-lead` | Priority queue next lead |
| POST | `/api/agent/break/start` | Start break |
| POST | `/api/agent/break/end` | End break |
| POST | `/api/agent/call/initiate` | Click-to-call (stub) |

### Calls & Analytics
| Method | Endpoint | Description |
|---|---|---|
| POST | `/api/calls` | Log call with disposition |
| GET | `/api/calls` | List calls (role-scoped) |
| GET | `/api/calls/summary` | Heatmap, leaderboard, daily totals |

---

## 🔒 RBAC Matrix

| Endpoint | Admin | Supervisor | Agent |
|---|:---:|:---:|:---:|
| User CRUD | ✅ | ❌ | ❌ |
| Team management | ✅ | ❌ | ❌ |
| Campaign CRUD | ✅ | ❌ | ❌ |
| Lead upload | ✅ | ❌ | ❌ |
| Lead assign/reclaim | ✅ | ✅ | ❌ |
| View all calls | ✅ | ✅ | ❌ |
| Log call | ✅ | ✅ | ✅ |
| Agent workspace | ❌ | ❌ | ✅ |
| Analytics | ✅ | ✅ | ❌ |

---

## 📁 Project Structure

```
crm-test/
├── backend/
│   ├── src/
│   │   ├── modules/        # auth, users, teams, campaigns, leads, calls, agent
│   │   ├── jobs/           # leadUpload.worker, followUpReminder.job
│   │   ├── middleware/     # auth, rbac, errorHandler
│   │   └── lib/            # prisma, redis, jwt
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── pages/          # admin, supervisor, agent
│   │   ├── components/     # AppLayout, shared UI
│   │   ├── hooks/          # useSocket
│   │   ├── services/       # crm.service, api
│   │   └── store/          # authStore (Zustand)
│   └── Dockerfile
├── docker-compose.yml
└── .env.example
```

---

## 🔮 Roadmap

- [ ] **Telephony Integration** — Exotel / Twilio / Ozonetel click-to-call
- [ ] **Auto-dialer Mode** — Power dialer with predictive pacing
- [ ] **Campaign Scripts** — Per-campaign call scripts with dynamic fields
- [ ] **WhatsApp Follow-up** — Post-call WhatsApp message templates
- [ ] **Multi-tenant** — Isolated workspaces per organisation
