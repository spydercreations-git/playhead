# Architectural & Technical Decisions Log

This document records all decisions not explicitly defined in the spec (`PLAYHEAD_BUILD_SPEC.md`).

---

## 1. Monorepo Organization & Go Workspace
- **Decision**: Use a Go multi-module workspace (`go.work`) at repository root linking `services/shared`, `services/api`, and `services/worker`.
- **Reason**: Enables strict separation between API, worker, and shared domain models while allowing atomic cross-package development and seamless local imports without publishing modules.

## 2. Frontend Package Manager
- **Decision**: Use `npm` for the frontend dependencies.
- **Reason**: Pre-installed on macOS, zero extra global toolchain dependencies required, stable and compatible with all Next.js / TanStack packages.

## 3. Milestone 1 Database Migrations
- **Decision**: Milestone 1 creates only the foundational tables (`users`, `sessions`, `companies`, `memberships`, `invites`).
- **Reason**: Follows incremental milestone build order. Future milestones append their specific tables in new goose migration files; migrations are never modified retroactively.

## 4. Local Development Environment
- **Decision**: Docker Compose manages PostgreSQL 16, Redis 7, MinIO (mocking Cloudflare R2), and Mailpit (mocking Resend).
- **Reason**: Matches the target production engine interfaces exactly while keeping local development 100% offline-capable and isolated.

## 5. Plans Definition
- **Decision**: All tier limits, integer pricing in cents, storage quotas in bytes, and feature gating logic are strictly isolated to `services/shared/plans/plans.go`.
- **Reason**: Enforces the spec hard rule that plans and limits must never be hardcoded elsewhere in the frontend or backend.

## 6. Trial Seat Cap
- **Decision**: During the 14-day free trial, companies can have up to 5 members (`TrialMaxSeats = 5`). Beyond 5 members, an upgrade prompt is displayed.
- **Reason**: Balances early team collaboration testing for creative agencies during trials while preventing trial abuse.

## 7. Email Verification Before Company Creation
- **Decision**: Users must verify their email address before being permitted to create a company or start a trial.
- **Reason**: Prevents spam company registrations, ghost organizations, and unverified accounts reserving storage quotas.

## 8. Rate Limiting and CSRF Protection
- **Decision**: Auth endpoints (`login`, `signup`, `forgot-password`, `reset-password`) are strictly rate limited via Redis to 5 attempts per 15 minutes per IP address and per email address. Cookie-based mutating requests require double-submit `X-CSRF-Token` headers.
- **Reason**: Enforces Spec Section 14 security rules against credential stuffing, brute-force attempts, and cross-site request forgery.

## 9. Invite Acceptance Rules
- **Decision**: Team invites expire after 7 days and can only be accepted by an authenticated account matching the exact email to which the invite was sent.
- **Reason**: Prevents forwarded links from granting unauthorized project and company workspace access to arbitrary accounts.

## 10. Optional Google OAuth Configuration
- **Decision**: Google OAuth is fully wired into backend and frontend but conditionally rendered on the UI only when `GOOGLE_CLIENT_ID` / `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is present.
- **Reason**: Allows seamless out-of-the-box local development with email/password while making Google SSO a zero-code-change drop-in when credentials are provided.

---

## 11. Version 2 Internal Workspace Roles Model
- **Decision**: In `00003_p1_roles_clients_projects.sql`, roles are strictly migrated to `admin`, `manager`, and `editor` (replacing legacy `member`/`guest`). `owner` is maintained as the highest privilege company role equivalent to `admin`.
- **Reason**: Aligns with Section 13 (Milestone P1) and Section 2.1 of `docs/PLAYHEAD_SPEC_V2.md`. Editors only see projects explicitly assigned to them.

## 12. Passwordless 6-Digit Email Code Sign-In & Closed Signups
- **Decision**: Public signups (`/signup`) are replaced by a closed workspace notice directing users to contact their workspace admin. Sign-in supports both existing passwords and 6-digit email codes (`/auth/login-code/send` and `/auth/login-code/verify`) delivered via Mailpit/Resend. Unregistered emails receive a friendly notice: *"This email doesn't have access to Playhead yet. Ask the person who invited you."*
- **Reason**: Enforces the internal agency workspace model. Codes are hashed with SHA-256 in PostgreSQL and expire in 10 minutes with rate limiting.

## 13. Centralized Authorization Engine (`authz.Access`)
- **Decision**: Implemented `authz.Access(person, project)` returning `{Level, CanDownload}` in `services/shared/authz/authz.go`. All project queries and handlers pass through this single source of truth.
- **Reason**: Combining team role (Admin/Manager = Full Access), project grants, and client contact defaults ("Access to all projects" above None) in one central package prevents fragmented role checks. Adding/editing/removing people on projects is restricted to Admins, Managers, and Full Access grantees.

## 14. Client Users & Company Context Fallback
- **Decision**: Client contacts and external users with direct project grants but no internal company membership record automatically receive the active company context upon sign-in from their earliest client contact or project grant.
- **Reason**: Client users are presented with a streamlined client view (Home, Projects, Shared with me, Starred, Trash; hiding internal-only pages like Clients, Team, and Storage quotas, and suppressing "+ New" unless granted Uploader or Full access).

## 15. Case-Insensitive Lowercase Email Normalization
- **Decision**: All emails ingested across users, client contacts, project grants, and login codes are trimmed and converted to lowercase via Go's `authz.NormalizeEmail()` before persistence and lookup.
- **Reason**: Prevents case-mismatch access denial (e.g. `Harsh@Example.com` vs `harsh@example.com`) across invitations, contacts, and sign-ins.

## 16. P1 Plain Text Client Notes
- **Decision**: Client `notes` is modeled as a text field in `clients` table and client detail page.
- **Reason**: Per user clarification, Notes is a plain text field in Milestone P1, and will be evolved into a full collaborative document in Milestone P5.

