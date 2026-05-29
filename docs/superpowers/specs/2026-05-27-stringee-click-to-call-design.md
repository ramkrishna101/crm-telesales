# Stringee Click-to-Call Design

## Goal

Add click-to-call to the CRM lead workflow using Stringee Web SDK so users can place calls directly from lead rows.

## Scope

This first release applies to:

- Admin lead list in the existing leads module
- Agent lead views where a lead phone number is available
- Backend-issued short-lived Stringee client tokens
- Popup-style in-app call experience for outbound calls

This first release does not include:

- Supervisor call UI
- Full disposition automation tied to Stringee call end events
- Inbound call handling
- Multi-call or multi-line browser support
- Direct use of Stringee API credentials in the frontend

## Product Decision Summary

- Use Stringee Web SDK in the frontend
- Use the logged-in CRM user email as the Stringee user identity
- Generate Stringee access tokens in the backend only
- Prefer a native Stringee embeddable web phone surface if the account setup supports it cleanly
- If Stringee does not provide a supported embeddable phone surface for this setup, keep the same popup and render a small in-app call UI around the Web SDK call object
- Limit the browser session to one active call at a time per logged-in CRM user

## Architecture

### Backend Responsibilities

The backend owns all sensitive Stringee configuration and token generation.

Responsibilities:

- Store Stringee API SID and API secret in backend environment variables
- Generate short-lived client access tokens using Stringee's documented JWT format
- Set the token user identity to the authenticated CRM user's email
- Return only the short-lived token and non-sensitive connection metadata to the frontend
- Optionally expose configured WebSocket server addresses if they need to be overridden from the frontend default

Suggested backend environment variables:

- STRINGEE_API_SID
- STRINGEE_API_SECRET
- STRINGEE_SERVER_ADDRS
- STRINGEE_TOKEN_TTL_SECONDS
- STRINGEE_ENABLED

### Frontend Responsibilities

The frontend owns Stringee session lifecycle and the visible call experience.

Responsibilities:

- Load the Stringee Web SDK in the frontend app
- Create one shared Stringee client per authenticated browser session
- Request a short-lived token from the backend before initial connect
- Refresh the token when Stringee emits a token renewal request
- Start outbound calls from lead actions
- Present call connection state and controls in a popup-style overlay
- Prevent a second call from being started while one is active

## Integration Shape

### Backend API

Add a small backend module for Stringee integration.

Recommended endpoints:

- GET /auth/stringee-token
  Returns a short-lived access token for the currently authenticated CRM user
- GET /auth/stringee-config
  Returns non-secret frontend config if required, such as enabled state, server addresses, and token TTL hints

Behavior:

- Require existing CRM authentication
- Reject inactive or unauthorized users using existing auth rules
- Use the authenticated user's email as Stringee userId
- Generate tokens with a short lifetime to reduce leakage risk

### Frontend Service Layer

Add a shared Stringee client service or provider in the frontend.

Responsibilities:

- Initialize StringeeClient with configured server addresses
- Connect once per session after fetching a backend token
- Expose connection state: idle, connecting, connected, reconnecting, failed
- Expose call state: idle, dialing, ringing, in_call, ended, failed
- Provide methods such as connect, startCall, hangup, mute, and cleanup
- Handle Stringee events for authentication, disconnect, signaling state, media state, and token refresh

This service should be reusable from both admin and agent lead screens rather than embedded separately in each page.

## UI Flow

### Admin Leads Page

Add a call button to each lead row in the admin leads table.

On click:

1. Validate the lead has a callable phone number
2. Open the call popup in a connecting state
3. Ensure the shared Stringee client is connected
4. Start the outbound call to the lead phone number
5. Update UI to show dialing, ringing, connected, ended, or failed

### Agent Lead View

Add the same call action to agent lead entries where phone numbers are visible and usable.

The agent flow should match admin behavior so the call experience is consistent across roles.

### Call Popup

The popup is the stable container for the calling experience.

It should show:

- Lead name
- Lead phone number
- Current call state
- Call timer once connected
- Hang up control
- Mute control if supported cleanly through the Web SDK
- Retry control for recoverable failures

Preferred rendering order:

1. Native Stringee embeddable web phone or equivalent supported web surface, if available for the project setup
2. Minimal in-app call UI built around the Stringee Web SDK call object

The popup container stays the same in both cases so the surrounding CRM behavior does not change.

## Error Handling

### Token Failures

If token generation fails:

- Keep the popup open
- Show a clear retry action
- Do not expose secrets or raw backend error details

### Browser Permission Failures

If microphone access is denied:

- Show that audio permission is required
- Let the user retry after browser permission is changed

### Connection Drops

If the Stringee client disconnects unexpectedly:

- Attempt reconnect with a freshly issued token where appropriate
- Preserve popup state when possible
- Surface a clear reconnecting or failed status

### Invalid Lead Data

If the lead has no valid phone number:

- Disable the call button or block the action with a clear message

## Data And Logging

This release focuses on call initiation first.

Optional lightweight logging may be added through the existing calls API when:

- A call attempt starts
- A call connects
- A call ends or fails

However, successful click-to-call must not depend on deeper call-log workflow automation in this first release.

## Security

- Never expose Stringee API SID or API secret to the frontend
- Keep tokens short-lived
- Bind token issuance to the existing authenticated CRM user session
- Use the CRM user email as the Stringee identity to avoid separate user mapping for the first release
- Keep all telephony secrets in backend environment configuration only

## Operational Constraints

- Only one active browser call session per logged-in user for the first release
- Supervisor UI is deferred
- If Stringee account setup requires additional answer_url or number configuration, that setup is handled during testing and deployment rather than hard-coded into the design
- Safari compatibility may be weaker if Stringee's supported web phone path depends on Chrome-style extensions or browser-specific audio behavior

## Validation

Implementation validation should include:

- Backend route validation for authenticated token issuance
- Frontend build validation after adding the SDK integration
- Manual test from admin leads page
- Manual test from agent leads page
- Token refresh test when the SDK requests a new token
- Browser microphone permission denial test
- Single-active-call guard test

## Risks

### Embeddable Phone Availability

Risk:
Stringee's general Web SDK documentation clearly supports browser calling, but it does not guarantee a ready-made generic dialpad iframe for every setup.

Mitigation:
Treat the popup container as the contract and use a native Stringee embeddable surface only if it is supported cleanly during testing. Otherwise render a minimal in-app call UI around the SDK.

### Setup Dependencies

Risk:
Stringee projects may require number provisioning, answer_url setup, or account-side web phone configuration before browser calling works end to end.

Mitigation:
Handle provider-side setup during testing and rollout, not as a frontend-only assumption.

### Call State Drift

Risk:
CRM UI state can drift from provider call state if reconnects or browser permission issues occur.

Mitigation:
Centralize Stringee event handling in one shared frontend service and keep page-level UI driven by that shared state.

## Success Criteria

The design is successful if:

- Admin can click a lead call button and start a Stringee-backed outbound call from the CRM
- Agent can do the same from agent lead views
- The frontend never contains Stringee secret credentials
- Call UI opens in a popup-style overlay and shows clear connection state
- The system can support either a Stringee-native embedded phone surface or a minimal in-app Web SDK popup without changing the lead workflow