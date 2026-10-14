# Cloudflare R2 Bucket CORS Setup

When deploying Playhead to production with Cloudflare R2 (or AWS S3), the storage bucket requires Cross-Origin Resource Sharing (CORS) configured to permit direct browser-to-storage multipart uploads and chunk downloads.

---

## 1. CORS Rules Specification

The bucket must have the following CORS rules applied:

```json
[
  {
    "AllowedOrigins": [
      "https://playhead.app",
      "https://*.playhead.app"
    ],
    "AllowedMethods": [
      "GET",
      "PUT",
      "POST",
      "HEAD",
      "DELETE"
    ],
    "AllowedHeaders": [
      "*"
    ],
    "ExposeHeaders": [
      "ETag",
      "Content-Range",
      "Accept-Ranges"
    ],
    "MaxAgeSeconds": 3600
  }
]
```

---

## 2. Why Each Rule Is Critical

| Rule / Header | Purpose |
| :--- | :--- |
| **`AllowedOrigins`** | Restricts storage requests to Playhead web clients, preventing unauthorized cross-domain origins while allowing app domains. |
| **`PUT`** | Required for browser direct multipart chunk uploads directly to presigned S3 URLs. |
| **`GET`, `HEAD`** | Required for browser direct streaming downloads and video seek requests. |
| **`ExposeHeaders: ["ETag"]`** | **CRITICAL for S3 Multipart Uploads.** Cloudflare R2 returns an `ETag` header on each uploaded chunk. By default, browsers hide response headers from cross-origin requests. Without exposing `ETag`, the browser upload engine cannot read the part ETag required to complete the multipart upload (`CompleteMultipartUpload`). |
| **`ExposeHeaders: ["Content-Range", "Accept-Ranges"]`** | Enables byte-range seeking for video preview and resumable chunk streaming. |
| **`MaxAgeSeconds: 3600`** | Caches preflight `OPTIONS` requests for 1 hour to maximize upload performance and reduce round-trip latency. |

---

## 3. How to Apply to Cloudflare R2

### Method A: Cloudflare Dashboard
1. Log in to the [Cloudflare Dashboard](https://dash.cloudflare.com) and navigate to **R2**.
2. Select your Playhead storage bucket (e.g., `playhead-prod`).
3. Click the **Settings** tab.
4. Scroll down to **CORS Policy** and click **Add CORS Policy**.
5. Paste the JSON configuration above (replace `AllowedOrigins` with your domain).
6. Click **Save**.

### Method B: AWS CLI / S3 API
If configuring via the AWS CLI configured with your R2 S3 API tokens:

```bash
aws s3api put-bucket-cors \
  --endpoint-url https://<ACCOUNT_ID>.r2.cloudflarestorage.com \
  --bucket playhead-prod \
  --cors-configuration file://cors.json
```

Where `cors.json` contains:
```json
{
  "CORSRules": [
    {
      "AllowedOrigins": ["https://playhead.app", "https://*.playhead.app"],
      "AllowedMethods": ["GET", "PUT", "POST", "HEAD", "DELETE"],
      "AllowedHeaders": ["*"],
      "ExposeHeaders": ["ETag", "Content-Range", "Accept-Ranges"],
      "MaxAgeSeconds": 3600
    }
  ]
}
```

---

## 4. Local Development Stand-in
In local development, MinIO is automatically configured with these exact CORS rules on startup via `services/shared/storage/s3.go` (`ConfigureCORS`).
