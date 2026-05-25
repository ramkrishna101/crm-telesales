# Dashboard UI Redesign Design

## Goal

Redesign the CRM frontend into a denser, more operational dashboard system that feels like a modern data-ops workspace while preserving existing routes, permissions, workflows, and API behavior.

## Scope

This redesign applies to:

- Super admin dashboard and admin-area shell
- Branch admin dashboard and admin-area shell
- Supervisor dashboard and supervisor-area shell
- Agent dashboard/workspace shell
- Shared layout primitives used by dashboard-style pages

This redesign does not change:

- Backend contracts or authorization behavior
- Existing route structure
- Existing feature availability by role
- Existing business workflows for campaigns, leads, calls, teams, users, follow-ups, and branches

## Design Direction

### Product Feel

The target feel is a dense data-ops CRM rather than a marketing dashboard. The interface should prioritize scan speed, state awareness, and quick action over decorative whitespace.

### Visual Direction

- Slim left sidebar for primary navigation
- Strong top command bar for search, context, filters, alerts, and quick actions
- Compact KPI panels with clearer status hierarchy
- Table-first and queue-first presentation where relevant
- Layered neutral surfaces with sharp accent usage rather than soft generic gradients
- Clean modern polish without copying the reference screenshot

### Interaction Principles

- High-information screens should remain readable at laptop widths
- Important actions should stay in consistent positions across dashboards
- Role context should be visible at all times
- Dashboard pages should show operational state first, historical insight second

## Information Architecture

### Shared App Shell

All dashboard areas should move to a shared structural model:

1. Slim left sidebar
2. Strong top command bar
3. Content canvas with reusable sections and cards

### Slim Left Sidebar

The sidebar should:

- Keep current role-based route visibility
- Use compact icon + label navigation
- Reduce visual weight compared with the current wide panel
- Keep brand, current workspace role, and logout/user area
- Support future collapse behavior without requiring route changes now

### Top Command Bar

The top bar becomes the operational header for each role. It should contain:

- Page title and sub-context
- Global search input or command-style search surface
- Branch/team context where relevant
- Live status or notification affordances
- Primary quick actions for the current area
- User identity summary where useful

The top bar should replace the current weak page header treatment and create a stronger shared workspace identity.

## Role-by-Role Dashboard Design

### Super Admin / Branch Admin

The admin dashboard should emphasize platform oversight.

Primary content blocks:

- KPI strip for users, campaigns, leads, and recent calls
- Alert/status area for operational exceptions
- Disposition and call activity block
- Active campaigns table or queue
- Agent/team state snapshot

Differences by role:

- Super admin sees branch-aware global context
- Branch admin sees branch-contained operational context
- Shared visual structure remains the same to reduce UI drift

### Supervisor

The supervisor dashboard should behave like a team control center.

Primary content blocks:

- Team performance summary
- Agent status lane
- Pending/unassigned lead queue
- Follow-up pressure block
- Recent call/disposition activity

The supervisor layout should prioritize coordination and workload balancing over global analytics.

### Agent

The agent workspace should be execution-first.

Primary content blocks:

- Current action state / next lead area
- Today’s follow-ups and overdue items
- Quick summary of interested leads and callbacks
- Recent calls or active work history
- Minimal KPI strip focused on immediate productivity

This page should feel faster and more task-focused than admin/supervisor screens.

## Reusable UI System

### Shared Primitives

Create or refactor toward reusable dashboard primitives for:

- App shell
- Command bar
- KPI tiles
- Section headers
- Dense cards
- Table wrappers
- Status pills
- Empty states
- Inline metric rows
- Activity lists

### CSS Direction

The current token system should be reshaped to support:

- More neutral, layered surfaces
- Stronger separation between shell, panel, and active states
- Tighter spacing scale for dense CRM usage
- Improved dashboard typography hierarchy
- Accent usage reserved for state and action emphasis

The redesign should avoid overusing purple gradients or generic glass effects.

## Implementation Strategy

### Phase 1: Shared Shell

Refactor the shared layout and core CSS tokens first.

Deliverables:

- Updated layout shell
- New sidebar treatment
- New top command bar
- Shared spacing, color, card, and table primitives

### Phase 2: Admin Dashboard Family

Update super admin and branch admin dashboard presentation first because they define the broadest information hierarchy.

Deliverables:

- Redesigned admin dashboard
- Preserved role-based data behavior

### Phase 3: Supervisor Dashboard

Adapt the shared shell and dashboard primitives to the supervisor workflow.

### Phase 4: Agent Workspace

Refine the dashboard system for the agent’s execution-heavy workflow.

### Phase 5: Consistency Sweep

Apply the same visual language to adjacent dashboard-style pages where necessary without turning this into a full app rewrite.

## Functional Safety Requirements

The redesign must preserve:

- Route paths
- Role guards
- Query keys and data-fetching behavior unless refactor is strictly local
- Existing button actions and service calls
- Existing empty/loading/error states semantically, even if visually redesigned

No backend changes are required for this redesign.

## Technical Constraints

- Reuse existing page/component structure where practical
- Prefer incremental replacement over broad rewrites
- Keep React behavior stable while refactoring visuals
- Avoid introducing new design dependencies unless necessary
- Preserve mobile responsiveness at a pragmatic level even though the primary use case is desktop operations

## Validation

Validation should include:

- Frontend build after each major phase
- Visual spot checks for admin, supervisor, and agent routes
- Route/role sanity checks for navigation visibility
- Quick regression checks for major action paths from dashboard entry points

## Risks

### Layout Regression Risk

Changing the app shell may affect many screens at once.

Mitigation:

- Centralize shell changes
- Validate role routes after shell updates
- Keep page-specific changes incremental

### Density Risk

Pursuing a denser CRM look can reduce readability if spacing and hierarchy are not carefully controlled.

Mitigation:

- Use density in data areas, not everywhere
- Keep strong section framing and typography contrast

### Scope Drift Risk

UI redesigns can expand into a full product rewrite.

Mitigation:

- Limit the work to dashboards and shared dashboard shell primitives
- Preserve existing flows instead of inventing new ones

## Success Criteria

The redesign is successful if:

- The CRM feels substantially more polished and operational
- All dashboard roles share a coherent visual system
- Existing functionality remains intact
- Navigation feels faster and more deliberate
- The interface reads like a serious CRM workspace rather than a starter-template admin panel