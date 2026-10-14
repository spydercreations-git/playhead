package jobs

import (
	"encoding/json"
	"strings"

	"github.com/hibiken/asynq"
)

const (
	TypeProcessVideoVersion        = "media:process_video_version"
	TypeGroupedCommentNotification = "email:grouped_comment_notification"
)

type ProcessVideoPayload struct {
	CompanyID  string `json:"company_id"`
	ItemID     string `json:"item_id"`
	VersionID  string `json:"version_id"`
	StorageKey string `json:"storage_key"`
	Mime       string `json:"mime"`
}

type GroupedCommentNotificationPayload struct {
	CompanyID string `json:"company_id"`
	ItemID    string `json:"item_id"`
}

// NewProcessVideoTask creates an asynq Task with 3 retries
func NewProcessVideoTask(payload ProcessVideoPayload) (*asynq.Task, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeProcessVideoVersion, data, asynq.MaxRetry(3)), nil
}

// NewGroupedCommentNotificationTask creates an asynq Task for aggregated email notifications
func NewGroupedCommentNotificationTask(payload GroupedCommentNotificationPayload) (*asynq.Task, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	return asynq.NewTask(TypeGroupedCommentNotification, data, asynq.MaxRetry(3)), nil
}

// ParseRedisOpt converts a Redis URL string into asynq.RedisClientOpt
func ParseRedisOpt(redisURL string) asynq.RedisClientOpt {
	addr := redisURL
	addr = strings.TrimPrefix(addr, "redis://")
	if addr == "" {
		addr = "localhost:6379"
	}
	// Strip trailing path/db if present
	if idx := strings.Index(addr, "/"); idx != -1 {
		addr = addr[:idx]
	}
	return asynq.RedisClientOpt{
		Addr: addr,
	}
}
