# Admin Calls Log Plan

## Goal

Replace the admin calls dashboard fallback with a dedicated logs-only page that supports agent, date, and call-result filtering plus paginated talk-time-aware call logs.

## Tasks
- [x] Update the calls list API to handle full-day date filtering and return the fields needed by the admin log table. → Verify: filtered `/api/calls` responses include end-date results and campaign data when present.
- [x] Add an admin calls page component that fetches agents, tags, and paginated call logs using the selected filters. → Verify: `/admin/calls` renders header, filters, loading state, empty state, and rows.
- [x] Wire the new admin calls page into the admin router without affecting other routes. → Verify: the `Calls` sidebar item opens the new page instead of the dashboard.
- [x] Validate the backend slice with a narrow build. → Verify: `npm --prefix backend run build` passes.
- [x] Validate the frontend slice with a narrow build. → Verify: `npm --prefix frontend run build` passes.

## Done When

- [x] Admin users can open `/admin/calls` and filter all accessible call logs by agent, date range, and call result.
- [x] The log table shows talk time and paginates correctly.
- [x] Targeted frontend and backend builds pass.