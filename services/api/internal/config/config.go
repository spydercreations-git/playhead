package config

import (
	"errors"
	"os"
	"strconv"
	"strings"
)

const (
	DefaultDevSessionSecret     = "default-dev-secret-at-least-32-characters-long"
	DefaultDevDatabaseURL       = "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable"
	DefaultDevR2AccessKeyID     = "playhead"
	DefaultDevR2SecretAccessKey = "playheadsecret"
	DefaultDevCollabSecret      = "default-dev-collab-secret-at-least-32-chars-long"
)

type Config struct {
	Port                 string
	AppURL               string
	ApiURL               string
	DatabaseURL          string
	RedisURL             string
	R2AccountID          string
	R2AccessKeyID        string
	R2SecretAccessKey    string
	R2Bucket             string
	R2Endpoint           string
	SessionSecret        string
	GoogleClientID       string
	ResendAPIKey         string
	SMTPHost             string
	SMTPPort             int
	Environment          string
	StoragePricePerGB    float64
	StorageAlertGB       int
	CollabInternalSecret string
	CollabURL            string
}

func (c *Config) IsProduction() bool {
	return strings.ToLower(c.Environment) == "production" || strings.ToLower(os.Getenv("ENVIRONMENT")) == "production"
}

func (c *Config) Validate() error {
	if !c.IsProduction() {
		return nil
	}

	if c.SessionSecret == "" {
		return errors.New("SESSION_SECRET is required in production")
	}
	if c.SessionSecret == DefaultDevSessionSecret {
		return errors.New("SESSION_SECRET cannot be set to the development default in production")
	}
	if len(c.SessionSecret) < 32 {
		return errors.New("SESSION_SECRET must be at least 32 characters long in production")
	}

	if c.DatabaseURL == "" {
		return errors.New("DATABASE_URL is required in production")
	}
	if c.DatabaseURL == DefaultDevDatabaseURL {
		return errors.New("DATABASE_URL cannot be set to the development default in production")
	}

	if c.R2AccessKeyID == "" {
		return errors.New("R2_ACCESS_KEY_ID is required in production")
	}
	if c.R2AccessKeyID == DefaultDevR2AccessKeyID {
		return errors.New("R2_ACCESS_KEY_ID cannot be set to the development default in production")
	}

	if c.R2SecretAccessKey == "" {
		return errors.New("R2_SECRET_ACCESS_KEY is required in production")
	}
	if c.R2SecretAccessKey == DefaultDevR2SecretAccessKey {
		return errors.New("R2_SECRET_ACCESS_KEY cannot be set to the development default in production")
	}

	if c.CollabInternalSecret == "" {
		return errors.New("COLLAB_INTERNAL_SECRET is required in production")
	}
	if c.CollabInternalSecret == DefaultDevCollabSecret {
		return errors.New("COLLAB_INTERNAL_SECRET cannot be set to the development default in production")
	}
	if len(c.CollabInternalSecret) < 32 {
		return errors.New("COLLAB_INTERNAL_SECRET must be at least 32 characters long in production")
	}

	return nil
}

func Load() *Config {
	storagePriceStr := getEnv("STORAGE_PRICE_PER_GB", "0.015")
	var storagePrice float64 = 0.015
	if p, err := strconv.ParseFloat(storagePriceStr, 64); err == nil && p > 0 {
		storagePrice = p
	}

	storageAlertStr := getEnv("STORAGE_ALERT_GB", "1000")
	var storageAlert int = 1000
	if a, err := strconv.Atoi(storageAlertStr); err == nil && a > 0 {
		storageAlert = a
	}

	return &Config{
		Port:                 getEnv("PORT", "8080"),
		AppURL:               getEnv("APP_URL", "http://localhost:3000"),
		ApiURL:               getEnv("API_URL", "http://localhost:8080"),
		DatabaseURL:          getEnv("DATABASE_URL", DefaultDevDatabaseURL),
		RedisURL:             getEnv("REDIS_URL", "redis://localhost:6379"),
		R2AccountID:          getEnv("R2_ACCOUNT_ID", "local"),
		R2AccessKeyID:        getEnv("R2_ACCESS_KEY_ID", DefaultDevR2AccessKeyID),
		R2SecretAccessKey:    getEnv("R2_SECRET_ACCESS_KEY", DefaultDevR2SecretAccessKey),
		R2Bucket:             getEnv("R2_BUCKET", "playhead-dev"),
		R2Endpoint:           getEnv("R2_ENDPOINT", "http://localhost:9000"),
		SessionSecret:        getEnv("SESSION_SECRET", DefaultDevSessionSecret),
		GoogleClientID:       getEnv("GOOGLE_CLIENT_ID", ""),
		ResendAPIKey:         getEnv("RESEND_API_KEY", ""),
		SMTPHost:             getEnv("SMTP_HOST", "localhost"),
		SMTPPort:             1025,
		Environment:          getEnv("ENV", getEnv("ENVIRONMENT", "development")),
		StoragePricePerGB:    storagePrice,
		StorageAlertGB:       storageAlert,
		CollabInternalSecret: getEnv("COLLAB_INTERNAL_SECRET", DefaultDevCollabSecret),
		CollabURL:            getEnv("COLLAB_URL", "http://localhost:8082"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}

