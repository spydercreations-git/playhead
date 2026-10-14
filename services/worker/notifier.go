package worker

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/redis/go-redis/v9"

	"github.com/playhead/playhead/services/shared/authz"
	"github.com/playhead/playhead/services/shared/db"
	"github.com/playhead/playhead/services/shared/jobs"
	"github.com/playhead/playhead/services/shared/mailer"
)

type Notifier struct {
	queries *db.Queries
	mailer  *mailer.Mailer
	rdb     *redis.Client
}

func NewNotifier(queries *db.Queries, mailer *mailer.Mailer, rdb *redis.Client) *Notifier {
	return &Notifier{
		queries: queries,
		mailer:  mailer,
		rdb:     rdb,
	}
}

func formatTimecode(ms int32) string {
	totalSec := ms / 1000
	min := totalSec / 60
	sec := totalSec % 60
	return fmt.Sprintf("%02d:%02d", min, sec)
}

func (n *Notifier) isTeamMember(ctx context.Context, companyID pgtype.UUID, userID pgtype.UUID) bool {
	if !userID.Valid || !companyID.Valid {
		return false
	}
	_, err := n.queries.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    userID,
	})
	return err == nil
}

func (n *Notifier) resolvePerson(ctx context.Context, companyID pgtype.UUID, user db.User) authz.Person {
	person := authz.Person{
		UserID:    uuid.UUID(user.ID.Bytes),
		Email:     user.Email,
		CompanyID: uuid.UUID(companyID.Bytes),
	}
	mem, err := n.queries.GetMembership(ctx, db.GetMembershipParams{
		CompanyID: companyID,
		UserID:    user.ID,
	})
	if err == nil {
		person.Role = mem.Role
	} else {
		// Check if client contact
		contacts, cErr := n.queries.GetClientContactsByEmail(ctx, user.Email)
		if cErr == nil && len(contacts) > 0 {
			person.Role = "client"
		}
	}
	return person
}

