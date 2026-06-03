# Leads Page Size Selector Design

## Goal

Allow users to control how many leads appear per page on both admin `Leads` and agent `My Leads`, with options `10`, `25`, and `50`, and a shared default of `10`.

## Scope

This change applies to:

- Admin leads page in [frontend/src/pages/admin/LeadsPage.tsx](frontend/src/pages/admin/LeadsPage.tsx)
- Agent leads page in [frontend/src/pages/agent/AgentLeadsPage.tsx](frontend/src/pages/agent/AgentLeadsPage.tsx)
- Frontend pagination state and query `limit` handling on both pages

This change does not alter:

- Backend API contracts
- Lead filtering semantics
- Sorting behavior
- Other paginated screens

## User Experience

### Page Size Control

Both pages should expose a compact page-size selector near the pagination/footer area.

Available options:

- `10`
- `25`
- `50`

### Default

Both pages should default to `10` rows per page.

### Change Behavior

When the page size changes:

- Reset the current page to `1`
- Refetch the leads with the new `limit`
- Recalculate total pages and visible range text

## Placement

### Admin Leads

Place the selector alongside the existing pagination controls so it feels part of the same paging surface.

### Agent Leads

Place the selector in the desktop pagination footer and in the mobile pagination card in a layout that remains readable on narrow screens.

## Technical Approach

- Replace fixed frontend page-size constants with local state on both pages
- Pass the selected page size through the existing `limit` parameter to `/api/leads`
- Include page size in query keys so cached results remain correct per selection

## Validation

Validation should include:

- Frontend build
- Admin leads manual check for `10`, `25`, `50`
- Agent leads manual check for `10`, `25`, `50`
- Page reset to `1` when page size changes
- Range text and total-page calculations remain correct

## Risks

- Pagination text can become inconsistent if range calculations keep using old constants
- Mobile pagination layout may need minor spacing adjustment once the selector is added

## Recommendation

Implement a shared page-size pattern on both leads pages with options `10`, `25`, and `50`, defaulting both pages to `10`, and resetting to page `1` whenever the page size changes.