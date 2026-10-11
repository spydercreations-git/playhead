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

---

## Milestone 2: Auth and Companies

### Status: Completed ✅ (Verified end-to-end in browser and tests)

### What was built:
1. **Full Authentication & Session Engine**:
   - `services/shared/authz`: Argon2id password hashing and verification, constant-time SHA-256 token hashing, role hierarchy enforcement (`owner > admin > member > guest`), and `Authorize()` rules.
   - `services/shared/mailer`: Email dispatch supporting local Mailpit SMTP (`localhost:1025`) and Resend API for production.
   - Session management with 30-day sliding expiry, `HttpOnly` cookie (`playhead_session`), and token hash indexing.
2. **Security & Rate Limiting**:
   - Redis-backed rate limiting (5 attempts per 15 minutes per IP and per email) on login, signup, forgot password, and reset password endpoints.
   - Double-submit cookie CSRF protection (`playhead_csrf` / `X-CSRF-Token`) for all state-mutating requests.
3. **Email Verification**:
   - Verification token generated at signup.
   - Verification required prior to company workspace creation.
   - Frontend verification page (`/verify-email?token=...`) with automatic verification and onboarding CTA.
4. **Company Workspace & 14-Day Agency Trial**:
   - Company creation with slug generator, activating 14-day agency trial with 1 TB storage.
   - **Trial Seat Limit**: Hard-capped at 5 team seats (1 owner + 4 members/invites) during the 14-day trial in `services/shared/plans/plans.go` and database transaction validation.
5. **Onboarding Flow (`/onboarding`)**:
   - 2-step onboarding: Step 1 (Company Name & Workspace URL) and Step 2 (Invite up to 4 team members with role selector).
   - Step 3 (First Project) deferred to Milestone 3 per approved plan.
6. **Strict Team Invites (`/invite/[token]` & `/team`)**:
   - Invites expire after 7 days (`time.Now().Add(7 * 24 * time.Hour)`).
   - Strict security check: Invitations can only be accepted by an account with the matching email.
   - Team management page (`/team`) displaying active members, role management, seat usage count, and pending invites.
7. **Brand Assets & Typography**:
   - Vector brand assets integrated from `/design/playhead-icon-white.svg` and `/design/playhead-logo-white.svg`.
   - Used `PlayheadIcon` as browser favicon and `PlayheadLogoWithText` on auth and onboarding screens.

### How to test locally:
1. **View local emails**: Open Mailpit in your browser at `http://localhost:8025` to see all signup verification emails, invite links, and password reset links.
2. **Run all tests**: Run `make test` to verify backend handler tests, middleware CSRF tests, authz tests, plans limit tests, and web TypeScript checks.
3. **Run dev server**: Run `make dev` to launch the API and Next.js frontend.

### How to configure Google Login later:
Google Login is built into the backend and UI, but hidden until configured. When you are ready:
1. Go to Google Cloud Console (`https://console.cloud.google.com`).
2. Create a new project and configure the "OAuth consent screen".
3. Under "Credentials", create an **OAuth 2.0 Client ID** (Web application).
4. Set Authorized redirect URIs to: `http://localhost:8080/api/v1/auth/google/callback` (and your production domain later).
5. Copy your Client ID and Client Secret into your `.env` file:
   ```env
   GOOGLE_CLIENT_ID=your_client_id_here
   GOOGLE_CLIENT_SECRET=your_client_secret_here
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your_client_id_here
   ```
6. The "Continue with Google" button will automatically appear on the Login and Signup pages.

---

## Upcoming Milestones
- **Milestone 3**: Projects and folders.
- **Milestone 4**: Uploads.
- **Milestone 5**: Processing worker.
- **Milestone 6**: Review player.
- **Milestone 7**: Sharing.
- **Milestone 8**: Boards.
- **Milestone 9**: Events, automations, and notifications.
  > **CRITICAL NOTE for Milestone 9**: The 4 overview dashboard cards must be wired to live data: **Active projects**, **Waiting for review**, **Due today**, and **Storage used** (as specified in Spec Section 9.12), strictly preserving the Figma visual card layout and styles designed in Milestone 1.
- **Milestone 10**: Billing and plans (Paddle).
- **Milestone 11**: Polish for public launch.
