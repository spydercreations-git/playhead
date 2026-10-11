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
