-- +goose Up
-- Enable pgcrypto / gen_random_uuid
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    avatar_url TEXT,
    password_hash TEXT,
    google_id TEXT,
    email_verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    user_agent TEXT,
    ip TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_token_hash ON sessions(token_hash);

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(255) NOT NULL UNIQUE,
    logo_key TEXT,
    brand_color VARCHAR(32) DEFAULT '#0066FF',
    plan VARCHAR(32) NOT NULL DEFAULT 'trial',
    status VARCHAR(32) NOT NULL DEFAULT 'trialing',
    trial_ends_at TIMESTAMPTZ,
    seats INT NOT NULL DEFAULT 1,
    storage_blocks INT NOT NULL DEFAULT 0,
    storage_limit_bytes BIGINT NOT NULL DEFAULT 26843545600, -- 25 GB default trial
    storage_used_bytes BIGINT NOT NULL DEFAULT 0,
    storage_reserved_bytes BIGINT NOT NULL DEFAULT 0,
    verified BOOLEAN NOT NULL DEFAULT FALSE,
    paddle_customer_id TEXT,
    paddle_subscription_id TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_companies_slug ON companies(slug);
CREATE INDEX idx_companies_status ON companies(status);

CREATE TABLE memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(32) NOT NULL DEFAULT 'member', -- owner, admin, member
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_company_user UNIQUE(company_id, user_id)
);
CREATE INDEX idx_memberships_company_id ON memberships(company_id);
CREATE INDEX idx_memberships_user_id ON memberships(user_id);

CREATE TABLE invites (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(32) NOT NULL DEFAULT 'member',
    project_id UUID,
    token_hash VARCHAR(64) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_invites_company_id ON invites(company_id);
CREATE INDEX idx_invites_company_email ON invites(company_id, email);
CREATE INDEX idx_invites_token_hash ON invites(token_hash);

-- +goose Down
DROP TABLE IF EXISTS invites;
DROP TABLE IF EXISTS memberships;
DROP TABLE IF EXISTS companies;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
