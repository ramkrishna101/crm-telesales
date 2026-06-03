# Agent Leads Filter Loading Overlay Design

## Goal

Add a polished loading overlay to the agent `My Leads` table when filters are applied and the filtered results are being fetched.

## Scope

This change applies to:

- Agent leads page in [frontend/src/pages/agent/AgentLeadsPage.tsx](frontend/src/pages/agent/AgentLeadsPage.tsx)
- Filter-driven refetches triggered by `Apply` or other active filter changes on that page
- Table-local visual loading treatment only

This change does not alter:

- Backend behavior
- Filter semantics
- Initial full-page loading state
- Other pages or dashboards

## Interaction Design

### Trigger

Show the overlay only when the leads query is refetching after filters have been applied.

Do not show this centered overlay for the initial page load when there is no previous table state to preserve.

### Placement

The overlay should be anchored to the leads table card, not the whole page.

The rest of the workspace remains visible while the table area is dimmed.

### Visual Treatment

- Semi-transparent dim layer over the table region
- Small centered floating card above the table content
- Spinner or animated loading indicator
- Short label such as `Applying filters...`
- Optional supporting text such as `Refreshing your lead list`

The presentation should feel lighter than a blocking modal while still being unmistakable.

## Behavior Rules

- Preserve the previous results underneath while refetching
- Prevent interaction with the table area while the overlay is visible
- Remove the overlay immediately after the refetch completes
- Reuse existing loading styles where practical, but keep the card specific to the agent leads table

## Technical Approach

Use the existing React Query `isFetching` signal on the agent leads page together with a local check that distinguishes initial load from post-filter refetch.

The overlay should render inside the table card/container so positioning remains stable on desktop and mobile layouts.

## Validation

Validation should include:

- Frontend build
- Manual check that the overlay appears after filter apply
- Manual check that the initial load still uses the existing loading state
- Manual check that the overlay disappears when results arrive

## Risks

- If the overlay is keyed only off `isFetching`, it may appear during pagination or search debounce as well; implementation should decide whether that is acceptable or narrow it to explicit filter apply behavior
- Overlay positioning must not interfere with the existing mobile card layout

## Recommendation

Implement a table-scoped centered loading card overlay on the agent `My Leads` page for post-filter refetches only, keeping previous table results visible underneath until the new filtered data arrives.