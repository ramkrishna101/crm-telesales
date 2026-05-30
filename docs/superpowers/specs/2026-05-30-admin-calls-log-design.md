# Admin Calls Log Design

## Goal

Replace the current admin `Calls` route fallback to the dashboard with a dedicated logs-only page that shows all agent call activity with filtering and pagination.

## Scope

This change applies to the admin workspace route at `/admin/calls` for `super_admin` and `branch_admin` users.

In scope:

- add a dedicated admin calls page component
- remove dashboard content from the admin calls route
- show a logs-first table for all accessible agent calls
- add filters for agent, date range, and call result
- show talk time in the call logs table
- preserve branch scoping for branch admins and full access for super admins
- support pagination and refresh on the page

Out of scope:

- redesigning the main admin dashboard route at `/admin`
- mobile-specific admin calls layouts
- supervisor calls module changes
- changing how call logs are created or stored
- analytics or summary widgets on the admin calls page

## User Flow

1. Admin opens `Calls` from the sidebar.
2. App loads a dedicated admin calls page instead of falling back to the dashboard.
3. Admin sees filter controls above a paginated call log table.
4. Admin can narrow the results by agent, date range, and call result.
5. Admin can review the latest matching calls with talk time visible per row.
6. Admin can move between pages without losing the selected filters.

## Route Strategy

Add a dedicated route target for `/admin/calls`.

Behavior:

- `/admin/calls` renders the new admin calls page
- `/admin/*` continues to fall back to the dashboard for unbuilt pages only

This isolates the calls experience without affecting other admin navigation.

## Page Structure

The page should follow the existing desktop admin shell and page header patterns.

### Header

- eyebrow label such as `Call operations`
- page title `All Agent Calls`
- short subtitle explaining that the page shows recent call activity and outcomes
- refresh action aligned with the existing admin page action pattern

### Filter Bar

Provide a compact filter row above the table with:

- agent filter populated from the existing users list, limited to agent-role users
- date range filter using the existing shared date range control
- call result filter using disposition tags already present in call logs
- clear or reset behavior by selecting the default option values

Filter behavior:

- changing a filter resets pagination to page 1
- filters are combined, not mutually exclusive
- most recent calls remain the default sort order

### Call Log Table

Render a single table-focused card with columns for:

- call time
- agent
- lead name
- masked phone
- campaign name when available
- call result
- talk time
- notes

Table behavior:

- sort order remains newest first based on call time
- talk time displays from `durationSeconds` in a human-readable format
- long notes truncate safely without breaking row height
- empty values fall back to clear placeholders such as `-`

### Pagination

- show total count and current page context below the table
- provide previous and next navigation
- keep current filters applied when changing pages

## Data Strategy

Use existing frontend services and backend endpoints where possible.

Frontend:

- `callsService.list(...)` for paginated call logs
- `usersService.list(...)` for the agent filter options
- existing shared date range filter component for date inputs

Backend:

- existing `GET /api/calls` supports `page`, `limit`, `agentId`, `from`, `to`, and disposition filtering via `tag`
- existing admin role scoping remains the source of access control

Optional refinement:

- the frontend may send `tag` directly for the call result filter
- if a clearer frontend parameter name is preferred, the backend can accept a small alias such as `callResult` and map it to the existing tag filter

## State Behavior

- show a loading state while call logs are being fetched
- show an empty state when no matching calls exist for the selected filters
- preserve the current filter values during refetches
- disable pagination controls when there is no previous or next page

## Access and Scoping

- `branch_admin` sees only calls for leads in their branch through the existing backend scoping
- `super_admin` can view calls across all branches
- agent filtering should only show users that the current admin can legitimately inspect through the existing scoped users list

## Risks

- the current users list API may return more than one page of users, which could under-populate the agent filter if the fetch limit is too low
- the calls list endpoint currently uses `tag` rather than a more descriptive filter name, which can make the frontend intent less obvious

Mitigation:

- request a sufficiently large user list for the filter dropdown within existing app patterns
- keep the first implementation simple by using the existing `tag` filter unless readability becomes a real maintenance issue

## Validation

- `/admin/calls` renders the new calls page instead of the dashboard
- agent, date range, and call result filters change the visible results correctly
- talk time is shown for each row using the stored duration
- pagination works with filters applied
- branch admins remain scoped to their branch data
- frontend build passes
- backend build passes if any server-side alias or filter update is added