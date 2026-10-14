package config_test

import (
	"testing"

	"github.com/playhead/playhead/services/api/internal/config"
	"github.com/stretchr/testify/assert"
)

func TestConfig_Validate_Development(t *testing.T) {
	cfg := config.Load()
	cfg.Environment = "development"
	assert.NoError(t, cfg.Validate(), "development mode should allow default secrets")
}

func TestConfig_Validate_Production(t *testing.T) {
	validProdConfig := func() *config.Config {
		return &config.Config{
			Environment:       "production",
			SessionSecret:     "e8b4e7240c0c6606a4a62253ad5c935ee57a79a61f2249c58b209e99a8de4884",
			DatabaseURL:       "postgres://user:prod_pass@prod-db.internal:5432/playhead_prod",
			R2AccessKeyID:     "prod_r2_key_id",
			R2SecretAccessKey: "prod_r2_secret_access_key_123456",
		}
	}

	t.Run("valid configuration passes", func(t *testing.T) {
		cfg := validProdConfig()
		assert.NoError(t, cfg.Validate())
	})

	t.Run("missing SESSION_SECRET fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.SessionSecret = ""
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "SESSION_SECRET is required")
	})

	t.Run("default dev SESSION_SECRET fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.SessionSecret = config.DefaultDevSessionSecret
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "development default")
	})

	t.Run("short SESSION_SECRET fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.SessionSecret = "too-short-secret"
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "at least 32 characters")
	})

	t.Run("default DATABASE_URL fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.DatabaseURL = config.DefaultDevDatabaseURL
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "DATABASE_URL")
	})

	t.Run("default R2_ACCESS_KEY_ID fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.R2AccessKeyID = config.DefaultDevR2AccessKeyID
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "R2_ACCESS_KEY_ID")
	})

	t.Run("default R2_SECRET_ACCESS_KEY fails", func(t *testing.T) {
		cfg := validProdConfig()
		cfg.R2SecretAccessKey = config.DefaultDevR2SecretAccessKey
		err := cfg.Validate()
		assert.Error(t, err)
		assert.Contains(t, err.Error(), "R2_SECRET_ACCESS_KEY")
	})
}
