# Telesales CRM — Design Specification

**Date:** 2026-04-22  
**Status:** Approved  
**Project:** crm-test

---

## 1. Overview

A purpose-built Telesales CRM for a single organisation managing cold calling operations at scale. The system enables admins to upload large lead datasets, organise them into campaigns, assign them to agents, and comprehensively track performance — all with tight access control and rich analytics.

### Goals
- Give agents a focused, distraction-free workspace for calling, tagging, and following up on leads
- Give admins and supervisors full visibility and control over data, agents, and campaign outcomes
- Make re-running failed/uncontacted leads (RNR, Busy, Not Interested) trivial
- Support VIP data with restricted agent access
- Be provider-agnostic for telephony (Click-to-Call, integrate Exotel/MCUBE/Twilio later)

---

## 2. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | Agent and admin UI |
| Backend | Node.js + Express.js | REST API + WebSocket server |
| Primary DB | PostgreSQL | All relational data |
| Cache / Queue | Redis + BullMQ | CSV processing jobs, session cache |
| Real-time | Socket.io | Live notifications, agent activity |
| Auth | JWT (access + refresh tokens) | Stateless auth |
| ORM | Prisma | Type-safe DB access |
| Dev Infrastructure | Docker Compose | PostgreSQL + Redis for local dev |

### Development Setup (Docker Compose)
The local dev environment will spin up via a single `docker-compose up`:
- **PostgreSQL** container (port 5432) — primary database
- **Redis** container (port 6379) — BullMQ job queue + session cache
- **Backend** runs natively via `npm run dev` (nodemon)
- **Frontend** runs natively via `npm run dev` (Vite)

---

## 3. User Roles

Three roles in a strict hierarchy. Each role can only act within its scope.

### 3.1 Admin
- Full system access — all campaigns, all agents, all data
- Upload CSV / create campaigns
- Assign leads to any agent or team
- Manage user accounts (create, edit, deactivate agents and supervisors)
- View system-wide analytics and extract any report
- Purge/reclaim data from any agent
- Configure disposition tags, call scripts, DND blocklist

### 3.2 Supervisor (Team Lead)
- Scoped to their assigned team of agents
- View and manage leads assigned to their team's agents
- Reassign leads between agents within their team
- Purge/reclaim data from agents in their team
- View analytics and export reports for their team only
- Cannot upload new data or create campaigns
- Cannot access other teams' data

### 3.3 Agent
- Sees only leads explicitly assigned to them
- Performs calls, applies disposition tags, adds comments
- Schedules follow-ups
- Views their own performance stats only
- Cannot see other agents' data or full phone numbers (data masking applied)

---

## 4. Core Architecture — Campaign Model

All lead data is organised around **Campaigns**. This is the fundamental data architecture decision.

### 4.1 Campaign Lifecycle

```
Admin Creates Campaign
        ↓
Upload CSV (BullMQ processes async — handles 100K rows without blocking)
        ↓
Deduplication (by phone number within campaign)
        ↓
Assign leads to specific agents (split evenly or manually distribute)
        ↓
Agents call & tag leads
        ↓
Admin filters by tag → exports → creates new campaign for re-run
```

### 4.2 Campaign Types

| Type | Description |
|---|---|
| **Standard** | Normal campaign open to assigned agents |
| **VIP** | Restricted to a named list of agents only. All other agents cannot see or access these leads. |

### 4.3 Data Reclamation
Admin or Supervisor can "reclaim" leads from an agent — the leads are unassigned from that agent (`assigned_to = NULL`) but remain in the database under the campaign. Reclaimed leads can be reassigned to another agent or left in an unassigned pool.

This is used when:
- An agent leaves
- Data is unused / idle for too long
- Rebalancing agent workloads

---

## 5. Modules

### 5.1 Agent Calling Workspace

The primary interface agents use all day. Optimised for speed and minimal friction.

**Features:**
- Lead list with search, filter by status, and priority sort
- Priority Queue — hot leads (admin-flagged high priority) surfaced at top
- **Click-to-Call button** — triggers the telephony provider API (provider-agnostic adapter, initially stubbed). Call is logged automatically on trigger.
- **Live call timer** — starts automatically when call is initiated, stops on disposition save
- **Disposition tag selector** — appears immediately after call ends (mandatory before moving to next lead):
  - RNR (Ring No Response)
  - Busy
  - Interested → automatically marks as Lead
  - Not Interested
  - Callback (triggers follow-up scheduler)
  - DND (Do Not Disturb)
  - Invalid Number
  - Custom tags (admin-configurable)
- **Notes / Comments field** — free-text, appended to lead history on each call
- **Follow-up scheduler** — date + time picker, creates a follow-up record
- **Customer history panel** — all previous call logs, tags, and comments for this lead
- **Data masking** — phone numbers displayed as `+91 98765 XXXXX` (last 5 digits masked). Full number is only used server-side to initiate the call.
- **Break tracker** — agent clicks "Start Break" / "End Break". Tracked for admin analytics.

### 5.2 Campaign & Data Management

