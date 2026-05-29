# Stringee Click-to-Call Implementation Plan

**Spec:** `docs/superpowers/specs/2026-05-27-stringee-click-to-call-design.md`
**Date:** 2026-05-27

## Goal

Implement Stringee-backed click-to-call for admin and agent lead views using backend-issued short-lived tokens and a shared frontend Web SDK client.

## Phase 1 — Backend Token And Call Target Support

- Add backend Stringee helper for JWT token generation using `STRINGEE_API_SID` and `STRINGEE_API_SECRET`
- Add authenticated Stringee routes:
  - `GET /api/stringee/config`
  - `GET /api/stringee/token`
- Add a narrow lead endpoint for call initiation data:
  - `GET /api/leads/:id/call-target`
- Restrict access to super admin, branch admin, and agent
- Enforce agent ownership and DND checks before returning a callable target

## Phase 2 — Shared Frontend Stringee Layer

- Add a singleton frontend Stringee service
- Load the Stringee Web SDK from the official CDN on demand
- Connect a shared `StringeeClient` once per authenticated browser session
- Refresh Stringee token when the SDK requests one
- Track popup visibility, connection status, active lead, elapsed time, mute state, and call state

## Phase 3 — Popup Call UI

- Add a global popup host mounted once in the app shell
- Show lead identity, call state, timer, retry path, and hang-up control
- Keep the popup as the stable UI contract whether a native Stringee embedded phone is available later or not

## Phase 4 — Lead Action Wiring

- Add a call button to each admin lead row
- Add a call button to each agent lead row
- Prevent starting a second call while one is active
- Keep existing lead workflows intact

## Phase 5 — Validation

- Backend TypeScript build
- Frontend TypeScript and Vite build
- Editor diagnostics check for touched files
- Manual testing still required for:
  - provider credentials
  - project answer URL setup
  - browser microphone permissions
  - real outbound call flow
  - token refresh behavior

## Environment Checklist

Backend environment should provide:

- `STRINGEE_API_SID`
- `STRINGEE_API_SECRET`
- `STRINGEE_SERVER_ADDRS` optional
- `STRINGEE_TOKEN_TTL_SECONDS` optional
- `STRINGEE_ENABLED` optional

## Deferred Work

- Supervisor call UI
- Native embedded Stringee web phone if the account exposes a stable browser embed path
- Richer call logging and disposition sync
- Inbound calls and multi-call handling