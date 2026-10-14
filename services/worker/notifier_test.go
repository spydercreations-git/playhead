package worker_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/redis/go-redis/v9"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/jobs"
	"github.com/playhead/playhead/services/shared/mailer"
	"github.com/playhead/playhead/services/shared/plans"
	"github.com/playhead/playhead/services/worker"
)

type mailpitMessage struct {
	ID string `json:"ID"`
	To []struct {
		Address string `json:"Address"`
	} `json:"To"`
	Subject string `json:"Subject"`
	Snippet string `json:"Snippet"`
}

type mailpitResponse struct {
	Total    int              `json:"total"`
	Messages []mailpitMessage `json:"messages"`
}

func getMailpitMessages(t *testing.T) []mailpitMessage {
	resp, err := http.Get("http://localhost:8025/api/v1/messages")
	require.NoError(t, err)
	defer resp.Body.Close()

	var data mailpitResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&data))
	return data.Messages
}

func clearMailpit(t *testing.T) {
	req, err := http.NewRequest("DELETE", "http://localhost:8025/api/v1/messages", nil)
	require.NoError(t, err)
	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()
}

func TestGroupedCommentNotificationsAndMentions(t *testing.T) {
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://postgres:postgres@localhost:5432/playhead_dev?sslmode=disable"
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dbURL)
	require.NoError(t, err)
	defer pool.Close()

	queries := db.New(pool)

	rdb := redis.NewClient(&redis.Options{
		Addr: "localhost:6379",
	})
	defer rdb.Close()
	if err := rdb.Ping(ctx).Err(); err != nil {
		t.Skip("redis not accessible, skipping integration test")
	}

	mailClient := mailer.New(mailer.Config{
		SMTPHost:    "localhost",
		SMTPPort:    1025,
		FrontendURL: "http://localhost:3000",
	})

	notifier := worker.NewNotifier(queries, mailClient, rdb)

	// 1. Clear existing emails in Mailpit
	clearMailpit(t)

	// 2. Setup Company & Users
	tag := time.Now().UnixNano()
	creatorEmail := fmt.Sprintf("creator-%d@grouped-test.com", tag)
	memberEmail := fmt.Sprintf("member-%d@grouped-test.com", tag)
	outsiderEmail := fmt.Sprintf("outsider-%d@grouped-test.com", tag)
	commenterEmail := fmt.Sprintf("commenter-%d@grouped-test.com", tag)

	creator, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: creatorEmail,
		Name:  "Content Creator",
	})
	require.NoError(t, err)

	member, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: memberEmail,
		Name:  "Accessible Member",
	})
	require.NoError(t, err)

	outsider, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: outsiderEmail,
		Name:  "Outsider Person",
	})
	require.NoError(t, err)

	commenter, err := queries.CreateUser(ctx, db.CreateUserParams{
		Email: commenterEmail,
		Name:  "Feedback Commenter",
	})
	require.NoError(t, err)

	company, err := queries.CreateCompany(ctx, db.CreateCompanyParams{
		Name:   fmt.Sprintf("Studio %d", tag),
		Slug:   fmt.Sprintf("studio-%d", tag),
		Plan:   plans.PlanPro,
		Status: "active",
	})
	require.NoError(t, err)

	_, _ = queries.CreateMembership(ctx, db.CreateMembershipParams{
		CompanyID: company.ID,
		UserID:    creator.ID,
		Role:      authz.RoleAdmin,
	})

	clientRec, err := queries.CreateClient(ctx, db.CreateClientParams{
		CompanyID: company.ID,
		Name:      "Test Client",
	})
	require.NoError(t, err)

	proj, err := queries.CreateProject(ctx, db.CreateProjectParams{
		CompanyID: company.ID,
		ClientID:  clientRec.ID,
		Name:      "Debounce Feature Test",
	})
	require.NoError(t, err)

	// Give Member User view access to Project
	_, err = queries.CreateGrant(ctx, db.CreateGrantParams{
		CompanyID:   company.ID,
		TargetType:  "project",
		TargetID:    proj.ID,
		Email:       member.Email,
		UserID:      member.ID,
		Level:       "viewer",
		CanDownload: true,
	})
	require.NoError(t, err)

	// Outsider gets NO grants on project or file!

	// Create Video Item created by creator
	item, err := queries.CreateItem(ctx, db.CreateItemParams{
		CompanyID: company.ID,
		ProjectID: proj.ID,
		Kind:      "file",
		Name:      "commercial-v1.mp4",
		CreatedBy: creator.ID,
		Position:  pgtype.Numeric{Int: big.NewInt(100), Valid: true},
	})
	require.NoError(t, err)

	ver, err := queries.CreateFileVersion(ctx, db.CreateFileVersionParams{
		CompanyID:     company.ID,
		ItemID:        item.ID,
		Number:        1,
		StorageKey:    "test/commercial-v1.mp4",
		SizeBytes:     1024,
		Mime:          "video/mp4",
		PreviewStatus: "ready",
		PreviewKeys:   []byte("{}"),
		UploadedBy:    creator.ID,
	})
	require.NoError(t, err)

	itemUUIDStr := uuid.UUID(item.ID.Bytes).String()
	companyUUIDStr := uuid.UUID(company.ID.Bytes).String()

	// 3. Create 5 comments on the item within 5 minutes
	// Comment 1: General note
	// Comment 2: Mentions Accessible Member
	// Comment 3: Mentions Outsider (who lacks access!)
	// Comment 4: Another note
	// Comment 5: Final note
	commentBodies := []string{
		"1. Audio mix is slightly low at start.",
		fmt.Sprintf("2. Hey @%s please review color grading here.", member.Email),
		fmt.Sprintf("3. Hey @%s check this out secret sneak peek.", outsider.Email),
		"4. Title card needs to stay on screen for 2 more seconds.",
		"5. End slate logo animation looks crisp!",
	}

	redisKey := fmt.Sprintf("playhead:pending_comments:%s", itemUUIDStr)

	for i, body := range commentBodies {
		c, err := queries.CreateComment(ctx, db.CreateCommentParams{
			CompanyID:       company.ID,
			ItemID:          item.ID,
			VersionID:       ver.ID,
			AuthorUserID:    commenter.ID,
			AuthorName:      commenter.Name,
			AuthorEmail:     commenter.Email,
			Body:            body,
			Visibility:      "everyone",
			TimecodeStartMs: pgtype.Int4{Int32: int32(i * 1000), Valid: true},
		})
		require.NoError(t, err)

		// Push to redis list as API does
		cIDStr := uuid.UUID(c.ID.Bytes).String()
		err = rdb.RPush(ctx, redisKey, cIDStr).Err()
		require.NoError(t, err)
	}

	// 4. Process the grouped comments notification task in worker
	err = notifier.ProcessGroupedCommentsNotification(ctx, jobs.GroupedCommentNotificationPayload{
		CompanyID: companyUUIDStr,
		ItemID:    itemUUIDStr,
	})
	require.NoError(t, err)

	// 5. Query Mailpit to verify exactly ONE email per recipient
	time.Sleep(200 * time.Millisecond)
	messages := getMailpitMessages(t)

	creatorEmails := 0
	memberEmails := 0
	outsiderEmails := 0

	for _, msg := range messages {
		for _, recipient := range msg.To {
			if recipient.Address == creatorEmail {
				creatorEmails++
			}
			if recipient.Address == memberEmail {
				memberEmails++
			}
			if recipient.Address == outsiderEmail {
				outsiderEmails++
			}
		}
	}

	// VERIFY:
	// 1. Creator receives EXACTLY 1 email grouping all 5 comments (NOT 5 individual emails)
	assert.Equal(t, 1, creatorEmails, "expected creator to receive exactly 1 grouped email for all 5 comments")

	// 2. Mentioned member with view access receives EXACTLY 1 email
	assert.Equal(t, 1, memberEmails, "expected accessible member to receive exactly 1 email")

	// 3. Mentioned outsider WITHOUT access receives 0 emails!
	assert.Equal(t, 0, outsiderEmails, "outsider without access must NEVER receive an email even when mentioned")
}
