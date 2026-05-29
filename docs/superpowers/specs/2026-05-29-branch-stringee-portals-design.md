# Branch Stringee Portals Design

## Goal
Support branch-specific Stringee telephony where a single branch can have one or many Stringee portal configurations, each agent is assigned to exactly one portal, and dialing fails with `No dialer available` when the agent has no usable portal assignment.

## Problem
The current CRM telephony flow assumes a single global Stringee configuration from backend environment variables. That does not fit the branch model anymore:

- Each branch should use its own Stringee account(s)
- A branch may have more than one Stringee portal
- Agents in the same branch may need to be split across different Stringee portals
- `branch_admin` must manage their own branch configurations
- `super_admin` must be able to manage any branch’s configurations from the admin side

A single branch-level config is not sufficient because a branch can have multiple Stringee portals. Automatic runtime selection is also unsafe because an agent’s Stringee identity belongs to a specific portal.

## Recommended Approach
Introduce a new branch-linked Stringee portal configuration model, allow many portal configs per branch, and link each user to one selected portal config.

This creates a deterministic routing model:

- one branch
- many Stringee portal configs
- one agent assigned to one portal config

When the agent places a call, the backend resolves the agent’s selected portal config and uses only that portal’s credentials for token minting, hotline lookup, account sync, and callout.

## Scope
In scope:

- New admin `Configuration` module for Stringee portal configuration management
- Multiple Stringee portal configs per branch
- User-level portal selection in the Users edit flow
- Branch-scoped and portal-scoped telephony credential resolution
- Runtime failure with `No dialer available` when no valid portal is available
- Super admin access to manage any branch’s portal configs
- Branch admin access to manage only their own branch’s portal configs

Out of scope:

- Automatic balancing or auto-allocation of agents across portals
- Support for telephony providers other than Stringee
- Migrating historical call logs to any new portal identifier
- Portal capacity management or license counting
- Fallback to global env-based Stringee config once this feature is enabled

## Data Model
### New model: `StringeePortalConfig`
Add a dedicated model linked to `Branch`.

Suggested fields:

- `id`
- `branchId`
- `portalName`
- `apiSidEnc`
- `apiSecretEnc`
- `tenant`
- `adminEmailEnc`
- `adminPasswordEnc`
- `createdAt`
- `updatedAt`
- optional soft-delete field if the team wants non-destructive removal

Notes:

- Sensitive values should be encrypted at rest using the existing encryption helpers pattern in the telephony library
- `portalName` is the human-readable label shown in dropdowns, for example `Portal A` or `Mumbai Team 2`
- `tenant` remains plain text because it is operational metadata and used for API URL construction
- A branch can have many portal configs
- Portal names should be unique within a branch to keep admin selection clear

### User changes
Add a nullable foreign key on `User`:

- `stringeePortalConfigId`

Keep existing user fields:

- `stringeeEmail`
- `stringeeAccountId`

Rationale:

- `stringeeEmail` and `stringeeAccountId` remain the agent identity fields
- `stringeePortalConfigId` decides which portal the agent belongs to
- This avoids ambiguous telephony resolution when a branch has multiple portals

## Access Model
### Branch admin
- Can list portal configs only for their own branch
- Can create, edit, and delete portal configs only for their own branch
- Can assign users only to portal configs from their own branch

### Super admin
- Can manage portal configs for any branch
- Can view configurations branch by branch from the admin side
- Can assign users to any portal config that belongs to the user’s branch

### Agent
- No direct access to configuration management
- Indirectly uses the assigned portal during dialing

## Admin UI Design
### New module: `Configuration`
Add a new admin module/page named `Configuration`.

Behavior:

- `branch_admin` sees their own branch configurations directly
- `super_admin` can manage configurations for any branch
- Page displays the list of configured Stringee portals for the selected branch

List fields:

- `portalName`
- masked tenant/admin email summary
- configuration status
- last updated time
- actions: `Add`, `Edit`, `Delete` if delete is implemented

### Add/Edit portal modal
The popup asks only for variable fields required for a new Stringee configuration:

- `Portal Name`
- `Stringee API SID`
- `Stringee API Secret`
- `StringeeX Tenant`
- `StringeeX Admin Email`
- `StringeeX Admin Password`

Not included:

- server addresses
- token TTL
- other advanced fields not required by the current dialer

Modal behavior:

- On create, all required fields must be filled
- On edit, existing secrets are masked and only replaced if the admin enters a new value
- Validation must block empty or obviously malformed values

## Users Module Changes
### User edit flow
Extend the existing user create/edit modal in the admin Users module.

Keep:

- `Stringee Email`

Add:

- `Portal` dropdown

Dropdown behavior:

- Options are loaded from the user’s branch portal configs only
- If the branch has exactly one portal config, it is selected by default
- If the branch has two or more portal configs, admin chooses one and saves
- If the branch has no portal configs, the field can remain empty and the UI should indicate that no dialer is available until a portal is configured

Validation rules:

- User save should not be blocked solely because the branch has no portal configured
- Dialing is what must fail with `No dialer available`
- Assignment to a portal from a different branch must be rejected by the backend

