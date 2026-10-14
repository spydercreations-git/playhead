# Production Deployment Notes

## Mandatory Environment Variables & Secrets Validation

When running in production (`ENV=production` or `ENVIRONMENT=production`), the Playhead API strictly validates critical secrets and configurations at startup. If any required secret is missing, matches the local development default, or does not meet security criteria, the server logs a fatal error and terminates immediately (`os.Exit(1)`).

### Generating Secure Secrets

Use OpenSSL to generate cryptographically secure, random 32-byte hex keys:

```bash
# Generate SESSION_SECRET (64 hex characters)
openssl rand -hex 32
```

### Production Secrets Requirements

| Variable | Requirement in Production | Description |
| :--- | :--- | :--- |
| `SESSION_SECRET` | Required, $\ge 32$ chars, $\ne$ dev default | Used for session cookies and HMAC token signing |
| `DATABASE_URL` | Required, $\ne$ dev default | Connection string to production PostgreSQL cluster |
| `R2_ACCESS_KEY_ID` | Required, $\ne$ dev default | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Required, $\ne$ dev default | Cloudflare R2 Secret Access Key |
| `R2_BUCKET` | Recommended | Cloudflare R2 bucket name |
| `R2_ENDPOINT` | Recommended | Cloudflare R2 S3-compatible API endpoint |
| `REDIS_URL` | Recommended | Redis connection URL |

### Dev Defaults (Forbidden in Production)

The following development defaults are hardcoded strictly for local Docker/MinIO development and are rejected at startup in production:
- `SESSION_SECRET`: `"default-dev-secret-at-least-32-characters-long"`
- `DATABASE_URL`: `"postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable"`
- `R2_ACCESS_KEY_ID`: `"playhead"`
- `R2_SECRET_ACCESS_KEY`: `"playheadsecret"`

If any of these values are detected when `ENV=production`, startup aborts with a descriptive error message.
