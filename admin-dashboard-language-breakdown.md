# Admin Dashboard Language Breakdown

## Goal
Add a new `Language Breakdown` card to the admin dashboard that shows language-wise lead counts as a pie chart with visible counts, scoped to the existing date and campaign filters.

## Tasks
- [ ] Update the admin dashboard data query to fetch enough scoped leads with `lastCallLanguage` for aggregation. → Verify: the dashboard query result includes lead rows with language data for the selected filters.
- [ ] Compute grouped language totals from the latest language per lead and sort them by count. → Verify: derived chart data contains descending language/count pairs and excludes empty languages.
- [ ] Render a new `Language Breakdown` card with a pie chart and matching count legend. → Verify: the admin dashboard shows the new card and the chart/legend render together.
- [ ] Handle no-data state for scopes with no language-tagged leads. → Verify: the card shows a clear empty state instead of an empty chart.
- [ ] Run focused validation for the frontend build. → Verify: `npm --prefix frontend run build` passes.

## Done When
- [ ] Admin dashboard includes the new `Language Breakdown` pie-chart card.
- [ ] The card follows the same date and campaign filters as the rest of the dashboard.
- [ ] Exact counts are visible alongside the chart.