## Runtime Telephony Resolution
All Stringee runtime operations must resolve credentials from the agent’s assigned portal config instead of global environment variables.

### Affected flows
- telephony config loading
- token minting
- StringeeX admin agent lookup
- number listing
- PCC callout
- any other Stringee helper that currently reads one global tenant or API SID/secret

### Resolution algorithm
When an agent initiates a call or requests telephony setup:

1. Load the authenticated user
2. Load the user’s `stringeePortalConfigId`
3. If missing, fail with `No dialer available`
4. Load the selected portal config
5. Ensure the portal belongs to the same branch as the user
6. Decrypt required secrets
7. Use that portal’s credentials for all Stringee operations in the request

### Failure behavior
Return `No dialer available` when:

- the user has no assigned portal config
- the assigned portal config no longer exists
- the assigned portal config belongs to another branch
- required credentials in the portal config are missing or unusable
- the branch has no configured portals for that user

This message should be the standard UX-safe failure for missing dialer readiness.

## Backend API Design
### New configuration endpoints
Add branch-aware endpoints for managing portal configs.

Expected capabilities:

- list portal configs for a branch
- create portal config
- update portal config
- fetch one portal config summary
- optionally delete portal config

Authorization:

- `branch_admin` limited to their branch
- `super_admin` can act on any branch

Responses should avoid returning raw secrets. Return masked summaries only.

### Users endpoints
Update users create/update responses and request bodies to support:

- `stringeePortalConfigId`
- portal summary in user list/detail payloads when useful for admin UI

Backend validations:

- selected portal config must exist
- selected portal config must belong to the same branch as the user
- branch admin cannot assign users to a portal outside their branch

### Telephony endpoints
Refactor existing telephony routes and helpers so they no longer rely solely on one process-wide Stringee configuration.

The current global env implementation should be retired from the agent runtime path for branch-based dialing. Branch and portal assignment become mandatory for agent telephony.

Final intended runtime behavior for branch-based agents:

- portal config on user decides telephony credentials
- no assigned or valid config means `No dialer available`

## Security
- Encrypt all sensitive portal credentials at rest
- Never return decrypted secrets to the frontend
- Mask secrets in all API responses and UI summaries
- Enforce branch ownership checks for every portal config mutation and assignment
- Reuse the existing credential encryption key mechanism rather than inventing a new one unless the current helper proves unsuitable

## Caching and Isolation
The current StringeeX admin client caches tokens and lists globally. That will need branch/portal-aware isolation.

Required change:

- cache keys must be scoped by portal config identity, not one global key

Examples:

- admin auth token cache per portal config
- agent list cache per portal config
- number list cache per portal config

Without this, one portal’s cached token or number list could leak into another portal’s runtime.

## Migration Strategy
### Schema migration
- create `StringeePortalConfig`
- add `stringeePortalConfigId` to `User`

### Data migration
No automatic migration from the current env-based global Stringee setup is required.

Reason:

- the new feature is explicitly branch-based and multi-portal
- existing env values cannot be mapped safely to all branches and all users automatically

### Operational rollout
After deployment:

1. Admin creates portal config(s) for each branch
2. Admin updates agents with `Stringee Email` plus selected `Portal`
3. Agents without a portal assignment receive `No dialer available` until assigned

## UX Rules
- If no portals exist for a branch, show a clear empty state in `Configuration`
- In Users edit, if no portal exists for the branch, show a helper message instead of a broken dropdown
- If exactly one portal exists, auto-select it but still display the portal field so admins understand the assignment
- Portal labels should be human-readable and stable because admins will use them for assignment decisions

## Testing Strategy
### Backend
Verify:

- branch admin can manage only their branch portal configs
- super admin can manage any branch portal configs
- portal creation stores encrypted values
- user cannot be assigned to a portal from another branch
- telephony routes resolve credentials from the assigned portal
- missing assignment returns `No dialer available`
- cache keys stay isolated between portal configs

### Frontend
Verify:

- configuration page lists branch portals correctly
- add/edit modal captures only the required fields
- user edit modal shows branch-specific portal dropdown
- single-portal branches auto-select correctly
- multi-portal branches show all portal names
- empty-state messaging is clear when no portal exists

### End-to-end behavior
Verify:

- agent assigned to portal A receives token and numbers from portal A
- agent assigned to portal B receives token and numbers from portal B
- removing assignment causes dialing to fail with `No dialer available`
- invalid portal credentials surface as `No dialer available` in the product flow

## Risks
- Current Stringee helpers are strongly env-oriented and will require careful refactoring to accept per-portal credentials
- Global cache keys in the existing StringeeX admin client will cause incorrect cross-portal behavior unless refactored
- UsersPage and telephony routes both need branch-safe validation to avoid cross-branch portal assignment

## Success Criteria
The feature is complete when:

- a branch can have multiple Stringee portal configurations
- an admin can assign an agent to one selected portal from the Users edit flow
- telephony uses the assigned portal deterministically
- branch admin is limited to their own branch configs
- super admin can manage any branch’s configs
- agents without a valid assigned portal receive `No dialer available`
