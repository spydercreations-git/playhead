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
