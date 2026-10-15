package handler

import (
	"context"
	"encoding/json"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"

	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
)

func pgUUIDToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	return uuid.UUID(u.Bytes).String()
}

func SeedDefaultCompanyRoles(ctx context.Context, q *db.Queries, companyID pgtype.UUID) error {
	allPermsBytes, _ := json.Marshal(authz.AllPermissions)
	managerPermsBytes, _ := json.Marshal([]string{
		authz.PermProjectsViewAll,
		authz.PermFilesDownloadAll,
		authz.PermSharingCreatePublicLinks,
		authz.PermTeamInvite,
	})
	editorPermsBytes, _ := json.Marshal([]string{
		authz.PermFilesDownloadAll,
	})

	_, _ = q.CreateRole(ctx, db.CreateRoleParams{
		CompanyID:   companyID,
		Name:        "Admin",
		Color:       "#0066FF",
		Permissions: allPermsBytes,
		IsSystem:    true,
	})
	_, _ = q.CreateRole(ctx, db.CreateRoleParams{
		CompanyID:   companyID,
		Name:        "Manager",
		Color:       "#10B981",
		Permissions: managerPermsBytes,
		IsSystem:    false,
	})
	_, _ = q.CreateRole(ctx, db.CreateRoleParams{
		CompanyID:   companyID,
		Name:        "Editor",
		Color:       "#8B5CF6",
		Permissions: editorPermsBytes,
		IsSystem:    false,
	})
	return nil
}

func renderJSON(w http.ResponseWriter, status int, data interface{}) {
	respondJSON(w, status, data)
}

func PublishCollabRevocation(ctx context.Context, rdb *redis.Client, documentID, userID string) {
	if rdb == nil {
		return
	}
	payload, err := json.Marshal(map[string]string{
		"document_id": documentID,
		"user_id":     userID,
	})
	if err == nil {
		_ = rdb.Publish(ctx, "playhead:collab:revocations", payload).Err()
	}
}

