# Playhead Build Progress

Tracking the implementation of Playhead across milestones according to Section 16 of `docs/PLAYHEAD_BUILD_SPEC.md`.

---

## Milestone 1: Foundation

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Monorepo Structure**: Complete directory layout (`apps/web`, `services/api`, `services/shared`, `services/worker`, `infra`, `db`, `docs`).
2. **Local Infrastructure**: Docker Compose configuration for PostgreSQL 16, Redis 7, MinIO (Cloudflare R2 local stand-in), and Mailpit.
3. **Database Foundation**: Goose migration `00001_foundation.sql` containing core identity tables (`users`, `sessions`, `companies`, `memberships`, `invites`) and `sqlc` generation.
4. **Shared Domain Rules**: `services/shared/plans/plans.go` implementing plan definitions, storage quota calculation in integer bytes, and feature gating.
5. **Go API Skeleton**: `chi` router with middleware (structured logging, CORS, recovery, request ID), standard error responses, and `GET /api/v1/health`.
6. **Frontend App**: Next.js App Router, Tailwind CSS, dark theme styling with CSS variables, responsive app layout (sidebar, header, content area), and skeleton states.
7. **CI Pipeline**: GitHub Actions workflow testing Go code and TypeScript compilation.
8. **Automation Commands**: Root `Makefile` with `make dev`, `make test`, and `make stop`.

### How to run it:
- `make dev`: Starts the local databases/services in Docker, runs database migrations, and boots both the Go API and Next.js web application.
- `make test`: Runs all backend unit tests, database checks, and frontend TypeScript type checks.
- `make stop`: Shuts down the background servers and local database containers cleanly.

---

## Upcoming Milestones
- **Milestone 2**: Auth and companies (signup, login, Google OAuth, email verification, sessions, onboarding, company switcher, members, invites, roles, `authz` package).
- **Milestone 3**: Projects and folders.
- **Milestone 4**: Uploads.
- **Milestone 5**: Processing worker.
- **Milestone 6**: Review player.
- **Milestone 7**: Sharing.
- **Milestone 8**: Boards.
- **Milestone 9**: Events, automations, and notifications.
- **Milestone 10**: Billing and plans (Paddle).
- **Milestone 11**: Polish for public launch.
