# Agent Dashboard Call Workspace Removal Design

## Goal

Remove the agent dashboard calling workspace so the dashboard becomes a summary-only surface, while `My Leads` remains the single place where agents call leads and update dispositions.

## Scope

This change applies to the agent dashboard in [frontend/src/pages/agent/AgentDashboard.tsx](frontend/src/pages/agent/AgentDashboard.tsx).

In scope:

- Remove the dashboard `Next Lead` or `Overdue Follow-up` workspace card on desktop
- Remove the dashboard lead queue card on mobile
- Remove dashboard-only call and disposition interactions tied to that workspace
- Keep dashboard metrics, break controls, recent activity, follow-ups, and disposition summary visible

Out of scope:

- `My Leads` calling workflow
- Agent lead profile behavior
- Agent calls history page
- Backend APIs

## User Experience

### Dashboard Role

The agent dashboard should act as an overview page only.

It should continue to show:

- Today summary metrics
- Break state and break controls
- Recent activity
- Follow-ups
- Today's disposition summary

It should no longer show:

- A lead queue card
- A next lead card
- Dashboard call initiation controls
- Dashboard manual disposition logging controls

### Calling Workflow

Agents should perform call initiation and disposition updates from `My Leads`, not from the dashboard.

## Technical Approach

- Remove the dashboard card that renders `currentLead`, `showDisposition`, `CallTimer`, and `DispositionPanel`
- Remove dashboard-only state and mutations that exist exclusively for that workspace
- Keep the dashboard data queries that still back visible sections
- Preserve follow-up completion and dashboard summary refresh behavior

## Validation

Validation should include:

- Frontend build passes
- Agent dashboard renders without the lead queue or next lead card on desktop
- Agent dashboard renders without the lead queue card on mobile
- Recent activity, follow-ups, and disposition stats still render correctly
- `My Leads` remains unchanged as the place for call and disposition work

## Risks

- Removing the workspace can leave unused imports, state, or queries behind if cleanup is incomplete
- Some dashboard actions currently load a lead into the removed workspace and will need either removal or neutral treatment

## Recommendation

Remove the dashboard calling workspace entirely and keep the agent dashboard focused on summary, recent activity, follow-ups, and disposition stats, with `My Leads` as the sole call-and-disposition workflow.