package config

import (
	"os"
)

type Config struct {
	Port              string
	AppURL            string
	ApiURL            string
	DatabaseURL       string
	RedisURL          string
	R2AccountID       string
	R2AccessKeyID     string
	R2SecretAccessKey string
	R2Bucket          string
	R2Endpoint        string
	SessionSecret     string
	GoogleClientID    string
	ResendAPIKey      string
	SMTPHost          string
	SMTPPort          int
	Environment       string
}

func Load() *Config {
	return &Config{
		Port:              getEnv("PORT", "8080"),
		AppURL:            getEnv("APP_URL", "http://localhost:3000"),
		ApiURL:            getEnv("API_URL", "http://localhost:8080"),
		DatabaseURL:       getEnv("DATABASE_URL", "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable"),
		RedisURL:          getEnv("REDIS_URL", "redis://localhost:6379"),
		R2AccountID:       getEnv("R2_ACCOUNT_ID", "local"),
		R2AccessKeyID:     getEnv("R2_ACCESS_KEY_ID", "playhead"),
		R2SecretAccessKey: getEnv("R2_SECRET_ACCESS_KEY", "playheadsecret"),
		R2Bucket:          getEnv("R2_BUCKET", "playhead-dev"),
		R2Endpoint:        getEnv("R2_ENDPOINT", "http://localhost:9000"),
		SessionSecret:     getEnv("SESSION_SECRET", "default-dev-secret-at-least-32-characters-long"),
		GoogleClientID:    getEnv("GOOGLE_CLIENT_ID", ""),
		ResendAPIKey:      getEnv("RESEND_API_KEY", ""),
		SMTPHost:          getEnv("SMTP_HOST", "localhost"),
		SMTPPort:          1025,
		Environment:       getEnv("ENV", "development"),
	}
}

func getEnv(key, fallback string) string {
	if val := os.Getenv(key); val != "" {
		return val
	}
	return fallback
}
