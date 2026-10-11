# Playhead API Reference (`/api/v1`)

Base URL: `http://localhost:8080/api/v1`

All responses are JSON. Error payloads follow the format:
```json
{
  "error": {
    "code": "error_code_string",
    "message": "Human readable error description"
  }
}
```

---

## Foundation Endpoints (Milestone 1)

### `GET /api/v1/health`
Health check endpoint reporting connectivity to essential infrastructure.

**Response:**
```json
{
  "status": "ok",
  "database": "connected",
  "redis": "connected",
  "storage": "connected"
}
```
