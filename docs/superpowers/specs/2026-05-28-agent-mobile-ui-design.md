# Agent Mobile UI Design

## Goal

Deliver an app-style mobile UI for agent-facing surfaces only, while preserving the current desktop feature set and avoiding any mobile-only business behavior that does not already exist in the product.

The mobile experience should feel like a dedicated application rather than a compressed desktop page. Navigation, list browsing, filters, and lead actions should be optimized for one-hand use on phone screens.

## Scope

This design covers agent-only mobile behavior for:

- Dashboard
- My Leads
- Follow-ups
- Calls
- Profile access from mobile navigation

This design does not change admin, supervisor, branch admin, or super admin interfaces.

This design does not add new business filters, new lead actions, or new status flows beyond what already exists on desktop.

## Approved Design Decisions

### Mobile navigation

- Agent mobile uses a persistent bottom dock instead of the left desktop sidebar.
- The dock contains 5 actions in this order:
  - Dashboard
  - Follow-ups
  - My Leads
  - Calls
  - Profile
- My Leads is the centered primary dock action.
- The centered My Leads action uses a raised notch treatment above the dock.
- The active module is highlighted in blue.
- Inactive dock actions are gray.
- The dock is icon-only with no text labels.
- The dock must be visually attached to the bottom edge like a native mobile app tab bar.
- The dock must be smaller and tighter than the early mockups; no oversized floating bar treatment.

### Dashboard landing screen

- Dashboard is the default first screen after agent login on mobile.
- Dashboard keeps the current desktop data intent, but is reformatted into mobile cards and stacked sections.
- Dashboard should preserve desktop-aligned colors and existing agent data, not add new metrics.

### My Leads mobile layout

- Mobile My Leads replaces the desktop table with stacked lead cards.
- Cards show existing lead information already exposed on desktop, including:
  - lead identity
  - masked phone
  - campaign name when present
  - lead status
  - priority
  - last call result
  - last called time
  - descriptive notes/context when available
- Lead cards must not be overlapped by the bottom dock.
- Compact previous and next arrow buttons appear above the active card to move between leads.
- Those arrows must be minimal and must not consume extra vertical space with helper labels.

### Lead actions

- Mobile should not introduce new lead actions.
- Existing lead interactions should be represented as compact icon-led controls instead of large desktop-style buttons.
- The compact action row supports the existing agent workflows:
  - call
  - change/update outcome or status
  - follow-up related action when already supported by the current flow
- Oversized full-width action buttons are not part of the approved mobile direction.

### Filters

- Mobile must use only the filters currently available to agent desktop users.
- Approved mobile agent filters are:
  - search
  - follow-up status
  - call result
  - priority
- Campaign is not part of the mobile agent filter set because it is not currently present in the desktop agent leads screen.
- A Filters button appears near the top bar beside the search affordance.
- Tapping Filters opens a bottom sheet.
- That bottom sheet contains the existing desktop agent filters only.
- The sheet provides Reset and Apply Filters actions.

### Status / outcome interaction

- Mobile status and outcome handling must align with the current desktop post-call outcome flow.
- The approved mobile form is a bottom sheet rather than an inline card editor.
- The sheet contains the existing desktop fields:
  - Call Result
  - Language
  - Update Followup Status
  - Next Call Schedule Date
  - Next Call Schedule Time
  - Description
- The sheet keeps the existing desktop action model:
  - Redial
  - Log / save outcome
- This flow must reuse the current business logic and validation already present in the desktop implementation.

## Architecture

### Layout strategy

- Keep the current desktop layout intact.
- Add a mobile-specific agent shell that activates only below the chosen phone breakpoint.
- The agent shell swaps the desktop sidebar for the mobile bottom dock and mobile page spacing.
- Desktop routes remain the same; mobile changes are presentational and interaction-layer changes on top of existing route structure.

### Screen strategy

