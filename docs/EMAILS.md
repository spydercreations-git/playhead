# Playhead: Transactional & Notification Emails

All emails in Playhead are routed through a unified email service located in `services/shared/email`.

- **Local Development**: Mailpit (`localhost:8025` web UI, `localhost:1025` SMTP).
- **Production**: Resend API via `RESEND_API_KEY` and configured `EMAIL_FROM` (e.g., `Playhead <notifications@playhead.so>`).
- **Design Philosophy**:
  - Clean, responsive email layout with dark/neutral contrast matching Playhead branding.
  - Prominent Playhead logo in the header.
  - Exactly one clear, high-contrast action button (e.g., "View File", "Review Comments", "Accept Invitation").
  - Mandatory footer containing:
    - Company context
    - Clickable **"Notification settings"** link (`https://<app_url>/settings/notifications`) for all notification emails.
  - Plaintext fallback version included with every outbound email.

---

## 1. Comment Debouncing & Aggregation Rule

When multiple comments or replies occur on the same file within a **5-minute window**:
- Rather than dispatching separate emails for each comment, the background worker debounces notifications.
- After 5 minutes of quiet time (or when the window lapses), a single consolidated email is sent:
  - Subject: `New comments on [File Name] - [Project Name]`
  - Body: A clean, threaded list of recent comment excerpts with timestamps, commenter names, and a single **"Open Video Review"** button jumping directly to the first new comment.

---

## 2. Complete Catalog of System Emails

| # | Email Trigger | Recipient(s) | Default Preference | Debounce / Cadence | Action Button |
|---|---------------|--------------|-------------------|-------------------|---------------|
| **1** | **Sign-In Verification Code** | User signing in / registering | Mandatory (Transactional) | Immediate | "Verify & Sign In" (or enter 6-digit code) |
| **2** | **Password Reset** | User requesting reset | Mandatory (Transactional) | Immediate | "Reset Password" |
| **3** | **Team Invitation** | Invitee email | Mandatory (Transactional) | Immediate | "Accept Invitation & Join Team" |
| **4** | **Project Access Granted** | User added to project | In-App: ON · Email: ON | Immediate | "Open Project" |
| **5** | **Shared With Me** | User granted access to item/folder | In-App: ON · Email: ON | Immediate | "View Shared Item" |
| **6** | **User Mentioned in Comment** | User `@mentioned` in timestamped comment | In-App: ON · Email: ON | Immediate / 5-min bundle | "Jump to Comment" |
| **7** | **New Comment on My Upload** | File uploader / owner | In-App: ON · Email: ON | Aggregated (5-min debounce) | "View Comments" |
| **8** | **Reply to My Comment** | Comment author | In-App: ON · Email: ON | Aggregated (5-min debounce) | "View Discussion" |
| **9** | **New Version Uploaded** | Project collaborators & reviewers | In-App: ON · **Email: OFF** | Immediate / Summary | "Review Version [vX]" |
| **10** | **Review Decision** (Approved / Changes Requested) | Uploader & Project Managers | In-App: ON · Email: ON | Immediate | "See Review Details" |
| **11** | **Client Uploaded Through Link** | Project owners & Managers | In-App: ON · Email: ON | Immediate / 5-min bundle | "Review Uploaded Files" |
| **12** | **Daily Activity Summary** | Users with "One daily summary" pref | In-App: N/A · Email: User Opt-In | Daily at 08:00 local | "Go to Workspace Dashboard" |
| **13** | **Admin Storage Threshold Alert** | Company Admins | Mandatory Admin alert | On crossing STORAGE_ALERT_GB (+ every 500 GB) | "Manage Storage & Quotas" |

---

## 3. Email Template Specifications

### 3.1 Authentication & Team
- **`auth_code`**: Sent when user logs in with email code or verifies new email. Displays a 6-digit numeric security code in large tabular monospace type, plus a 15-minute expiration warning.
- **`invitation`**: Sent when an Admin/Manager invites a user. Displays company name, inviter name, designated role, and link to sign up/accept.

### 3.2 Collaboration & Review
- **`comment_notification`**: Unified template for upload comments, replies, and mentions. Aggregates multiple items across 5 minutes with timecode chips (`01:24.08`), comment text preview, author avatars, and one primary link to the video player.
- **`review_status`**: Sent when a client or reviewer changes status to `Approved` (green badge) or `Changes Requested` (red badge), including any summary note left by the reviewer.

### 3.3 Storage Alert
- **`storage_alert`**: Sent to Admins when company storage reaches the configured `STORAGE_ALERT_GB` (default 1000 GB) and every subsequent 500 GB increment. Lists total storage used, top consuming projects, and link to Admin Storage settings.
