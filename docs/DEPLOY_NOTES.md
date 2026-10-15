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
| `COLLAB_INTERNAL_SECRET` | Required, $\ge 32$ chars, $\ne$ dev default | Shared secret for internal communication between Go API and Collab microservice |
| `DATABASE_URL` | Required, $\ne$ dev default | Connection string to production PostgreSQL cluster |
| `R2_ACCESS_KEY_ID` | Required, $\ne$ dev default | Cloudflare R2 Access Key ID |
| `R2_SECRET_ACCESS_KEY` | Required, $\ne$ dev default | Cloudflare R2 Secret Access Key |
| `R2_BUCKET` | Recommended | Cloudflare R2 bucket name |
| `R2_ENDPOINT` | Recommended | Cloudflare R2 S3-compatible API endpoint |
| `REDIS_URL` | Recommended | Redis connection URL |

### Dev Defaults (Forbidden in Production)

The following development defaults are hardcoded strictly for local Docker/MinIO development and are rejected at startup in production:
- `SESSION_SECRET`: `"default-dev-secret-at-least-32-characters-long"`
- `COLLAB_INTERNAL_SECRET`: `"default-dev-collab-secret-at-least-32-chars-long"` or `"playhead-collab-internal-secret-dev-only"`
- `DATABASE_URL`: `"postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable"`
- `R2_ACCESS_KEY_ID`: `"playhead"`
- `R2_SECRET_ACCESS_KEY`: `"playheadsecret"`

If any of these values are detected when `ENV=production`, `ENVIRONMENT=production`, or `NODE_ENV=production`, both the Go API and the Collab service terminate immediately at startup with exit code 1.

---

## Reverse Proxy Security Configuration: Collab Service Routing

The Node.js collaboration service (`services/collab`) listens on port 8082, handling both real-time client WebSockets and internal REST operations (`/internal/*`).

### Mandatory Edge Proxy Rules (Nginx / Caddy / Cloudflare / Traefik / AWS ALB)

1. **Public Ingress (Internet -> Collab)**:
   - **Allowed**: WebSocket connections (HTTP `Upgrade: websocket` and `Connection: Upgrade`) on the collaboration root / document paths (`wss://collab.playhead.com/*`).
   - **Strictly Blocked (403 Forbidden / Drop)**: Any request with path prefix `/internal/*` or `/api/internal/*` from external clients. External clients MUST NEVER reach `/internal/*`.

2. **Private Ingress (Go API -> Collab)**:
   - The Go API communicates directly with the Collab service over the private internal network (VPC / internal Docker network / localhost on `:8082`) for `/internal/init-document`, `/internal/replace-content`, and `/internal/import-docx`, authenticating with the constant-time `X-Collab-Secret` header.

#### Example Nginx Configuration

```nginx
# Public Collab Edge Configuration
server {
    listen 443 ssl http2;
    server_name collab.playhead.com;

    # Strictly block internal management endpoints from the internet
    location ^~ /internal/ {
        return 403 "Forbidden";
    }

    # Allow WebSocket traffic to Hocuspocus
    location / {
        proxy_pass http://collab_backend:8082;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "Upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 3600s;
        proxy_send_timeout 3600s;
    }
}
```
