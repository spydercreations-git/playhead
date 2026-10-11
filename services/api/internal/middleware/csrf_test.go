package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestCSRFProtection(t *testing.T) {
	nextHandler := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("ok"))
	})

	mw := CSRF(nextHandler)

	t.Run("GET requests without CSRF token are permitted", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/auth/me", nil)
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", rec.Code)
		}

		// Verify CSRF cookie is set
		cookies := rec.Result().Cookies()
		var found bool
		for _, c := range cookies {
			if c.Name == "playhead_csrf" && c.Value != "" {
				found = true
				break
			}
		}
		if !found {
			t.Fatal("expected playhead_csrf cookie to be set")
		}
	})

	t.Run("POST request without session cookie passes through", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/auth/login", nil)
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", rec.Code)
		}
	})

	t.Run("POST request with session cookie but missing CSRF token is rejected with 403", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/companies", nil)
		req.AddCookie(&http.Cookie{
			Name:  "playhead_session",
			Value: "dummy_session_token",
		})
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got %d", rec.Code)
		}
	})

	t.Run("POST request with matching cookie and header passes", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/companies", nil)
		req.AddCookie(&http.Cookie{
			Name:  "playhead_session",
			Value: "dummy_session_token",
		})
		req.AddCookie(&http.Cookie{
			Name:  "playhead_csrf",
			Value: "csrf_token_123",
		})
		req.Header.Set("X-CSRF-Token", "csrf_token_123")
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", rec.Code)
		}
	})

	t.Run("POST request with mismatched cookie and header is rejected", func(t *testing.T) {
		req := httptest.NewRequest("POST", "/api/v1/companies", nil)
		req.AddCookie(&http.Cookie{
			Name:  "playhead_session",
			Value: "dummy_session_token",
		})
		req.AddCookie(&http.Cookie{
			Name:  "playhead_csrf",
			Value: "csrf_token_123",
		})
		req.Header.Set("X-CSRF-Token", "different_token")
		rec := httptest.NewRecorder()
		mw.ServeHTTP(rec, req)

		if rec.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got %d", rec.Code)
		}
	})
}