// ProcessGroupedCommentsNotification collects pending comments for an item within 5 min window,
// groups them, enforces permissions & mention checks, and sends ONE email per recipient.
func (n *Notifier) ProcessGroupedCommentsNotification(ctx context.Context, payload jobs.GroupedCommentNotificationPayload) error {
	if n.mailer == nil {
		return nil
	}

	compUUID, err := uuid.Parse(payload.CompanyID)
	if err != nil {
		return fmt.Errorf("invalid company id: %w", err)
	}
	companyID := pgtype.UUID{Bytes: compUUID, Valid: true}

	itemUUID, err := uuid.Parse(payload.ItemID)
	if err != nil {
		return fmt.Errorf("invalid item id: %w", err)
	}
	itemID := pgtype.UUID{Bytes: itemUUID, Valid: true}

	// 1. Retrieve pending comment IDs from Redis list if available
	var commentIDs []string
	if n.rdb != nil {
		key := fmt.Sprintf("playhead:pending_comments:%s", payload.ItemID)
		commentIDs, _ = n.rdb.LRange(ctx, key, 0, -1).Result()
		_ = n.rdb.Del(ctx, key).Err()
	}

	// 2. Load the actual comment records
	var comments []db.Comment
	seenCommentIDs := make(map[uuid.UUID]bool)

	if len(commentIDs) > 0 {
		for _, cidStr := range commentIDs {
			cUUID, pErr := uuid.Parse(cidStr)
			if pErr != nil || seenCommentIDs[cUUID] {
				continue
			}
			c, cErr := n.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
				ID:        pgtype.UUID{Bytes: cUUID, Valid: true},
				CompanyID: companyID,
			})
			if cErr == nil && !c.DeletedAt.Valid {
				seenCommentIDs[cUUID] = true
				comments = append(comments, c)
			}
		}
	}

	// Fallback if Redis was empty or not used: load recent comments from last 10 minutes
	if len(comments) == 0 {
		if latestVer, err := n.queries.GetLatestFileVersion(ctx, itemID); err == nil {
			allComments, err := n.queries.ListCommentsByItemVersion(ctx, db.ListCommentsByItemVersionParams{
				CompanyID: companyID,
				ItemID:    itemID,
				VersionID: latestVer.ID,
				Column4:   true,
			})
			if err == nil {
				cutoff := time.Now().Add(-10 * time.Minute)
				for _, c := range allComments {
					if c.CreatedAt.Time.After(cutoff) {
						cUUID := uuid.UUID(c.ID.Bytes)
						if !seenCommentIDs[cUUID] {
							seenCommentIDs[cUUID] = true
							comments = append(comments, db.Comment{
								ID:              c.ID,
								CompanyID:       c.CompanyID,
								ItemID:          c.ItemID,
								VersionID:       c.VersionID,
								ParentID:        c.ParentID,
								AuthorUserID:    c.AuthorUserID,
								AuthorVisitorID: c.AuthorVisitorID,
								AuthorName:      c.AuthorName,
								AuthorEmail:     c.AuthorEmail,
								Body:            c.Body,
								Visibility:      c.Visibility,
								TimecodeStartMs: c.TimecodeStartMs,
								TimecodeEndMs:   c.TimecodeEndMs,
								CreatedAt:       c.CreatedAt,
							})
						}
					}
				}
			}
		}
	}

	if len(comments) == 0 {
		return nil
	}

	// 3. Load item and project
	item, err := n.queries.GetItemByID(ctx, db.GetItemByIDParams{
		ID:        itemID,
		CompanyID: companyID,
	})
	if err != nil {
		return fmt.Errorf("item not found: %w", err)
	}

	proj, err := n.queries.GetProjectByID(ctx, db.GetProjectByIDParams{
		ID:        item.ProjectID,
		CompanyID: companyID,
	})
	if err != nil {
		return fmt.Errorf("project not found: %w", err)
	}

	projTarget := authz.ProjectTarget{
		ID:        uuid.UUID(proj.ID.Bytes),
		CompanyID: uuid.UUID(proj.CompanyID.Bytes),
		ClientID:  uuid.UUID(proj.ClientID.Bytes),
	}
	itemTarget := authz.ItemTarget{
		ID:        uuid.UUID(item.ID.Bytes),
		ProjectID: uuid.UUID(item.ProjectID.Bytes),
		CompanyID: uuid.UUID(item.CompanyID.Bytes),
		CreatedBy: uuid.UUID(item.CreatedBy.Bytes),
	}

	// 4. Group comments per recipient
	type recipientKey struct {
		UserID uuid.UUID
		Email  string
		Name   string
		IsTeam bool
	}

	recipientComments := make(map[uuid.UUID][]mailer.NotificationComment)
	recipientMeta := make(map[uuid.UUID]recipientKey)

	for _, comment := range comments {
		tcStr := ""
		if comment.TimecodeStartMs.Valid {
			tcStr = formatTimecode(comment.TimecodeStartMs.Int32)
		}
		commentItem := mailer.NotificationComment{
			AuthorName:  comment.AuthorName,
			TimecodeStr: tcStr,
			Body:        comment.Body,
		}

		// Candidate recipients for this comment
		candidateUserIDs := make(map[uuid.UUID]bool)
		isExplicitMention := make(map[uuid.UUID]bool)

		// 4a. Creator of the item
		if item.CreatedBy.Valid && item.CreatedBy != comment.AuthorUserID {
			candidateUserIDs[uuid.UUID(item.CreatedBy.Bytes)] = true
		}

		// 4b. Parent comment author (if reply)
		if comment.ParentID.Valid {
			parent, pErr := n.queries.GetCommentByID(ctx, db.GetCommentByIDParams{
				ID:        comment.ParentID,
				CompanyID: companyID,
			})
			if pErr == nil && parent.AuthorUserID.Valid && parent.AuthorUserID != comment.AuthorUserID {
				candidateUserIDs[uuid.UUID(parent.AuthorUserID.Bytes)] = true
			}
		}

		// 4c. Mentions: Parse mentions and STRICTLY enforce AccessItem CanView (Requirement 3)
		mentionedUsers := n.parseMentionedUsers(ctx, companyID, comment.Body)
		for _, mUser := range mentionedUsers {
			mUID := uuid.UUID(mUser.ID.Bytes)
			if mUID == uuid.UUID(comment.AuthorUserID.Bytes) {
				continue
			}

			// Requirement 3: Only notify mentioned people who can view this item (AccessItem CanView). Ignore mentions of anyone else!
			mPerson := n.resolvePerson(ctx, companyID, mUser)
			mAccess, aErr := authz.AccessItem(ctx, n.queries, mPerson, projTarget, itemTarget)
			if aErr != nil || !mAccess.CanView() {
				slog.Info("ignoring mention of user without view access to item", "user_id", mUID, "item_id", payload.ItemID)
				continue
			}

			candidateUserIDs[mUID] = true
			isExplicitMention[mUID] = true
		}

		// Filter each candidate recipient
		for rUID := range candidateUserIDs {
			u, uErr := n.queries.GetUserByID(ctx, pgtype.UUID{Bytes: rUID, Valid: true})
			if uErr != nil || u.Email == "" || u.Email == comment.AuthorEmail {
				continue
			}

			isTeam := n.isTeamMember(ctx, companyID, pgtype.UUID{Bytes: rUID, Valid: true})

			// Team-only comments: NEVER notify client contacts or non-team members!
			if comment.Visibility == "team" && !isTeam {
				continue
			}

			// Check project bell notification preference
			pref, pErr := n.queries.GetProjectNotificationPref(ctx, db.GetProjectNotificationPrefParams{
				UserID:    pgtype.UUID{Bytes: rUID, Valid: true},
				ProjectID: item.ProjectID,
			})
			if pErr == nil {
				if pref.Level == "off" {
					continue
				}
				if pref.Level == "only_mentions" && !isExplicitMention[rUID] && rUID != uuid.UUID(item.CreatedBy.Bytes) {
					continue
				}
			}

			// Check user global notification preference
			uPrefs, _ := n.queries.ListUserNotificationPrefs(ctx, pgtype.UUID{Bytes: rUID, Valid: true})
			emailEnabled := true
			for _, up := range uPrefs {
				if up.EventType == "comment" && !up.Email {
					emailEnabled = false
					break
				}
			}
			if !emailEnabled {
				continue
			}

			recipientComments[rUID] = append(recipientComments[rUID], commentItem)
			recipientMeta[rUID] = recipientKey{
				UserID: rUID,
				Email:  u.Email,
				Name:   u.Name,
				IsTeam: isTeam,
			}
		}
	}

	// 5. Send ONE email per recipient listing all their accessible new comments
	itemURL := fmt.Sprintf("%s/projects/%s/review/%s", strings.TrimRight(n.mailer.FrontendURL, "/"), pgUUIDToString(item.ProjectID), pgUUIDToString(item.ID))
	for rUID, cList := range recipientComments {
		if len(cList) == 0 {
			continue
		}
		meta := recipientMeta[rUID]
		err := n.mailer.SendGroupedCommentsNotificationEmail(meta.Email, meta.Name, item.Name, itemURL, cList)
		if err != nil {
			slog.Error("failed to send grouped comments notification email", "to", meta.Email, "error", err)
		} else {
			slog.Info("sent grouped comments notification email", "to", meta.Email, "comments_count", len(cList), "item_id", payload.ItemID)
		}
	}

	return nil
}

