# Agent Dashboard Date Filter

## Goal
Add an agent-specific dashboard date filter, using the shared dashboard date-range control, and make `Today` the default on both admin and agent dashboards.

## Tasks
- [ ] Add `from` and `to` support to the agent dashboard API and keep all results scoped to the logged-in agent. → Verify: backend route returns filtered stats, recent calls, follow-ups, and tag counts for the selected range.
- [ ] Update the frontend agent dashboard service call to pass optional date params. → Verify: dashboard query sends the selected `from` and `to` values.
- [ ] Add the shared `DateRangeFilter` to the agent dashboard and wire it into the query key and dashboard request. → Verify: changing the date filter refetches agent dashboard data.
- [ ] Change both admin and agent dashboard default date presets to `Today`. → Verify: both dashboards initialize with the `Today` preset.
- [ ] Run backend and frontend build validation. → Verify: `npm --prefix backend run build` and `npm --prefix frontend run build` pass.

## Done When
- [ ] Agent dashboard data is filtered by the selected date range for the logged-in agent only.
- [ ] Admin and agent dashboards both default to `Today`.
- [ ] Backend and frontend builds pass.
