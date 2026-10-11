package middleware

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/redis/go-redis/v9"
)

// RateLimiter limits requests by IP and email using Redis.
type RateLimiter struct {
	rdb        *redis.Client
	maxHits    int64
	windowSpan time.Duration
}

// NewRateLimiter creates a new rate limiter (default: 5 hits per 15 minutes).
func NewRateLimiter(rdb *redis.Client, maxHits int64, windowSpan time.Duration) *RateLimiter {
	return &RateLimiter{
		rdb:        rdb,
		maxHits:    maxHits,
		windowSpan: windowSpan,
	}
}

// LimitAuth creates a middleware handler for auth routes rate-limiting by IP and email.
func (rl *RateLimiter) LimitAuth(action string) func(next http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if rl.rdb == nil {
				next.ServeHTTP(w, r)
				return
			}

			ctx := r.Context()
			ip := getClientIP(r)

			// 1. Check IP rate limit
			ipKey := fmt.Sprintf("ratelimit:%s:ip:%s", action, ip)
			if rl.isLimited(ctx, ipKey) {
				w.Header().Set("Retry-After", "900")
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]string{
					"error":   "too_many_requests",
					"message": "Too many attempts from this IP address. Please try again in 15 minutes.",
				})
				return
			}

			// 2. Read request body to extract email if present, then restore body for next handler
			var email string
			if r.Body != nil && r.ContentLength > 0 {
				bodyBytes, err := io.ReadAll(r.Body)
				if err == nil {
					r.Body = io.NopCloser(bytes.NewBuffer(bodyBytes))

					var payload struct {
						Email string `json:"email"`
					}
					if err := json.Unmarshal(bodyBytes, &payload); err == nil && payload.Email != "" {
						email = strings.ToLower(strings.TrimSpace(payload.Email))
					}
				}
			}

			// 3. Check Email rate limit if email was provided
			if email != "" {
				emailKey := fmt.Sprintf("ratelimit:%s:email:%s", action, email)
				if rl.isLimited(ctx, emailKey) {
					w.Header().Set("Retry-After", "900")
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusTooManyRequests)
					json.NewEncoder(w).Encode(map[string]string{
						"error":   "too_many_requests",
						"message": "Too many attempts for this account. Please try again in 15 minutes.",
					})
					return
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func (rl *RateLimiter) isLimited(ctx context.Context, key string) bool {
	count, err := rl.rdb.Incr(ctx, key).Result()
	if err != nil {
		return false // Fail open if Redis transient error
	}
	if count == 1 {
		rl.rdb.Expire(ctx, key, rl.windowSpan)
	}
	return count > rl.maxHits
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}
