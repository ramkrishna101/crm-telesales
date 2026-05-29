# Branch Multi-Tenancy and Super Admin Design

**Date:** 2026-05-25  
**Status:** Approved  
**Project:** crm-telesales

---

## 1. Overview

The CRM currently behaves as a single-tenant system with one top-level `admin` role. The new requirement is to support multiple logical branches inside the same database without breaking existing production behavior.

The target operating model is:
- The current `admin` becomes `super_admin`
- A new `branch_admin` role manages one branch and gets the same operational powers the current admin has today, except for global branch management
- Each branch owns its own users, teams, campaigns, leads, and day-to-day operations
- `super_admin` can view and manage all branches and all branch-owned data from a global interface

This design uses logical segregation in the same PostgreSQL database. It does not introduce separate databases, separate deployments, or separate codebases per branch.

### Goals
- Add branch-level tenancy without causing production data loss or cross-branch leakage
- Preserve the current operational capabilities for branch-local admins
- Introduce a true global `super_admin` role with cross-branch visibility and control
- Keep rollout additive first, then tighten constraints after data backfill
- Avoid broad rewrites by extending existing backend and frontend patterns

### Non-Goals
- No separate infrastructure or database per branch
- No multi-role users in the first version
- No custom per-branch schema differences
- No unrelated redesign of supervisor or agent workflows

---

## 2. Role Model

The role model changes from three roles to four roles.

| Role | Scope | Purpose |
|---|---|---|
| `super_admin` | Global | Manages all branches and can see all data across the platform |
| `branch_admin` | Single branch | Manages one branch and performs the same operational work current admin performs today |
| `supervisor` | Single branch and assigned teams | Oversees agents and team activity inside their branch |
| `agent` | Single branch and assigned work | Works assigned leads and follow-ups inside their branch |

### 2.1 Super Admin
- Can create, update, activate, and deactivate branches
- Can assign or replace the `branch_admin` for a branch
- Can view all users, teams, campaigns, leads, calls, follow-ups, tags, and analytics across all branches
- Can act inside a selected branch context to create or manage branch-owned entities
- Can access a global dashboard showing all branches with branch-level segregation and filters

### 2.2 Branch Admin
- Can manage users, teams, campaigns, leads, tags, and branch-level analytics for their own branch
- Cannot create or manage other branches
- Cannot view data belonging to other branches
- Uses the current admin-style interface, minus the Branch module

### 2.3 Supervisor and Agent
- Remain branch-scoped automatically through their branch assignment
- Cannot access records from other branches even if identifiers are known

### 2.4 Role Migration Rule
- Every existing `admin` user is migrated to `super_admin`
- New branch managers are created as `branch_admin`
- The first version does not allow a user to hold both `super_admin` and `branch_admin` simultaneously

---

## 3. Tenancy Model

Branch tenancy is enforced explicitly in the data model and in API query scoping.

### 3.1 Branch Entity

A new `Branch` model is introduced to represent a logical business unit.

Suggested fields:
- `id`
- `name`
- `code` or slug-like unique identifier
- `status` such as active or inactive
- `createdAt`
- `updatedAt`
- `branchAdminId` as an optional relation to the current branch admin user

### 3.2 Branch-Owned Records

The following records gain a `branchId` foreign key:
- `User`
- `Team`
- `Campaign`
- `Lead`

Branch ownership for `CallLog`, `FollowUp`, `LeadComment`, and `BreakLog` can be derived through the related user or lead in the first implementation. They do not need a direct `branchId` immediately unless reporting queries later require denormalization.

### 3.3 Why Leads Get a Direct `branchId`

Although leads already belong to campaigns, leads should still store `branchId` directly because it:
- makes branch filtering cheaper and clearer
- reduces risk in joins and reporting queries
- gives safer invariants for imports, exports, and bulk updates

### 3.4 Global Uniqueness Changes

The current schema enforces globally unique user email and globally unique lead phone number. That does not fit multi-branch tenancy.

Required changes:
- User email should become unique per branch, not globally unique
- Lead phone should become unique per campaign or deduplicated by campaign rules, not globally unique across the entire platform

Recommended database constraints:
- unique index on `User(branchId, email)`
- remove global unique constraint from `Lead.phone`
- preserve existing lead deduplication behavior within campaign processing logic

---

## 4. Backend Design

### 4.1 Authentication Payload

JWT and request user context should include enough information to scope requests safely.

Recommended authenticated context:
- `userId`
- `role`
- `email`
- `branchId` for branch-scoped users

For `super_admin`, `branchId` may be `null` in the token, with branch selection handled by query or request body where needed.

### 4.2 Authorization Rules

Current route guards only distinguish among `admin`, `supervisor`, and `agent`. They need to be expanded to:
- accept `super_admin` and `branch_admin`
- enforce branch scope automatically for non-super-admin users
- reject cross-branch access on detail, update, assign, export, and analytics endpoints

### 4.3 Branch Scope Helper

Introduce a shared backend helper to centralize branch scoping logic.

Suggested behavior:
- If caller is `super_admin`, allow all records by default and optionally filter by requested branch
- If caller is `branch_admin`, `supervisor`, or `agent`, always inject `branchId = caller.branchId`
- For nested resources, validate that referenced users, teams, campaigns, and leads all belong to the same branch before mutation

This helper should be reused across modules instead of hand-writing branch filters repeatedly.

### 4.4 Module Changes

#### Auth
- Login returns the new role values and branch assignment
- Existing inactive-admin exception should be reviewed so only intended privileged roles bypass inactivity blocks
- `me` should expose branch information for branch-scoped UI behavior

