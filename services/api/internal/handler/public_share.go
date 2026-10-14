package handler

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

func signUnlockCookie(linkID string, passwordVersion int32, expiryUnix int64, sessionSecret string) string {
	payload := fmt.Sprintf("%s:%d:%d", linkID, passwordVersion, expiryUnix)
	mac := hmac.New(sha256.New, []byte(sessionSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%d.%s", expiryUnix, sig)
}

func isPasswordUnlocked(r *http.Request, link *db.GetShareLinkByTokenHashRow, sessionSecret string) bool {
	if link == nil {
		return false
	}
	linkIDStr := pgUUIDToString(link.ID)
	cookieName := fmt.Sprintf("ph_share_unlock_%s", linkIDStr)
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return false
	}

	parts := strings.Split(c.Value, ".")
	if len(parts) != 2 {
		return false
	}

	var expiryUnix int64
	if _, err := fmt.Sscanf(parts[0], "%d", &expiryUnix); err != nil {
		return false
	}

	if time.Now().Unix() > expiryUnix {
		return false
	}

	expectedVal := signUnlockCookie(linkIDStr, link.PasswordVersion, expiryUnix, sessionSecret)
	return hmac.Equal([]byte(c.Value), []byte(expectedVal))
}

func signVisitorCookie(visitorID string, linkIDStr string, expiryUnix int64, sessionSecret string) string {
	payload := fmt.Sprintf("%s:%s:%d", visitorID, linkIDStr, expiryUnix)
	mac := hmac.New(sha256.New, []byte(sessionSecret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))
	return fmt.Sprintf("%s.%d.%s", visitorID, expiryUnix, sig)
}

func verifyVisitorCookie(cookieVal string, linkIDStr string, sessionSecret string) (string, bool) {
	parts := strings.Split(cookieVal, ".")
	if len(parts) != 3 {
		return "", false
	}
	visitorID := parts[0]
	var expiryUnix int64
	if _, err := fmt.Sscanf(parts[1], "%d", &expiryUnix); err != nil {
		return "", false
	}
	if time.Now().Unix() > expiryUnix {
		return "", false
	}
	expectedVal := signVisitorCookie(visitorID, linkIDStr, expiryUnix, sessionSecret)
	if !hmac.Equal([]byte(cookieVal), []byte(expectedVal)) {
		return "", false
	}
	return visitorID, true
}

// GetIdentifiedShareVisitor returns the authenticated visitor from cookie if present and valid
func GetIdentifiedShareVisitor(r *http.Request, queries *db.Queries, linkID pgtype.UUID, sessionSecret string) (*db.ShareVisitor, bool) {
	linkIDStr := pgUUIDToString(linkID)
	cookieName := fmt.Sprintf("ph_share_visitor_%s", linkIDStr)
	c, err := r.Cookie(cookieName)
	if err != nil || c.Value == "" {
		return nil, false
	}

	visitorID, ok := verifyVisitorCookie(c.Value, linkIDStr, sessionSecret)
	if !ok {
		return nil, false
	}

	vUUID, err := uuid.Parse(visitorID)
	if err != nil {
		return nil, false
	}

	visitor, err := queries.GetShareVisitorByID(r.Context(), pgtype.UUID{Bytes: vUUID, Valid: true})
	if err != nil || visitor.ShareLinkID != linkID {
		return nil, false
	}

	return &visitor, true
}

// ResolvePublicShareLinkAndItem validates link, password unlock status, and item scoping
// Refuses deleted items, expired links, and unauthenticated password-protected links.
func ResolvePublicShareLinkAndItem(
	w http.ResponseWriter,
	r *http.Request,
	queries *db.Queries,
	sessionSecret string,
	itemIDStr string,
) (*db.GetShareLinkByTokenHashRow, *db.GetItemByIDRow, bool) {
	token := chi.URLParam(r, "token")
	if token == "" {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_not_found"})
		return nil, nil, false
	}

	tokenHash := authz.HashToken(token)
	link, err := queries.GetShareLinkByTokenHash(r.Context(), tokenHash)
	if err != nil {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_not_found"})
		return nil, nil, false
	}

	if link.DisabledAt.Valid {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_disabled"})
		return nil, nil, false
	}

	if link.ExpiresAt.Valid && link.ExpiresAt.Time.Before(time.Now()) {
		respondJSON(w, http.StatusNotFound, map[string]string{"error": "link_expired"})
		return nil, nil, false
	}

	// Password unlock gate
	if link.PasswordHash.Valid && link.PasswordHash.String != "" {
		if !isPasswordUnlocked(r, &link, sessionSecret) {
			respondJSON(w, http.StatusUnauthorized, map[string]string{
				"error":   "password_required",
				"message": "Password unlock required to access this share link",
			})
			return nil, nil, false
		}
	}

	// Item scope check
	if itemIDStr != "" {
		itemUUID, err := uuid.Parse(itemIDStr)
		if err != nil {
			respondJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid_item_id"})
			return nil, nil, false
		}

		inScope, err := queries.IsItemInShareLinkScope(r.Context(), db.IsItemInShareLinkScopeParams{
			ShareLinkID: link.ID,
			ID:          pgtype.UUID{Bytes: itemUUID, Valid: true},
		})
		if err != nil || !inScope {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error":   "item_not_found_in_link",
				"message": "The requested item is not part of this share link",
			})
			return nil, nil, false
		}

		item, err := queries.GetItemByID(r.Context(), db.GetItemByIDParams{
			ID:        pgtype.UUID{Bytes: itemUUID, Valid: true},
			CompanyID: link.CompanyID,
		})
		if err != nil || item.DeletedAt.Valid {
			respondJSON(w, http.StatusNotFound, map[string]string{
				"error":   "item_not_found",
				"message": "The requested item was not found",
			})
			return nil, nil, false
		}

		return &link, &item, true
	}

	return &link, nil, true
}
