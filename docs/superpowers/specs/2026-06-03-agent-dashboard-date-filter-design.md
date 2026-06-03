# Agent Dashboard Date Filter Design

## Goal

Add the same date-range filter pattern used on the admin dashboard to the agent dashboard, scoped to the logged-in agent's own dashboard data, and make `Today` the default dashboard date range for both admin and agent dashboards.

## Scope

This change applies to:

- Agent dashboard in [frontend/src/pages/agent/AgentDashboard.tsx](frontend/src/pages/agent/AgentDashboard.tsx)
- Admin dashboard default date range in [frontend/src/pages/admin/AdminDashboard.tsx](frontend/src/pages/admin/AdminDashboard.tsx)
- Agent dashboard API in [backend/src/modules/agent/agent.routes.ts](backend/src/modules/agent/agent.routes.ts)
- Agent dashboard service call in [frontend/src/services/crm.service.ts](frontend/src/services/crm.service.ts)

In scope:

- Add a shared `DateRangeFilter` control to the agent dashboard
- Scope agent dashboard data to the selected date range for that logged-in agent only
- Change the default dashboard preset to `Today` on both admin and agent dashboards

Out of scope:

- Leads page filters
- Agent `My Leads` filters
- Admin calls page filters
- Non-dashboard API behavior

## User Experience

### Shared Dashboard Default

Both admin and agent dashboards should load with `Today` selected by default.

### Agent Dashboard Filter

The agent dashboard should show the same date filter control style used on the admin dashboard.

The filter should affect the logged-in agent's own dashboard data only.

### Agent Dashboard Sections Affected

The selected date range should scope:

- Summary cards
- Recent activity
- Follow-ups
- Disposition breakdown

The data should remain agent-specific and should never expand to other agents.

### Break State

The live current break state should remain visible as it is today.

Break minutes shown on the dashboard should reflect the selected date range.

## Technical Approach

- Reuse the existing shared `DateRangeFilter` component on the agent dashboard
- Update `agentService.dashboard` to accept optional `from` and `to` params
- Update the backend agent dashboard route to read `from` and `to` query params and apply them to agent-scoped dashboard queries
- Keep all dashboard data restricted to the authenticated agent
- Change admin dashboard default preset from `last_7_days` to `today`
- Set the new agent dashboard default preset to `today`

## Validation

Validation should include:

- Frontend build passes
- Backend build passes
- Admin dashboard opens with `Today` selected by default
- Agent dashboard opens with `Today` selected by default
- Changing the agent dashboard date range updates only that agent's dashboard data
- Recent activity, follow-ups, and disposition counts update consistently for the selected range

## Risks

- Existing dashboard copy may still imply broader or fixed-today behavior if not aligned with the selected range
- Follow-up filtering must be explicit about whether it uses scheduled date within the selected range, not just "today"
- Break-state display must avoid conflating current live status with historical range totals

## Recommendation

Add the shared date-range filter to the agent dashboard, scope all agent dashboard data to the logged-in agent and selected range, and align both admin and agent dashboards to default to `Today`.