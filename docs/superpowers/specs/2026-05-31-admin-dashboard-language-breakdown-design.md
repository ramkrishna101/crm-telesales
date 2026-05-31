# Admin Dashboard Language Breakdown Design

## Goal

Add one new language-focused analytics card to the admin dashboard that visualizes language-wise lead counts using a pie chart and visible counts.

## Scope

This change applies to:

- Admin dashboard presentation in [frontend/src/pages/admin/AdminDashboard.tsx](frontend/src/pages/admin/AdminDashboard.tsx)
- Existing dashboard filter scope driven by date range and optional campaign filter
- Frontend aggregation of language counts from already-available lead data if sufficient for the selected dashboard scope

This change does not alter:

- Route structure
- Role access
- Existing dashboard filters
- Existing lead language semantics
- Existing backend authorization behavior

## Metric Definition

The new card should show language-wise lead counts.

Language for a lead is defined as the latest recorded call language associated with that lead.

For the selected dashboard filters:

- Count each eligible lead at most once
- Use the lead's latest known language only
- Exclude leads with no detectable language

## Card Design

### Title

`Language Breakdown`

### Presentation

The card should use a pie chart as the primary visual.

The card should also include a visible legend or list showing:

- Language name
- Count

The chart and legend should appear together in the same card so the user can read both distribution and exact totals without hover.

### Visual Behavior

- Each language gets a distinct slice color
- Legend colors match pie slices
- Languages are sorted by count descending
- The layout should remain readable within the existing admin dashboard grid

## Data Source Strategy

### Recommended Approach

Derive the language breakdown inside the admin dashboard from lead records already returned by the shared leads API, provided the page can request enough records for the selected scope without changing dashboard behavior materially.

Reasoning:

- This is the smallest change
- It avoids adding a new API surface for a single dashboard card
- The dashboard already depends on lead data and call summary data

### Fallback Approach

If the existing lead list response does not contain enough data to reliably compute the language summary for the dashboard scope, add a dedicated backend summary endpoint later. That is out of scope for the first pass unless required during implementation.

## Filtering Rules

The card must follow the same dashboard filters as the surrounding admin metrics:

- Selected date range
- Selected campaign, if any

When filters change, the language chart updates with the rest of the dashboard.

## Empty And Error States

### Empty State

If no language-tagged leads exist for the selected scope, show the standard dashboard empty state pattern with a short message such as `No language data available`.

### Partial Data Handling

Leads without language should be ignored rather than shown as `Unknown`, unless the current implementation surface makes `Unknown` materially clearer with no extra backend work. Default behavior for the first pass is to exclude unlabeled leads.

## Component Responsibilities

### Admin Dashboard Page

The admin dashboard page should:

- Fetch or reuse the scoped lead data needed for language aggregation
- Compute grouped language totals
- Pass normalized chart data into the language card section

### Language Breakdown Card

The card section should:

- Render the pie chart
- Render the count legend
- Handle no-data display locally

This logic may stay in the dashboard file for a small first pass, but should remain isolated enough to extract later if the dashboard grows further.

## Technical Constraints

- Preserve the existing admin dashboard filter experience
- Keep the change incremental and local
- Reuse the charting approach already present in the frontend stack if available
- Avoid introducing a new visualization dependency if the project already has one suitable for pie charts
- Keep the card responsive within the current dashboard layout

## Validation

Validation should include:

- Frontend build
- Visual check that the pie chart renders on the admin dashboard
- Filter sanity check for date range and campaign scope
- Empty-state sanity check when no language data exists

## Risks

- The current lead list query on the dashboard may not include enough rows to represent full language distribution if it only requests a minimal count-oriented payload
- Language parsing may depend on derived `lastCallLanguage` values that are sparse for older data
- Too many distinct languages could produce visual clutter; sorting and legend handling must keep the card readable

## Recommendation

Implement the first pass as a new `Language Breakdown` dashboard card using a pie chart plus visible counts, scoped to the same filters as the existing dashboard metrics, and computed from existing lead data unless that proves insufficient during implementation.