- Reuse current agent route entry points where possible.
- Add mobile-only render branches for agent pages instead of creating a separate duplicate product surface.
- The mobile UI should share the same data queries, mutations, and service methods already used by desktop.

### Component boundaries

Recommended component boundaries:

- `AgentMobileDock`
  - renders the 5-action bottom dock
  - owns active-state styling only
- `AgentMobileShell`
  - applies phone spacing, safe dock padding, and top-bar structure
- `AgentLeadMobileCard`
  - renders a single lead card for phone layouts
- `AgentLeadSwitcher`
  - renders compact previous/next arrows above the active card
- `AgentLeadFiltersSheet`
  - renders existing desktop filters in a mobile sheet
- `AgentOutcomeSheet`
  - mobile presentation wrapper around the existing desktop post-call outcome fields and submit flow

These components should remain presentational where possible and receive state/actions from the current page-level logic.

## Data Flow

### Leads list

- Continue using the current agent leads query and parameters.
- Mobile cards read from the same lead list payload as desktop.
- Searching and filtering should continue to drive the same query keys and API params used by the current agent leads page.

### Filters

- Filter draft state remains local until the user taps Apply Filters.
- Reset clears the same existing filter state that desktop clears.
- Applying filters should not introduce new params beyond desktop-supported values.

### Lead navigation

- Previous and next arrows move across the already loaded lead list.
- This navigation is a UI-level traversal of the agent’s assigned leads list, not a new backend concept.
- Pagination behavior should remain aligned with the current desktop list behavior.

### Outcome logging

- Mobile outcome submission uses the same calls, follow-up, and lead status services already used by `PostCallOutcomeModal`.
- Existing rules for required call result, optional follow-up scheduling, and cache invalidation remain unchanged.

## Error Handling

- If filters fail to load or apply, show the same error message patterns currently used by the agent surfaces.
- If outcome logging fails, preserve the sheet contents and show the same failure toast/error treatment used today.
- If a call cannot start because another call is active, preserve the existing blocked-call behavior.
- If no leads are available, show a mobile empty state using current desktop semantics rather than inventing a new lead acquisition flow.

## Visual Rules

- Use the current CRM desktop palette as the mobile base.
- Use blue for active mobile navigation state.
- Use muted gray for inactive mobile navigation state.
- Avoid beige or alternative palette drift from the desktop theme.
- Use icon-led controls for dock actions and compact lead actions.
- Keep spacing tighter than the early exploratory mockups so content is not crowded by navigation chrome.
- Prefer the provided solid icon direction for mobile controls where practical, while keeping implementation consistent with the project’s icon stack.

## Testing Strategy

### Functional validation

- Verify agent mobile navigation switches correctly across Dashboard, My Leads, Follow-ups, Calls, and Profile entry.
- Verify My Leads cards render the same lead data already available on desktop.
- Verify previous/next arrows move across the lead list without overlapping the dock.
- Verify Filters button opens the sheet and applies only existing desktop filters.
- Verify outcome/status sheet submits through the existing desktop-backed logic.

### Responsive validation

- Validate phone layouts on narrow mobile widths.
- Validate that desktop layout remains unchanged at tablet and desktop widths.
- Validate that bottom dock never covers lead card content or sheet actions.

### Regression validation

- Verify current agent desktop filtering and lead actions still work unchanged.
- Verify call initiation, post-call logging, and follow-up scheduling keep current behavior.
- Verify route guards and auth behavior are unaffected.

## Out of Scope

- Adding campaign filter to agent leads
- Adding new lead fields not already exposed on desktop
- Changing backend query behavior for agent mobile only
- Reworking admin or supervisor mobile UX
- Introducing a separate mobile-only backend contract

## Implementation Notes

- The approved mobile design is a feature-preserving reformat of existing agent functionality, not a product redesign at the business-logic level.
- Where the existing desktop implementation already defines labels, status options, or submission behavior, mobile must consume those same sources instead of duplicating product rules.