#### Users
- `super_admin` can list all users or filter by branch
- `branch_admin` can list and manage only users in their branch
- branch-admin user creation must force created users into the same branch
- creating a `branch_admin` should normally happen through the Branch module, not the generic Users module

#### Teams
- Teams belong to a branch
- branch-local filtering and validation apply to supervisor assignment and team members

#### Campaigns
- Campaigns belong to a branch
- users assigned to campaign access must belong to the same branch
- super admin can view all or operate in a selected branch context

#### Leads
- Lead upload, assignment, reclaim, detail view, export, and status changes must enforce branch ownership
- upload to a campaign must copy the campaign branch into imported leads

#### Tags and Analytics
- Decide whether disposition tags are global or branch-scoped in version one
- Recommended first version: keep tags global unless the business needs different tag catalogs by branch
- analytics endpoints should support `super_admin` all-branch reporting and branch-filtered reporting

---

## 5. Frontend Design

### 5.1 Route Model

The current frontend has one admin area at `/admin`. That should be split to avoid mixing global and branch-local behaviors.

Recommended route structure:
- `/super-admin` for global dashboards and branch management
- `/super-admin/branches` for branch CRUD and branch admin assignment
- `/super-admin/users`, `/super-admin/campaigns`, `/super-admin/leads`, and related pages with all-branch visibility and branch filters
- `/admin` remains the branch-admin workspace for branch-local operations

### 5.2 Navigation Rules

`super_admin` navigation includes:
- Dashboard
- Branches
- Users
- Teams
- Campaigns
- Leads
- Tags
- Analytics

`branch_admin` navigation includes the current admin menu except:
- no Branches entry
- no global all-branch view

### 5.3 Branch Filter UX

For `super_admin`, global pages should offer either:
- an all-branches view with branch column and filters, or
- a selected branch context for create and edit actions

Recommended UX:
- list pages show all branches by default with a branch filter
- create flows require an explicit branch selection when run by `super_admin`
- branch-admin users never see a branch selector because their scope is fixed

### 5.4 Dashboard Behavior

`super_admin` dashboard should show:
- branch summary cards
- total users across branches
- total campaigns across branches
- total leads across branches
- recent branch activity and branch-level breakdowns

`branch_admin` dashboard should remain close to the current admin dashboard but only for the branch's own data.

---

## 6. Data Migration and Rollout

This change must be deployed in a staged, production-safe sequence.

### 6.1 Migration Strategy

1. Add new enum values: `super_admin` and `branch_admin`
2. Create the `branches` table
3. Add nullable `branchId` columns to `users`, `teams`, `campaigns`, and `leads`
4. Relax or replace global uniqueness constraints that conflict with branch tenancy
5. Create one default branch for all existing production data
6. Backfill all existing users, teams, campaigns, and leads to that default branch
7. Migrate existing `admin` users to `super_admin`
8. Update backend auth and API scoping logic to respect branch boundaries
9. Update frontend routes and role guards
10. After backfill and validation, make branch ownership non-null where required

### 6.2 Default Branch Handling

All existing records should be attached to a single default branch during migration. Suggested names are `Primary`, `Main`, or `Default`. The exact name is operational and can be chosen at migration time.

### 6.3 Backward-Compatible Deployment

The first deployment should avoid immediate hard requirements that would break current production flows. Specifically:
- add columns as nullable first
- backfill data in migration or startup-safe script
- only then rely on non-null branch filters in code paths that need them

### 6.4 Safety Checks

Migration scripts should fail loudly if:
- an existing admin user cannot be promoted cleanly
- any branch-owned record remains without a branch after backfill
- uniqueness changes would cause conflicting duplicates that need manual resolution

---

## 7. Validation and Testing

Validation should stay narrow and focused on tenancy correctness.

### 7.1 Backend Validation
- login as migrated `super_admin`
- create a branch
- create a `branch_admin` for that branch
- login as `branch_admin`
- create users, teams, campaigns, and leads in that branch
- verify the branch admin cannot see records from another branch
- verify `super_admin` can see records across all branches
- verify assignment flows reject cross-branch user and campaign combinations

### 7.2 Frontend Validation
- role-based redirect sends `super_admin` to the global area and `branch_admin` to branch admin area
- branch pages render only for `super_admin`
- all-branch lists display branch context clearly
- branch-admin pages never expose another branch's records

### 7.3 Production Smoke Tests
- backend health check still passes
- existing super admin login works after migration
- existing data is visible under the default branch
- new branch creation works end-to-end
- branch admin can operate without affecting existing branch data

---

## 8. Risks and Mitigations

### Risk: Cross-branch data leakage
Mitigation: central branch-scope helper, strict ownership validation on all detail and mutation routes, focused integration tests.

### Risk: Production login or admin access breaks during migration
Mitigation: additive schema changes first, explicit admin-to-super-admin migration, and smoke-test auth immediately after deployment.

### Risk: Unique constraints block branch creation or data reuse
Mitigation: move from global uniqueness to branch-aware uniqueness before enabling multi-branch operations.

### Risk: Super admin and branch admin interfaces diverge unpredictably
Mitigation: preserve current admin UI as the branch-admin baseline and add a separate super-admin route space for global functions.

---

## 9. Recommended Implementation Order

1. Prisma schema updates for branch model, roles, and ownership columns
2. Safe migration and backfill logic for existing production data
3. Auth payload and backend branch-scope helper
4. Users, teams, campaigns, and leads route scoping
5. Frontend auth store, route guards, and redirects
6. Super admin branch module and global dashboards
7. Branch-admin route polish and validation

This order minimizes production risk by fixing data ownership and authorization before expanding UI surface area.