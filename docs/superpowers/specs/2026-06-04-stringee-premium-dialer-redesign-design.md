# Stringee Premium Dialer Redesign Design

## Goal

Redesign the active Stringee calling widget into a centered, premium dialer-style modal that feels polished and phone-like while preserving the existing click-to-call workflow and the current post-call modal behavior.

## Scope

This redesign applies to:

- The active call widget rendered by the frontend Stringee integration
- Desktop active-call presentation
- Mobile active-call presentation
- Visual styling, layout, and action hierarchy of the live dialer surface

This redesign does not change:

- The existing post-call outcome modal flow or UI
- Stringee backend integration or token issuance
- Call logging behavior
- Lead list call button placement
- Current one-call-at-a-time behavior
- Existing call service logic unless needed to support local UI state cleanly

## Product Decision Summary

- Replace the small popup feel with a centered floating dialer modal on desktop
- Keep the active-call surface visually premium, using a glass-inspired treatment
- Preserve a separate post-call modal after hangup
- Keep the hotline selector always visible inside the dialer
- Show `mute`, `hang up`, and `open log` as the active call actions
- Do not add notes, keypad, or extra secondary utilities in this redesign
- Preserve the current Stringee service and state model as the underlying interaction engine

## Design Direction

### Product Feel

The dialer should feel like a dedicated call experience rather than a utility popup. It should look deliberate, premium, and operationally clear.

The target feel is:

- Centered like a real dialer modal
- Visually floating rather than heavy full-screen blocking UI
- More premium than the current CRM popup
- Still fast to scan during active calls

### Visual Direction

The chosen direction is a hybrid premium-glass dialer.

It should use:

- Dark, glass-inspired modal shell
- Soft blue highlight/glow accents
- Strong contrast for primary text and controls
- Rounded, phone-like surfaces and circular action buttons
- A restrained amount of blur and sheen so the UI stays readable

The design should avoid:

- Overly decorative glass effects that reduce readability
- Generic generic-card CRM styling that feels too plain
- Dense multi-tool layouts that compete with the main call actions

## Interaction Model

### Desktop Dialer

The desktop dialer should appear centered in the viewport when a call is prepared or active.

Behavior:

- Opens as a centered modal with backdrop treatment
- Keeps a floating feel through compact dimensions and shadow depth
- Maintains focus on the active lead and call state
- Does not attempt to become a full telephony workspace

The widget may retain local drag behavior only if it does not undermine the centered-default presentation. Centered-open behavior is the primary requirement.

### Mobile Dialer

The mobile dialer should keep the same visual language, but adapt to a bottom-sheet presentation rather than forcing a desktop-sized centered card.

Behavior:

- Premium glass styling remains shared with desktop
- Layout simplifies to fit thumb reach and narrow width
- Hotline selector remains visible
- Primary actions remain obvious and reachable

### Post-Call Flow

After the call ends, the existing post-call modal remains unchanged.

This redesign should not merge the live dialer and the post-call form into one shared component flow. The live dialer only needs to offer an `open log` entry point while the current separate post-call experience remains intact.

## Information Hierarchy

The dialer should present information in this order:

1. Call state and timer
2. Lead identity
3. Lead phone number
4. Hotline selector
5. Primary actions
6. Error or recovery messaging

### Header

The top area should communicate current call state immediately.

Recommended content:

- Small live status dot or pulse
- Status label such as dialing, ringing, in call, ended, or failed
- Timer when applicable
- Close/dismiss control only when allowed by current call state

### Hero Area

The lead should be visually central.

Recommended content:

- Lead name
- Masked or visible phone number according to the current screen rules
- Optional avatar or abstract contact badge

The hero area should feel calmer and more intentional than the current compact popup body.

### Hotline Selector

The hotline selector must remain visible at all times, including before and during the call.

Requirements:

- Styled as part of the dialer, not as a plain generic form field
- Easy to scan without stealing focus from the lead identity
- Clearly labeled as the source number
- Gracefully handles loading and no-number states

### Actions

The action set is intentionally narrow.

Visible actions:

- `mute`
- `hang up`
- `open log`

Action hierarchy:

- `hang up` is the dominant primary circular control
- `mute` is secondary but visually balanced
- `open log` is a clear secondary utility action, not hidden in a tiny corner affordance

This redesign should not introduce keypad, notes, or extra telephony controls.

## Layout Specification

### Desktop Layout

Recommended desktop structure:

- Outer centered modal shell
- Compact header strip
- Central hero section with lead identity and timer
- Always-visible hotline selector block
- Bottom action row with large circular controls and a clear `open log` action

Suggested layout proportions:

- Wider and taller than the current popup
- Compact enough to remain modal-like rather than page-like
- Balanced negative space around the hero section and control cluster

### Mobile Layout

Recommended mobile structure:

- Bottom sheet with premium styling
- Reduced but still prominent hero section
- Hotline selector block always visible above actions
- Large thumb-friendly call controls

The mobile layout should preserve the same hierarchy, not become an unrelated design.

## Error Handling Design

Errors should remain inline in the dialer and use the new visual language.

Requirements:

- Keep clear readable contrast for error text
- Provide dismiss behavior if supported today
- Do not visually overpower the core call state unless the call has actually failed

Loading and unavailable-number states for the hotline selector should appear as first-class dialer states, not fallback placeholder styling.

## Technical Design Constraints

- Keep the existing `StringeeCallPopup` ownership boundary unless a local refactor is needed to support the new visual structure cleanly
- Continue using `stringeeService` as the single source of live call state
- Preserve current action hooks for placing calls, hanging up, muting, dismissing, and opening the log flow
- Avoid backend changes for this redesign
- Keep the redesign incremental and UI-focused rather than rewriting call lifecycle logic

## Functional Safety Requirements

The redesign must preserve:

- Existing call initiation behavior
- Existing mute and hangup behavior
- Existing hotline selection behavior
- Existing `open log` access path
- Existing post-call modal flow
- Existing mobile support expectations

## Validation

Implementation validation should include:

- Frontend build validation after the redesign
- Manual desktop test for call prepare, dialing, ringing, in-call, ended, and failed states
- Manual mobile visual check for bottom-sheet presentation
- Hotline selector state checks for loading, available, and unavailable cases
- Manual confirmation that `open log` still opens the current post-call flow
- Manual confirmation that post-call UI remains unchanged

## Risks

### Readability Risk

Risk:
Premium glass styling can reduce readability if blur, glow, or low-contrast surfaces are overused.

Mitigation:
Use glass styling mainly at the shell and accent layers, while keeping text zones and control surfaces high-contrast.

### Scope Drift Risk

Risk:
The dialer redesign could expand into a larger call workflow rewrite.

Mitigation:
Keep scope strictly limited to the active call widget and leave the post-call modal unchanged.

### Mobile Drift Risk

Risk:
Desktop and mobile could diverge into separate products visually.

Mitigation:
Keep shared hierarchy, color direction, and action priority between desktop and mobile, adapting layout rather than redesigning from scratch.