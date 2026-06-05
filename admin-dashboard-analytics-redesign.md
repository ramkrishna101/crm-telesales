# Admin Dashboard Analytics Redesign

## Goal
Rebuild the admin dashboard with stronger chart sections and a focused backend summary contract while preserving existing routes, filters, and role behavior.

## Tasks
- [ ] Add admin dashboard summary contract in backend -> Verify: one admin endpoint returns KPIs, previous-period deltas, funnel, call trends, agent ranking, campaign ranking, and watchlist metrics for a selected range
- [ ] Reuse existing query helpers where practical -> Verify: backend summary accepts current date range and optional campaign filter without duplicating unrelated logic
- [ ] Add frontend dashboard query and data mapping -> Verify: admin dashboard consumes one summary query for charts instead of stitching all chart data from generic list endpoints
- [ ] Rebuild admin dashboard sections and chart layout -> Verify: page shows KPI strip, funnel, call performance, agent performance, campaign performance, and watchlist sections
- [ ] Keep drill-ins and filter behavior intact -> Verify: date range and campaign filters still work and existing navigation links remain valid
- [ ] Validate backend and frontend -> Verify: `npm --prefix backend run build` and `npm --prefix frontend run build` pass

## Done When
- [ ] Admin dashboard reads as a chart-heavy control center with current-range charts and previous-period KPI deltas
- [ ] Backend additions stay scoped to dashboard analytics rather than a broad reporting system