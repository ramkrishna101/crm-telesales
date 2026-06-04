# Stringee Premium Dialer Redesign

## Goal
Redesign the active Stringee call widget into a centered premium glass dialer on desktop and a matching premium bottom sheet on mobile, without changing the post-call modal flow.

## Tasks
- [ ] Refactor `frontend/src/components/calls/StringeeCallPopup.tsx` layout into a centered desktop modal and premium mobile sheet while preserving current `stringeeService` state wiring. → Verify: call widget still renders for idle, dialing, ringing, in-call, failed, and ended states.
- [ ] Rebuild the desktop hero section with premium glass styling, stronger status hierarchy, centered lead identity, and always-visible hotline selector. → Verify: desktop widget shows status, timer, lead details, and hotline selector together without overflow or hidden controls.
- [ ] Rebuild the action area around `mute`, `hang up`, and `open log`, with `hang up` as the dominant primary control. → Verify: each action remains clickable and mapped to the existing handlers.
- [ ] Restyle inline error, loading-hotline, and no-hotline states so they fit the new dialer design instead of the current generic form styling. → Verify: unavailable or loading hotline states remain readable and visually integrated.
- [ ] Align the mobile call widget with the same visual language while keeping bottom-sheet ergonomics and thumb-friendly controls. → Verify: mobile layout keeps hotline visible, actions reachable, and content readable at narrow widths.
- [ ] Do a local consistency sweep for spacing, contrast, and transitions so the active dialer feels premium without changing the existing post-call modal. → Verify: `PostCallOutcomeModal.tsx` remains visually/functionally unchanged.
- [ ] Run focused validation last. → Verify: `npm --prefix frontend run build` passes, then manually spot-check call widget states in desktop and mobile views.

## Done When
- [ ] The active call widget opens as a centered premium dialer on desktop.
- [ ] Mobile uses the same redesigned visual language in a bottom-sheet form.
- [ ] Hotline selector is always visible.
- [ ] Only `mute`, `hang up`, and `open log` are exposed as the main in-call actions.
- [ ] The post-call modal remains unchanged.
- [ ] Frontend build passes.

## Notes
- Keep the underlying `stringeeService` API intact unless a minimal local UI-support refactor is required.
- Avoid backend work and avoid expanding scope into a broader call workflow rewrite.
- Prefer iterative visual changes with quick build validation rather than a large one-shot rewrite.
