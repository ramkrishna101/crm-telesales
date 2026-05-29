# Branch Stringee Portals Implementation Plan

## Goal
Implement branch-scoped multi-portal Stringee configuration so each branch can manage one or more Stringee portals, each agent can be assigned to one portal from the Users flow, and dialing fails with `No dialer available` when no valid portal assignment exists.

## Tasks
- [ ] Add portal schema and migration: create `StringeePortalConfig`, add `User.stringeePortalConfigId`, and enforce branch-scoped uniqueness for portal names. → Verify: Prisma migration generates cleanly and backend build passes.
- [ ] Add portal crypto helpers and scoped runtime resolution: refactor Stringee helpers to accept resolved portal credentials instead of one global runtime config, and scope Redis cache keys by portal config ID. → Verify: backend build passes and portal-aware helper code has no global token/list cache reuse.
- [ ] Add backend configuration APIs: implement list/create/update/get summary endpoints for branch portal configs with `branch_admin` and `super_admin` access rules. → Verify: branch ownership checks compile and route handlers return masked fields only.
- [ ] Wire telephony endpoints to user portal assignment: update token, numbers, profile sync, and callout flows to load the authenticated user’s assigned portal config and return `No dialer available` when unavailable. → Verify: backend build passes and telephony routes share one branch-safe portal resolution path.
- [ ] Extend users APIs for portal assignment: accept and return `stringeePortalConfigId` plus portal summary, and reject cross-branch assignments. → Verify: user create/update handlers compile and branch mismatch paths return validation errors.
- [ ] Build admin Configuration UI: add the new `Configuration` page, route, sidebar entry, branch-aware list view, and add/edit modal for portal fields only. → Verify: frontend build passes and admin roles see the expected navigation/page state.
- [ ] Extend Users edit UI with portal dropdown: load branch portal options, auto-select when only one exists, and persist portal selection alongside `Stringee Email`. → Verify: frontend build passes and form state supports zero, one, or many branch portals.
- [ ] Run focused end-to-end validation: verify one-portal auto-select, multi-portal manual selection, branch-admin restrictions, super-admin cross-branch management, and `No dialer available` for missing assignments. → Verify: `npm run build` passes and manual API/UI checks cover the approved success criteria.

## Done When
- [ ] A branch can have multiple Stringee portal configs.
- [ ] `branch_admin` can manage only their own branch configs.
- [ ] `super_admin` can manage any branch’s configs.
- [ ] User edit supports selecting a branch portal.
- [ ] Telephony always uses the assigned portal config.
- [ ] Missing or invalid assignment returns `No dialer available`.

## Notes
- Keep the existing user-level `stringeeEmail` and `stringeeAccountId` fields; the new portal assignment only decides which portal those identities belong to.
- Do not return raw secrets from any portal config API.
- Retire the global env-based Stringee path from branch-based agent dialing instead of silently falling back to it.
