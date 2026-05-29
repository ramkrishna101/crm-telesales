# Agent Mobile Customer Profile

## Goal
Replace the mobile agent lead `View` modal with a full-screen customer profile page while keeping the desktop modal unchanged.

## Tasks
- [x] Add a mobile agent lead details route and page component wiring. -> Verify: `/agent/leads/:leadId` resolves for agents and desktop routes remain unchanged.
- [x] Reuse the existing lead details queries and note mutation in a mobile-friendly profile page. -> Verify: lead summary, notes, and call logs load for a valid lead.
- [x] Switch the mobile `View` action in agent leads from modal-open to route navigation. -> Verify: tapping `View` on mobile navigates to the profile page.
- [x] Keep the desktop `LeadDetailsModal` behavior intact. -> Verify: desktop `View` still opens the modal.
- [x] Add mobile page styling for header, summary, tabs, cards, and note composer. -> Verify: page is readable and scrolls correctly on phone-sized layout.
- [x] Run frontend validation. -> Verify: `npm --prefix frontend run build` passes.

## Done When
- [x] Mobile agents get a full-screen customer profile page from `View`.
- [x] Desktop agents still get the existing modal.
- [x] Notes and call logs work on mobile.