Admin-facing module for ingesting and distributing lead data.

**Features:**
- Create campaign with: name, description, type (Standard/VIP), priority level
- For VIP campaigns: select allowed agents from a list
- Upload CSV or Excel file (columns: phone, email, name + any extra custom columns)
- Upload processed asynchronously via BullMQ (progress bar shown to admin)
- Duplicate phone number detection within the same campaign — flagged, not imported
- Assign leads to agents: select agents + choose split method (even split / manual)
- Campaign status management: Active → Paused → Closed
- Data Reclamation: select agent → unassign all or selected leads → leads return to unassigned pool
- Priority assignment: admin can mark specific leads as high-priority

### 5.3 Disposition Tags

Tags are the core classification system. Each call must end with exactly one disposition tag.

**Default tags (system):**
| Tag | Meaning | Behaviour |
|---|---|---|
| RNR | Ring No Response | Lead stays in queue |
| Busy | Customer was busy | Lead stays in queue |
| Interested | Customer expressed interest | Lead status = Lead |
| Not Interested | Customer declined | Lead status = Closed |
| Callback | Requested callback | Opens follow-up scheduler |
| DND | Do Not Disturb | Lead status = DND, excluded from re-runs |
| Invalid Number | Wrong/unreachable number | Lead status = Invalid |

**Custom tags:** Admin can define additional tags (e.g. "Language Barrier", "Call Back After 6PM") with custom colours.

### 5.4 Admin Control Panel

**Features:**
- **Tag-based extraction:** Filter all leads across any campaign by one or more disposition tags → export as CSV
- **Re-run flow:** Filter → Export filtered leads → Create new campaign from that export → Assign to agents
- **Lead reassignment:** Move individual or bulk leads from one agent to another
- **Agent management:** Create, edit, deactivate users. Assign to teams/supervisors.
- **Call script editor:** Rich-text editor for call scripts/pitch guides, visible to agents during calls
- **DND / blocklist management:** Upload or manually enter numbers to block from all campaigns
- **Campaign oversight:** See all campaigns, their status, lead counts, and completion percentages

### 5.5 Analytics & Reports

All analytics support custom date ranges (daily, weekly, monthly).

**Campaign-level:**
- Total leads, contacted %, conversion rate (Interested/Lead ÷ total)
- Tag distribution (pie chart)
- Calls per day (line chart)
- Leads remaining by status

**Agent-level:**
- Call count per agent (bar chart / leaderboard)
- Average call duration
- Conversion rate per agent
- Break time vs. active call time ratio
- Disposition tag breakdown per agent
- Calls by hour of day (heatmap)

**Export:**
- Any report exportable as CSV
- Filter by: campaign, agent, date range, disposition tag

### 5.6 Follow-up Engine

**Features:**
- Agent schedules a follow-up during/after a call (date + time)
- On agent login, a "Due Today" panel shows all follow-ups due that day, ordered by time
- Overdue follow-ups (past due date, not completed) highlighted in red
- In-app bell notification (Socket.io) fires 15 minutes before a scheduled follow-up
- Agent marks follow-up as Done or reschedules
- Auto-escalation: if follow-up is missed for 24h, supervisor receives an in-app notification
- Agent calendar view: monthly view of all scheduled follow-ups

### 5.7 Data Reclamation Module

A dedicated admin/supervisor view for managing idle or unused lead data.

**Features:**
- View all agents with their assigned lead counts
- Filter by agent + campaign to find unused/uncalled leads
- Bulk select leads to reclaim (unassign from agent)
- Reclaimed leads shown in campaign's "Unassigned Pool"
- Reassign reclaimed leads individually or in bulk to another agent
- Reclaimed data is never deleted — always retained in the database

---

## 6. Database Schema

### Core Tables

