package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestHealthHandlerNilDependencies(t *testing.T) {
	h := NewHealthHandler(nil, nil, nil)

	req := httptest.NewRequest(http.MethodGet, "/api/v1/health", nil)
	rec := httptest.NewRecorder()

	h.Check(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", rec.Code)
	}

	var resp HealthResponse
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode json response: %v", err)
	}

	if resp.Status != "ok" {
		t.Errorf("expected status ok, got %s", resp.Status)
	}
	if resp.Database != "not_configured" {
		t.Errorf("expected db not_configured, got %s", resp.Database)
	}
}
