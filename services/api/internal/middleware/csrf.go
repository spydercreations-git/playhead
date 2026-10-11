package middleware

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"net/http"
)

func generateRandomToken(n int) (string, error) {
	bytes := make([]byte, n)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}
	return hex.EncodeToString(bytes), nil
}

// CSRFCookieName is the readable cookie storing the CSRF token
const CSRFCookieName = "playhead_csrf"

// CSRFHeaderName is the header containing the CSRF token
const CSRFHeaderName = "X-CSRF-Token"

// CSRF verifies the CSRF token on mutating requests if a session cookie is present.
func CSRF(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Safe methods do not mutate state
		if r.Method == http.MethodGet || r.Method == http.MethodHead || r.Method == http.MethodOptions {
			if _, err := r.Cookie(CSRFCookieName); err != nil {
				// Initialize CSRF cookie
				token, _ := generateRandomToken(16)
				if token != "" {
					http.SetCookie(w, &http.Cookie{
						Name:     CSRFCookieName,
						Value:    token,
						Path:     "/",
						HttpOnly: false,
						SameSite: http.SameSiteLaxMode,
					})
				}
			}
			next.ServeHTTP(w, r)
			return
		}

		// Only enforce CSRF if a session cookie is being used for authentication
		sessionCookie, err := r.Cookie("playhead_session")
		if err != nil || sessionCookie.Value == "" {
			// Not a cookie-authenticated request (e.g. Bearer auth or public pre-login requests)
			next.ServeHTTP(w, r)
			return
		}

		// Read expected token from cookie
		csrfCookie, err := r.Cookie(CSRFCookieName)
		if err != nil || csrfCookie.Value == "" {
			rejectCSRF(w, "Missing CSRF cookie")
			return
		}

		// Read token from header
		headerToken := r.Header.Get(CSRFHeaderName)
		if headerToken == "" {
			rejectCSRF(w, "Missing X-CSRF-Token header")
			return
		}

		// Constant time comparison
		if subtle.ConstantTimeCompare([]byte(csrfCookie.Value), []byte(headerToken)) != 1 {
			rejectCSRF(w, "Invalid CSRF token")
			return
		}

		next.ServeHTTP(w, r)
	})
}

func rejectCSRF(w http.ResponseWriter, message string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]string{
		"error":   "forbidden_csrf",
		"message": message,
	})
}
