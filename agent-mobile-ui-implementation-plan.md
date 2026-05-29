# Agent Mobile UI Implementation Plan

## Goal
Implement the approved mobile-only agent login and agent panel UI without changing desktop agent behavior or backend business logic.

## Tasks
- [ ] Add a shared mobile detection/layout boundary for auth and agent routes in `frontend/src/App.tsx`, `frontend/src/router/AppRouter.tsx`, and new mobile layout components. -> Verify: desktop routes still render existing pages; phone-width viewport can switch to mobile layout branches.
- [ ] Build the mobile login shell around the existing `frontend/src/pages/auth/LoginPage.tsx` form logic and add the approved mobile-only auth styling in `frontend/src/index.css` or scoped auth styles. -> Verify: desktop login remains unchanged; mobile login shows the dark header, single `TeleCRM` brand mark, white bottom sheet, and existing email/password flow.
- [ ] Create the mobile agent shell and dock components (`AgentMobileShell`, `AgentMobileDock`) and wire the 5-tab navigation for Dashboard, Follow-ups, My Leads, Calls, and Profile entry using current routes/targets. -> Verify: mobile dock appears only on phone widths, active tab turns blue, and desktop sidebar/layout remain unchanged.
- [ ] Add a mobile render path for `frontend/src/pages/agent/AgentDashboard.tsx` that reformats the existing dashboard data into stacked mobile cards. -> Verify: dashboard content is usable on phone width and desktop dashboard output stays intact.
- [ ] Replace the mobile path of `frontend/src/pages/agent/AgentLeadsPage.tsx` with the approved lead-card flow using `AgentLeadMobileCard`, `AgentLeadSwitcher`, and `AgentLeadFiltersSheet`, while reusing current queries, filters, and mutations. -> Verify: search/status/call-result/priority filters still drive existing params, lead cards are not covered by the dock, and previous/next arrows move within the loaded lead list.
- [ ] Add mobile-specific rendering for `frontend/src/pages/agent/AgentFollowUpsPage.tsx` and the Calls/Profile dock targets so all 5 mobile destinations have a defined UI without inventing new business flows. -> Verify: each dock action lands on an existing or mobile-adapted surface and no desktop-only dead ends remain on phone width.
- [ ] Wrap `frontend/src/components/calls/StringeeCallPopup.tsx` and `frontend/src/components/calls/PostCallOutcomeModal.tsx` with mobile presentation branches (`MobileCallWidget`, `AgentOutcomeSheet`) that preserve existing Stringee and outcome logic. -> Verify: hotline selector, mute, hangup, log, error state, and outcome submission all behave the same on mobile with compact controls.
- [ ] Run focused validation for auth, agent mobile layout, and calling behavior, then fix any viewport regressions before merging. -> Verify: build/lint passes, desktop agent panel is unchanged, mobile login works, mobile dock navigation works, leads filters work, and call/outcome flows still function.

## Done When
- [ ] Phone-width users get the approved agent mobile login and agent mobile panel experience.
- [ ] Desktop login and desktop agent panel behavior remain unchanged.
- [ ] Existing auth, lead, follow-up, Stringee, and post-call business logic is reused rather than duplicated.
- [ ] Responsive and functional checks pass for login, dashboard, leads, follow-ups, calls, and outcome logging.

## Notes
- Keep the implementation strictly presentational on mobile where possible.
- Do not add new auth methods, new filters, or mobile-only backend/API behavior.
- Treat desktop parity as the default unless the approved design explicitly changes mobile presentation.