package email

import (
	"github.com/playhead/playhead/services/shared/mailer"
)

// Re-export mailer types for services/shared/email
type Service = mailer.Mailer
type Config = mailer.Config

func New(cfg Config) *Service {
	return mailer.New(cfg)
}
