# Agent Mobile Customer Profile Design

## Goal

Replace the current mobile `View` lead modal in the agent workspace with a dedicated full-screen mobile customer profile page while keeping the existing desktop modal behavior unchanged.

## Scope

This change applies only to the agent mobile experience for lead details opened from `My Leads`.

In scope:

- mobile navigation from the `View` action to a full-screen lead details page
- mobile-friendly rendering of customer profile, notes, and call logs
- reuse of the existing lead details and call history queries
- reuse of the existing internal note creation flow

Out of scope:

- desktop lead details modal redesign
- backend API changes
- changes to lead assignment or lead filtering behavior

## User Flow

1. Agent opens `My Leads` on mobile.
2. Agent taps `View` on a lead card.
3. App navigates to a dedicated route for that lead.
4. Agent sees a full-screen mobile customer profile page.
5. Agent can switch between `Internal Notes` and `Call Logs`.
6. Agent can add a new internal note from the same page.
7. Agent uses a back action to return to the mobile leads screen.

## Route Strategy

Add a new agent route for mobile lead details:

- `/agent/leads/:leadId`

Behavior:

- mobile `View` action navigates to this route
- desktop `View` action continues to open the existing `LeadDetailsModal`

This preserves the current desktop workflow and avoids forcing the desktop modal layout into the mobile viewport.

## Mobile Page Structure

The mobile page should be a full-screen page inside the existing agent mobile shell.

### Header

- back button to return to the leads list
- small eyebrow label such as `Customer Profile`
- lead name and masked phone
- status pill

### Summary Card

- avatar/initial
- campaign name
- registration date
- email if present

### Content Switcher

Use a mobile segmented control or tab row for:

- `Internal Notes`
- `Call Logs`

### Internal Notes View

- existing notes shown as stacked mobile cards
- author and created timestamp shown compactly
- note composer at the bottom of the content area

### Call Logs View

- call log entries shown as stacked cards
- disposition tag, date/time, agent, duration, and optional notes

## Data Reuse

Reuse the same frontend data dependencies already used by the desktop modal:

- `leadsService.get(leadId)` for lead details and comments
- `callsService.list({ leadId })` for call log history
- `leadsService.addComment(leadId, content)` for internal notes

No backend changes are required.

## State Behavior

- preserve loading state with a mobile-friendly loading screen/card
- preserve empty states for notes and call logs
- preserve add-note success and error toasts
- reset new note input after successful save

## Navigation Behavior

- back action should return the user to the mobile leads screen
- no modal overlay should remain on mobile
- the page should scroll naturally within the mobile app shell

## Implementation Notes

- extract shared lead details query/mutation logic when practical to avoid duplicating desktop and mobile behavior
- keep the current `LeadDetailsModal` for desktop unchanged except for any safe refactoring needed to share logic
- use existing mobile visual patterns already present in the agent workspace instead of introducing a separate design language

## Risks

- duplicating the lead details UI logic between desktop modal and mobile page
- breaking existing desktop `View` behavior if the route/modal split is not isolated cleanly

Mitigation:

- isolate shared fetching and note-save logic from presentation
- keep route-based mobile handling separate from desktop modal rendering

## Validation

- mobile agent `View` opens full-screen lead details page
- desktop agent `View` still opens modal
- notes load correctly on mobile
- call logs load correctly on mobile
- saving a note works and refreshes the notes list
- frontend build passes