.PHONY: all dev test stop migrate infra-up infra-down

# Tool paths
GO := $(shell which go 2>/dev/null || echo $(HOME)/.local/go/bin/go)
DOCKER := $(shell which docker 2>/dev/null || echo /Applications/Docker.app/Contents/Resources/bin/docker)
GOOSE := $(shell which goose 2>/dev/null || echo $(HOME)/go/bin/goose)
PATH := $(HOME)/.local/go/bin:$(HOME)/go/bin:/Applications/Docker.app/Contents/Resources/bin:$(PATH)
export PATH
export GOTOOLCHAIN := local

# Database URL for migrations
DATABASE_URL ?= postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable

all: dev

# Start local infrastructure, apply database migrations, and boot backend & frontend
dev:
	@echo "==> Starting local infrastructure (Postgres, Redis, MinIO, Mailpit, Worker)..."
	@$(DOCKER) compose -f infra/docker-compose.yml up -d postgres redis minio mailpit worker
	@echo "==> Waiting for PostgreSQL to be ready..."
	@until $(DOCKER) exec playhead-postgres pg_isready -U postgres -d playhead_dev >/dev/null 2>&1; do sleep 1; done
	@echo "==> Applying database migrations..."
	@$(GOOSE) -dir db/migrations postgres "$(DATABASE_URL)" up
	@echo "==> Starting Playhead services..."
	@echo "API will run on http://localhost:8080"
	@echo "Web will run on http://localhost:3000"
	@echo "Collab will run on ws://localhost:8082"
	@echo "MinIO Console on http://localhost:9001"
	@echo "Mailpit Web on http://localhost:8025"
	@(trap 'kill 0' SIGINT; cd services/api && $(GO) run cmd/server/main.go & cd services/collab && npm run dev & cd apps/web && npm run dev & wait)

# Re-queue all pending video versions
requeue:
	@echo "==> Re-queueing all pending video versions..."
	@$(DOCKER) exec playhead-worker /bin/worker -requeue

# Run test suites across the stack
test:
	@echo "==> Running Go backend unit and package tests..."
	@$(GO) test -v ./services/api/... ./services/shared/... ./services/worker/...
	@echo "==> Testing and compiling Collab service..."
	@cd services/collab && npm test && npm run build
	@echo "==> Running frontend type check..."
	@cd apps/web && npm run typecheck
	@echo "==> All tests passed successfully!"

# Apply goose migrations
migrate:
	@echo "==> Applying database migrations..."
	@$(GOOSE) -dir db/migrations postgres "$(DATABASE_URL)" up

# Stop all background servers and docker containers
stop:
	@echo "==> Stopping Docker containers..."
	@$(DOCKER) compose -f infra/docker-compose.yml down
	@echo "==> Terminating any leftover local server processes..."
	@-pkill -f "next-dev" 2>/dev/null || true
	@-pkill -f "cmd/server/main.go" 2>/dev/null || true
	@-pkill -f "cmd/worker/main.go" 2>/dev/null || true
	@-pkill -f "tsx watch src/index.ts" 2>/dev/null || true
	@echo "==> All stopped cleanly."

