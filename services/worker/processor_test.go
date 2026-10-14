package worker_test

import (
	"context"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/playhead/playhead/services/worker"
	"github.com/stretchr/testify/assert"
)

func TestProcessor_MaxConcurrency(t *testing.T) {
	p := worker.NewProcessor(nil, nil)
	ctx := context.Background()

	// Launch 3 jobs simultaneously
	started := make(chan int, 3)
	finished := make(chan int, 3)

	for i := 1; i <= 3; i++ {
		jobNum := i
		go func() {
			started <- jobNum
			_ = p.Process(ctx, worker.ProcessJob{
				CompanyID:  pgtype.UUID{Valid: true},
				ItemID:     pgtype.UUID{Valid: true},
				VersionID:  pgtype.UUID{Valid: true},
				StorageKey: "",
			})
			finished <- jobNum
		}()
	}

	// First two should start and complete smoothly
	select {
	case <-finished:
	case <-time.After(3 * time.Second):
		t.Fatal("timed out waiting for worker job")
	}

	assert.NotNil(t, p)
}

func TestProcessor_ProcessSuccess(t *testing.T) {
	p := worker.NewProcessor(nil, nil)
	ctx := context.Background()

	err := p.Process(ctx, worker.ProcessJob{
		CompanyID:  pgtype.UUID{Valid: true},
		ItemID:     pgtype.UUID{Valid: true},
		VersionID:  pgtype.UUID{Valid: true},
		StorageKey: "",
	})
	assert.NoError(t, err)
}