func (n *Notifier) parseMentionedUsers(ctx context.Context, companyID pgtype.UUID, body string) []db.User {
	var results []db.User
	seen := make(map[uuid.UUID]bool)

	words := strings.Fields(body)
	for _, w := range words {
		if strings.HasPrefix(w, "@") {
			token := strings.Trim(strings.TrimPrefix(w, "@"), ",.!?")
			if token == "" {
				continue
			}
			// Check by email
			if u, err := n.queries.GetUserByEmail(ctx, token); err == nil {
				uID := uuid.UUID(u.ID.Bytes)
				if !seen[uID] {
					seen[uID] = true
					results = append(results, u)
				}
			}
		}
	}

	// Also check company memberships by name matching
	members, err := n.queries.GetMembershipsForCompany(ctx, companyID)
	if err == nil {
		for _, m := range members {
			nameTag := "@" + strings.ToLower(m.UserName)
			firstNameTag := "@" + strings.ToLower(strings.Fields(m.UserName)[0])
			lowerBody := strings.ToLower(body)

			if strings.Contains(lowerBody, nameTag) || strings.Contains(lowerBody, firstNameTag) {
				mUID := uuid.UUID(m.UserID.Bytes)
				if !seen[mUID] {
					if u, err := n.queries.GetUserByID(ctx, m.UserID); err == nil {
						seen[mUID] = true
						results = append(results, u)
					}
				}
			}
		}
	}

	return results
}
