# Agent Leads Loading Overlay

## Goal
Add a table-scoped loading overlay to the agent `My Leads` page for filter-driven refetches, including mobile and desktop layouts.

## Tasks
- [ ] Add local overlay state that tracks filter-apply refetches without affecting the initial load. → Verify: overlay intent is set only when filters are applied/reset.
- [ ] Render a centered loading card overlay inside the desktop leads table container and mobile lead card container. → Verify: the overlay appears above the table/card while preserving existing content underneath.
- [ ] Add shared styles for the dim layer, centered card, and spinner, with responsive behavior for mobile. → Verify: overlay looks correct on both desktop and mobile widths.
- [ ] Clear the overlay immediately when the refetch completes. → Verify: overlay disappears once filtered results return.
- [ ] Run frontend build validation. → Verify: `npm --prefix frontend run build` passes.

## Done When
- [ ] Applying or resetting filters on agent `My Leads` shows a centered loading card over the leads area only.
- [ ] Initial load still uses the existing loading state.
- [ ] Mobile and desktop both render the overlay correctly.