```sql
-- Users
users (
  id UUID PRIMARY KEY,
  name TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  role ENUM('admin', 'supervisor', 'agent'),
  team_id UUID REFERENCES teams(id),
  status ENUM('active', 'inactive', 'on_break'),
  break_started_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ
)

-- Teams
teams (
  id UUID PRIMARY KEY,
  name TEXT,
  supervisor_id UUID REFERENCES users(id),
  created_at TIMESTAMPTZ
)

-- Campaigns
campaigns (
  id UUID PRIMARY KEY,
  name TEXT,
  description TEXT,
  type ENUM('standard', 'vip'),
  status ENUM('active', 'paused', 'closed'),
  priority ENUM('normal', 'high'),
  created_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ,
  closed_at TIMESTAMPTZ
)

-- Campaign ↔ Agent access control (for VIP campaigns)
campaign_agents (
  campaign_id UUID REFERENCES campaigns(id),
  agent_id UUID REFERENCES users(id),
  PRIMARY KEY (campaign_id, agent_id)
)

-- Leads (core data)
leads (
  id UUID PRIMARY KEY,
  campaign_id UUID REFERENCES campaigns(id),
  phone TEXT,                        -- stored hashed/masked at rest
  email TEXT,
  name TEXT,
  custom_fields JSONB,               -- extra columns from CSV upload
  assigned_to UUID REFERENCES users(id),  -- NULL = unassigned pool
  status ENUM('uncontacted', 'contacted', 'lead', 'not_interested', 'dnd', 'invalid', 'callback'),
  priority ENUM('normal', 'high'),
  is_dnd BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ,
  last_called_at TIMESTAMPTZ
)

-- Call Logs (immutable record of every call attempt)
call_logs (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  agent_id UUID REFERENCES users(id),
  disposition_tag TEXT,
  duration_seconds INTEGER,
  notes TEXT,
  telephony_ref TEXT,                -- provider call ID (populated when integrated)
  called_at TIMESTAMPTZ
)

-- Follow-ups
follow_ups (
  id UUID PRIMARY KEY,
  lead_id UUID REFERENCES leads(id),
  agent_id UUID REFERENCES users(id),
  scheduled_at TIMESTAMPTZ,
  status ENUM('pending', 'done', 'missed', 'rescheduled'),
  created_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
)

-- Disposition Tags (custom + system)
disposition_tags (
  id UUID PRIMARY KEY,
  name TEXT UNIQUE,
  colour TEXT,
  is_system BOOLEAN DEFAULT FALSE,
  created_by UUID REFERENCES users(id)
)

-- Break Logs
break_logs (
  id UUID PRIMARY KEY,
  agent_id UUID REFERENCES users(id),
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ
)
```

### Key Indexes
```sql
-- Fast lead lookup by agent
CREATE INDEX idx_leads_assigned_to ON leads(assigned_to);
-- Fast lead lookup by campaign + status (admin extraction)
CREATE INDEX idx_leads_campaign_status ON leads(campaign_id, status);
-- Fast call log lookup for analytics
CREATE INDEX idx_call_logs_agent_called ON call_logs(agent_id, called_at);
-- Follow-up due-today query
CREATE INDEX idx_followups_agent_scheduled ON follow_ups(agent_id, scheduled_at);
```

---

## 7. Telephony — Provider-Agnostic Abstraction

The CRM is built with a telephony adapter interface so the provider can be plugged in later with zero changes to business logic.

```
ITelephonyProvider interface:
  - initiateCall(agentPhone, customerPhone) → callRef
  - getCallStatus(callRef) → { status, duration }
  - receiveWebhook(payload) → CallEvent

Implementations:
  - StubProvider (default, for dev — logs call to console)
  - ExotelProvider (future)
  - MCubeProvider (future)
  - TwilioProvider (future)
```

The active provider is selected via `TELEPHONY_PROVIDER=stub|exotel|mcube` environment variable.

---

## 8. Real-time Features (Socket.io)

| Event | Triggered by | Received by |
|---|---|---|
| `follow_up:due` | Cron job (15 min before) | Agent |
| `follow_up:missed_escalation` | Cron job (24h overdue) | Supervisor |
| `lead:assigned` | Admin assigns leads | Agent |
| `agent:on_break` | Agent starts break | Supervisor dashboard |
| `csv:upload_progress` | BullMQ job progress | Admin who uploaded |
| `call:logged` | Agent logs a call | Supervisor (live feed) |

---

## 9. Suggested Extra Features (Confirmed In-Scope)

| Feature | Description |
|---|---|
| **Call Timer** | Auto-starts on click-to-call, auto-stops when disposition is saved |
| **Break Tracker** | Agent clocks in/out of breaks. Tracked in analytics as break time vs call time ratio |
| **Priority Queue** | Admin can flag leads as high-priority. Surfaced first in agent's list. |
| **Data Masking** | Agents see `+91 98765 XXXXX` — server uses full number to initiate call |
| **Call Script / Pitch Guide** | Admin creates rich-text scripts per campaign. Agent sees collapsible panel during calls. |
| **DND Blocklist** | Uploaded or manually entered numbers excluded from all campaigns. Checked at import. |

---

## 10. Out of Scope (Phase 1)

The following are intentionally excluded from Phase 1 to keep scope tight:

- Auto-dialer / predictive dialer (future phase)
- WhatsApp / SMS integration (future phase)
- Email nurture sequences (future phase)
- Mobile app (desktop web browser only for Phase 1)
- Multi-tenant / multi-organisation support (single org only)
- Call recording playback (depends on telephony provider)

---

## 11. Build Phases

### Phase 1 — Core CRM
Auth + Roles · Campaign Management · CSV Upload (BullMQ) · Agent Calling Workspace · Disposition Tagging · Comments · Follow-up Scheduler · Data Masking · Data Reclamation

### Phase 2 — Admin Control + Analytics
Admin Control Panel · Tag-based extraction · Re-run flow · Analytics dashboards · Report export · Supervisor team views · Break Tracker analytics

### Phase 3 — Intelligence & Polish
Priority Queue · Call Script editor · DND management · Socket.io real-time events · Telephony provider integration · Performance leaderboards · Calendar view

---

*Spec approved on 2026-04-22. Next step: Implementation plan.*
