# Agent Dashboard Workspace Removal

## Goal
Remove the dashboard-only calling workspace from the agent dashboard and leave calling/disposition work in `My Leads`.

## Tasks
- [ ] Remove the dashboard lead queue or next lead card from desktop and mobile dashboard layouts. → Verify: dashboard no longer shows a lead card, call button, or dashboard disposition panel.
- [ ] Remove dashboard-only state, mutations, queries, and helper components that existed only for that workspace. → Verify: `AgentDashboard.tsx` no longer references the removed call workflow internals.
- [ ] Clean up recent activity, follow-up, and disposition-summary interactions so they no longer try to load a lead into the removed workspace. → Verify: dashboard still renders these sections and their remaining actions work.
- [ ] Keep dashboard summary, break controls, recent activity, follow-ups, and disposition stats intact. → Verify: those sections still render on desktop and mobile.
- [ ] Run frontend build validation. → Verify: `npm --prefix frontend run build` passes.

## Done When
- [ ] Agent dashboard is summary-only on desktop and mobile.
- [ ] `My Leads` remains the active place for call and disposition work.
- [ ] Frontend build passes.