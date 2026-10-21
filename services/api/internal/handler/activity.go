package handler

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/shared/db"
)

// RecordActivityParams defines input for recording an activity event
type RecordActivityParams struct {
	CompanyID  uuid.UUID
	ActorID    uuid.UUID
	EventType  string // comment, mention, upload, new_version, review_status_change, approval, task_created, task_assigned, task_status_changed, project_member_added, client_created
	TargetType string // item, task, project, client, document
	TargetID   uuid.UUID
	ProjectID  *uuid.UUID
	ClientID   *uuid.UUID
	Metadata   map[string]interface{}
}

// RecordActivity safely records an event to the activity_events table
func RecordActivity(ctx context.Context, q *db.Queries, params RecordActivityParams) {
	if q == nil || params.CompanyID == uuid.Nil || params.ActorID == uuid.Nil {
		return
	}

	metaJSON, err := json.Marshal(params.Metadata)
	if err != nil {
		metaJSON = []byte("{}")
	}

	var projUUID pgtype.UUID
	if params.ProjectID != nil && *params.ProjectID != uuid.Nil {
		projUUID = pgtype.UUID{Bytes: *params.ProjectID, Valid: true}
	}

	var clientUUID pgtype.UUID
	if params.ClientID != nil && *params.ClientID != uuid.Nil {
		clientUUID = pgtype.UUID{Bytes: *params.ClientID, Valid: true}
	}

	eventID := uuid.New()
	_, err = q.CreateActivityEvent(ctx, db.CreateActivityEventParams{
		ID:         pgtype.UUID{Bytes: eventID, Valid: true},
		CompanyID:  pgtype.UUID{Bytes: params.CompanyID, Valid: true},
		ActorID:    pgtype.UUID{Bytes: params.ActorID, Valid: true},
		EventType:  params.EventType,
		TargetType: params.TargetType,
		TargetID:   pgtype.UUID{Bytes: params.TargetID, Valid: true},
		ProjectID:  projUUID,
		ClientID:   clientUUID,
		Metadata:   metaJSON,
	})
	if err != nil {
		slog.Warn("failed to record activity event", "error", err, "eventType", params.EventType)
	}
}
