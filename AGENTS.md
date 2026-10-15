# Playhead: rules for the coding agent

Current plan is `docs/PLAYHEAD_SPEC_V2.md`. Where it conflicts with other docs, it wins.
Project and player layout follows `docs/PROJECT_WORKSPACE.md`.

## How to work

1. Build in the milestone order in Section 13 of `docs/PLAYHEAD_SPEC_V2.md` (P1 to P7). Finish one milestone, with tests passing, before starting the next.
2. Before writing code for a milestone, produce a plan (tasks, files to create, tables, endpoints) and wait for approval.
3. After each milestone, update `docs/PROGRESS.md`: what was built, what is left, how to run it.
4. Record every decision the spec does not cover in `docs/DECISIONS.md`.
5. Keep changes small and focused. One feature per commit.
6. After every task or fix, always run all tests, commit, and push to GitHub (git push origin main). Never finish a task without pushing. Put the commit ID at the end of every report.

## Stack (do not change without asking)

- Frontend: Next.js (App Router), React, TypeScript strict, Tailwind CSS, shadcn/ui, TanStack Query, TanStack Table, Zustand, Uppy, hls.js
- Backend: Go, chi, pgx, sqlc, goose, asynq
- Data: PostgreSQL, Redis
- Storage: Cloudflare R2 (MinIO in local dev), aws-sdk-go-v2
- Processing: FFmpeg, ffprobe, pdftoppm
- Email: Resend. Payments: Paddle Billing. Errors: Sentry
- Local dev: Docker Compose (Postgres, Redis, MinIO, Mailpit)

## Hard rules

- File bytes never pass through the API server. Browsers upload and download with presigned R2 URLs only.
- Every endpoint checks auth, company membership, project access and role through the `authz` package. Never inline role checks.
- Every query is scoped by `company_id`.
- Money is stored in integer cents. Storage is stored in integer bytes. Never floats.
- Storage quota is checked in a transaction before any upload starts (spec Section 7.3).
- Plan prices, limits and feature gates live only in `services/shared/plans/plans.go`.
- Never commit secrets or `.env` files. Never log passwords, tokens or file contents.
- Share link tokens and session tokens are stored only as hashes.
- All UI must follow the design tokens and the files in /design.
- Never add Supabase, Firebase or any similar hosted backend service. We use our own Go API, PostgreSQL, Redis, Cloudflare R2 and our collab service only.

## Quality

- Every write endpoint has at least one test. Every permission rule has a test proving a forbidden user is refused.
- Every screen has loading (skeleton), empty and error states.
- Review and share pages must work at 375px phone width.
- No console errors. No TypeScript `any` without a comment explaining why.
- Dark theme by default, colours as CSS variables, keyboard accessible controls.

## Definition of done

Works end to end in the browser, permissions enforced and tested, all states designed, tests passing, PROGRESS.md updated.

## Summary for Harsh (Permanent Rule)

At the very end of every report, write a section called SUMMARY FOR HARSH: one short paragraph in plain simple English (no code, no file names) saying what you did, what you tested, what is not done or not working, and the commit ID.

